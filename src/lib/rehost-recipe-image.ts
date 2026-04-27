import { put } from "@vercel/blob";

/**
 * If `BLOB_READ_WRITE_TOKEN` is set, download the image and store on Vercel Blob
 * so it survives hotlink blocks / URL changes. Otherwise returns `sourceUrl`.
 */
export async function rehostRecipeImageIfConfigured(
  sourceUrl: string,
  filenameBase: string,
): Promise<string> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return sourceUrl;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    const res = await fetch(sourceUrl, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        Accept: "image/*,*/*;q=0.8",
        "User-Agent": "RecipeCookbookBot/1.0 (+import-image)",
      },
    });
    clearTimeout(timeout);

    if (!res.ok) return sourceUrl;
    const ct = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!ct.startsWith("image/")) return sourceUrl;

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 64 || buf.length > 4 * 1024 * 1024) return sourceUrl;

    const ext =
      ct.includes("png") ? "png" :
      ct.includes("webp") ? "webp" :
      ct.includes("gif") ? "gif" :
      "jpg";

    const safe = filenameBase.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 48) || "recipe";

    const blob = await put(`url-import/${safe}-${Date.now()}.${ext}`, buf, {
      access: "public",
      addRandomSuffix: true,
    });
    return blob.url;
  } catch {
    return sourceUrl;
  }
}
