import { get } from "@vercel/blob";
import { auth } from "@/lib/auth/server";
import { BLOB_ACCESS, isVercelBlobUrl } from "@/lib/blob-storage";

export const runtime = "nodejs";

/**
 * Authenticated proxy for private Vercel Blob images (img tags cannot send the Blob token).
 */
export async function GET(request: Request) {
  const { data: session } = await auth.getSession({
    headers: request.headers,
  } as Parameters<typeof auth.getSession>[0]);
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url).searchParams.get("url");
  if (!url || !isVercelBlobUrl(url)) {
    return Response.json({ error: "Invalid media URL" }, { status: 400 });
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return Response.json({ error: "Storage not configured" }, { status: 500 });
  }

  try {
    const result = await get(url, {
      access: BLOB_ACCESS,
      token,
      ifNoneMatch: request.headers.get("if-none-match") ?? undefined,
    });

    if (!result) {
      return new Response("Not found", { status: 404 });
    }

    if (result.statusCode === 304) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: result.blob.etag,
          "Cache-Control": "private, no-cache",
        },
      });
    }

    return new Response(result.stream, {
      headers: {
        "Content-Type": result.blob.contentType,
        "X-Content-Type-Options": "nosniff",
        ETag: result.blob.etag,
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (err) {
    console.error("[api/media]", err);
    return new Response("Failed to load media", { status: 502 });
  }
}
