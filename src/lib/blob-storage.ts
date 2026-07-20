import { get, put, type PutBlobResult } from "@vercel/blob";

/** Matches the store access mode in the Vercel dashboard. */
export const BLOB_ACCESS = "private" as const;

export function hasBlobToken(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

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

export async function putPrivateBlob(
  pathname: string,
  body: Parameters<typeof put>[1],
  options?: { contentType?: string; addRandomSuffix?: boolean },
): Promise<PutBlobResult> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not configured");
  }
  return put(pathname, body, {
    access: BLOB_ACCESS,
    addRandomSuffix: options?.addRandomSuffix ?? true,
    contentType: options?.contentType,
    token,
  });
}

export async function getPrivateBlobBytes(
  urlOrPathname: string,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not configured");
  }

  const result = await get(urlOrPathname, {
    access: BLOB_ACCESS,
    token,
  });

  if (!result || result.statusCode !== 200 || !result.stream) {
    throw new Error("Could not read uploaded image from storage");
  }

  const bytes = new Uint8Array(await new Response(result.stream).arrayBuffer());
  return { bytes, contentType: result.blob.contentType };
}
