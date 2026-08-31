/**
 * Fetch an asset for download and return its bytes.
 *
 * Two things this exists to prevent:
 *
 * 1. Persisting an error body as if it were file data. `/api/download` answers
 *    failures with a short message ("Forbidden", "Upstream error"), so a caller
 *    that goes straight to .blob() writes that text out under an image or video
 *    filename — a file that looks corrupt rather than an error the user can read.
 *
 * 2. Cross-origin auth redirects. When the app sits behind an access proxy and
 *    the session lapses, /api/download answers 302 to an identity provider that
 *    sends no CORS headers, so fetch() fails opaquely. Local /generated/ assets
 *    are served by app/generated/[...path] and are reachable without the proxy
 *    hop, so we request them directly and skip the redirect entirely.
 */
/** Return the same-origin path for a stored asset URL, or null if it is remote. */
export function toLocalPath(url: string): string | null {
  if (url.startsWith("/generated/")) return url;
  try {
    const u = new URL(url, window.location.origin);
    if (u.origin === window.location.origin && u.pathname.startsWith("/generated/")) {
      return u.pathname + u.search;
    }
  } catch {
    // not a parseable URL — treat as remote
  }
  return null;
}

export async function fetchAssetBlob(url: string, filename: string): Promise<Blob> {
  // Same-origin stored assets need no proxying: the caller builds its own blob
  // and sets the download filename, so Content-Disposition is not required.
  // Stored records may be absolute (ensureStorage prefixes CALLBACK_BASE_URL) or
  // relative; both denote the same local asset, and neither needs the proxy.
  const localPath = toLocalPath(url);
  const endpoint = localPath
    ? localPath
    : `/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;

  let res: Response;
  try {
    // redirect:"error" turns an auth bounce into a rejection here rather than a
    // confusing CORS failure, or worse, a login page body that looks like a file.
    res = await fetch(endpoint, { redirect: "error" });
  } catch {
    throw new Error("Download failed — you may be signed out. Reload the page and try again.");
  }

  if (!res.ok) throw new Error(`Download failed (${res.status})`);

  // A page body under an image filename is the corruption case above; refuse it
  // even if the status said 200.
  if ((res.headers.get("content-type") ?? "").includes("text/html")) {
    throw new Error("Download failed — received a page instead of the file.");
  }

  return res.blob();
}

/** Trigger a browser save for an already-fetched blob. */
export function saveBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
}
