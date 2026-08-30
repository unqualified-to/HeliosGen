/**
 * GET /generated/<folder>/<file>
 *
 * Serves guest-mode generated assets from disk at request time.
 *
 * Why this exists: these files used to live in `public/generated` and be served
 * by Next's static handler. Next builds its list of public files once at boot,
 * so a freshly generated image 404'd until the server restarted (and `/_next/image`
 * then returned 400, because its upstream fetch failed). Reading from disk per
 * request removes that coupling entirely.
 *
 * The `/generated/...` URL is unchanged, so stored records and `/api/download`
 * keep working without migration.
 */
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { extname, join, resolve, sep } from "path";
import { Readable } from "stream";
import { NextRequest, NextResponse } from "next/server";
import { GENERATED_DIR } from "@/lib/guest/storagePaths";

const MIME: Record<string, string> = {
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif":  "image/gif",
  ".mp4":  "video/mp4",
  ".webm": "video/webm",
};

const ROOT = resolve(GENERATED_DIR);

function toWeb(stream: NodeJS.ReadableStream): ReadableStream {
  return Readable.toWeb(stream as Readable) as unknown as ReadableStream;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;

  // Reject traversal before touching the filesystem. Segments arrive URL-decoded,
  // so a literal ".." or an absolute segment must be refused here.
  if (!segments?.length || segments.some((s) => s === ".." || s === "." || s.includes("\0"))) {
    return new NextResponse("Not found", { status: 404 });
  }

  const filePath = resolve(join(ROOT, ...segments));
  // Re-check after resolution: the only way out of ROOT is a path that no longer
  // has it as a prefix. The `sep` guard stops "/…/generated-evil" matching "/…/generated".
  if (filePath !== ROOT && !filePath.startsWith(ROOT + sep)) {
    return new NextResponse("Not found", { status: 404 });
  }

  let info;
  try {
    info = await stat(filePath);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
  if (!info.isFile()) return new NextResponse("Not found", { status: 404 });

  const contentType = MIME[extname(filePath).toLowerCase()] ?? "application/octet-stream";
  // Filenames are UUIDs and content is hash-deduplicated, so a given URL never
  // changes contents — safe to cache indefinitely.
  const baseHeaders = {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=31536000, immutable",
    "Accept-Ranges": "bytes",
  };

  // Range support matters for mp4/webm: without it browsers cannot seek.
  const range = req.headers.get("range");
  const m = range?.match(/^bytes=(\d*)-(\d*)$/);
  if (m && (m[1] || m[2])) {
    const size = info.size;
    let start: number;
    let end: number;
    if (m[1]) {
      start = parseInt(m[1], 10);
      end = m[2] ? parseInt(m[2], 10) : size - 1;
    } else {
      // Suffix form "bytes=-N": the final N bytes.
      const suffix = parseInt(m[2], 10);
      start = Math.max(0, size - suffix);
      end = size - 1;
    }
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
      return new NextResponse("Range not satisfiable", {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` },
      });
    }
    end = Math.min(end, size - 1);
    return new NextResponse(toWeb(createReadStream(filePath, { start, end })), {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": String(end - start + 1),
      },
    });
  }

  return new NextResponse(toWeb(createReadStream(filePath)), {
    status: 200,
    headers: { ...baseHeaders, "Content-Length": String(info.size) },
  });
}
