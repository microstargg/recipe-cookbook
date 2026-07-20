/** Pure URL helpers — safe to import from Client Components (no @vercel/blob). */

export function isVercelBlobUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
}

/** Browser-safe URL: private blobs are served through our authenticated proxy. */
export function toAppMediaUrl(url: string): string {
  if (!isVercelBlobUrl(url)) return url;
  return `/api/media?url=${encodeURIComponent(url)}`;
}
