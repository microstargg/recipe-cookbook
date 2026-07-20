const DEFAULT_MAX_DIMENSION = 2048;
const DEFAULT_MAX_BYTES = 3.5 * 1024 * 1024;
const MIN_QUALITY = 0.5;

function loadImageBitmap(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file);
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not compress this image. Try a JPEG or PNG."));
          return;
        }
        resolve(blob);
      },
      type,
      quality,
    );
  });
}

/**
 * Resize and JPEG-compress a photo so it fits under the upload size limit.
 * Phone camera files (often 8–15MB+) are reduced while keeping text readable for vision.
 */
export async function compressImageForUpload(
  file: File,
  options?: {
    maxDimension?: number;
    maxBytes?: number;
  },
): Promise<File> {
  const maxDimension = options?.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;

  if (file.size <= maxBytes && file.type.startsWith("image/")) {
    // Still decode+re-encode large-dimension files so vision gets a manageable size.
    // Skip only when both size and likely dimensions are already fine — we don't know
    // dimensions without decoding, so always run through canvas for anything over ~1.5MB.
    if (file.size <= 1.5 * 1024 * 1024) {
      return file;
    }
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await loadImageBitmap(file);
  } catch {
    throw new Error(
      "Could not read this image. Try a JPEG or PNG, or take a new photo.",
    );
  }

  try {
    const scale = Math.min(
      1,
      maxDimension / Math.max(bitmap.width, bitmap.height),
    );
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not process this image on your device.");
    }
    ctx.drawImage(bitmap, 0, 0, width, height);

    let quality = 0.85;
    let blob = await canvasToBlob(canvas, "image/jpeg", quality);

    while (blob.size > maxBytes && quality > MIN_QUALITY) {
      quality = Math.max(MIN_QUALITY, quality - 0.1);
      blob = await canvasToBlob(canvas, "image/jpeg", quality);
    }

    if (blob.size > maxBytes) {
      // Last resort: shrink further
      const shrink = Math.sqrt(maxBytes / blob.size) * 0.95;
      canvas.width = Math.max(1, Math.round(width * shrink));
      canvas.height = Math.max(1, Math.round(height * shrink));
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      blob = await canvasToBlob(canvas, "image/jpeg", MIN_QUALITY);
    }

    if (blob.size > maxBytes) {
      throw new Error(
        "Photo is still too large after compression. Try a closer crop or lower-resolution shot.",
      );
    }

    const baseName = (file.name || "photo").replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${baseName}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    bitmap.close();
  }
}
