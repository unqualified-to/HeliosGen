/**
 * GET /api/download?url=<encoded-url>&filename=<name>
 *
 * Server-side proxy that fetches the asset and returns it with
 * Content-Disposition: attachment so the browser saves it to disk.
 * Only allowed origins are proxied.
 */
import { NextRequest, NextResponse } from "next/server";
import { GUEST_MODE } from "@/lib/guestMode";

const ALLOWED_ORIGINS = [
  process.env.R2_PUBLIC_URL ?? "",
  "https://cdn.kie.ai",
  "https://api.kie.ai",
  "https://replicate.delivery",
  "https://pbxt.replicate.delivery",
].filter(Boolean).map((o) => o.replace(/\/$/, ""));

/** Hosts trusted by suffix, kept in step with images.remotePatterns in next.config.ts.
 *  Kie.ai serves finished video from tempfile.aiquickdraw.com, which the image
 *  optimizer already trusted while this route did not — so video downloads 403'd. */
const ALLOWED_HOST_SUFFIXES = [".aiquickdraw.com", ".replicate.delivery", ".r2.dev"];

/** Our own public origin: ensureStorage() returns absolute URLs when
 *  CALLBACK_BASE_URL is set, so stored records may point back at us. */
const SELF_ORIGIN = process.env.CALLBACK_BASE_URL?.replace(/\/$/, "") ?? "";

function isAllowed(url: string): boolean {
  if (GUEST_MODE && url.startsWith("/generated/")) return true; // local disk, served same-origin
  if (SELF_ORIGIN && url.startsWith(`${SELF_ORIGIN}/generated/`)) return true;
  if (ALLOWED_ORIGINS.some((origin) => url.startsWith(origin))) return true;
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" && ALLOWED_HOST_SUFFIXES.some((s) => hostname.endsWith(s));
  } catch {
    return false;
  }
}

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  const filename = req.nextUrl.searchParams.get("filename") ?? "download";

  if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });
  if (!isAllowed(url)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let fetchUrl = url;
  if (GUEST_MODE && url.startsWith("/generated/")) {
    const resolved = new URL(url, req.nextUrl.origin);
    // Re-check after normalization: rejects "/generated/../api/..." traversal
    // that would otherwise turn this proxy into same-origin SSRF.
    if (!resolved.pathname.startsWith("/generated/")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    fetchUrl = resolved.toString();
  }

  let upstream: Response;
  try {
    upstream = await fetch(fetchUrl);
  } catch {
    return NextResponse.json({ error: "Fetch failed" }, { status: 502 });
  }

  if (!upstream.ok) {
    return NextResponse.json({ error: "Upstream error" }, { status: upstream.status });
  }

  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
