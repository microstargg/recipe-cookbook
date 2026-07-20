import { put } from "@vercel/blob";
import { auth } from "@/lib/auth/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { data: session } = await auth.getSession({
    headers: request.headers,
  } as Parameters<typeof auth.getSession>[0]);
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  // Use Blob: some mobile runtimes hand FormData entries as Blob, not File.
  if (!(file instanceof Blob) || file.size === 0) {
    return Response.json({ error: "No file" }, { status: 400 });
  }
  // Client compresses phone photos first; keep a hard cap for safety.
  if (file.size > 4 * 1024 * 1024) {
    return Response.json(
      {
        error:
          "File too large (max 4MB). If this is a phone photo, try again — it should compress automatically.",
      },
      { status: 400 },
    );
  }

  const name =
    (file instanceof File && file.name) || `upload-${Date.now()}.jpg`;
  const blob = await put(name, file, {
    access: "public",
    addRandomSuffix: true,
    contentType: file.type || "image/jpeg",
  });

  return Response.json({ url: blob.url });
}
