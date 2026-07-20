import { auth } from "@/lib/auth/server";
import { hasBlobToken, putPrivateBlob } from "@/lib/blob-storage";

export const runtime = "nodejs";

function isUploadable(
  value: FormDataEntryValue | null,
): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    "arrayBuffer" in value &&
    typeof (value as File).arrayBuffer === "function" &&
    "size" in value &&
    typeof (value as File).size === "number" &&
    (value as File).size > 0
  );
}

export async function POST(request: Request) {
  try {
    const { data: session } = await auth.getSession({
      headers: request.headers,
    } as Parameters<typeof auth.getSession>[0]);
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasBlobToken()) {
      return Response.json(
        {
          error:
            "Image storage is not configured (BLOB_READ_WRITE_TOKEN missing).",
        },
        { status: 500 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    // Duck-type: `instanceof Blob` can fail across Node/undici realms on Vercel.
    if (!isUploadable(file)) {
      return Response.json({ error: "No file" }, { status: 400 });
    }
    if (file.size > 4 * 1024 * 1024) {
      return Response.json(
        {
          error:
            "File too large (max 4MB). If this is a phone photo, try again — it should compress automatically.",
        },
        { status: 400 },
      );
    }

    const rawName =
      file instanceof File && file.name ? file.name : `upload-${Date.now()}.jpg`;
    const safeName = rawName.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
    const contentType =
      (file.type && file.type.startsWith("image/") && file.type) ||
      "image/jpeg";

    // Buffer is more reliable than passing the FormData Blob into @vercel/blob.
    const buf = Buffer.from(await file.arrayBuffer());
    const blob = await putPrivateBlob(`photo-import/${safeName}`, buf, {
      contentType,
      addRandomSuffix: true,
    });

    return Response.json({ url: blob.url });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Upload failed unexpectedly";
    console.error("[api/upload]", message, err);
    return Response.json({ error: message }, { status: 500 });
  }
}
