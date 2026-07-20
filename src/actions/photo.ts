"use server";

import { requireUserId } from "@/lib/require-user";
import { structureRecipeFromImageUrl } from "@/lib/llm-recipe-fallback";
import type { RecipeDraft } from "@/lib/recipe-schema";

function friendlyVisionError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (
    message.includes("model_not_available") ||
    message.includes("Unable to access model")
  ) {
    return "The vision model is unavailable on Together.ai. Set TOGETHER_VISION_MODEL to a supported vision model, or check your Together account access.";
  }
  if (message.includes("TOGETHER_API_KEY")) {
    return message;
  }
  if (message.includes("Could not extract")) {
    return message;
  }
  if (message.includes("Could not read uploaded image")) {
    return message;
  }
  console.error("[parseRecipeFromImageUrl]", err);
  return "Could not read a recipe from this photo. Try a clearer shot of the recipe text.";
}

export async function parseRecipeFromImageUrl(
  imageUrl: string,
): Promise<{ ok: true; draft: RecipeDraft } | { ok: false; error: string }> {
  try {
    await requireUserId();
    if (!imageUrl?.startsWith("https://")) {
      return { ok: false, error: "A secure image URL is required" };
    }
    const draft = await structureRecipeFromImageUrl(imageUrl);
    return { ok: true, draft };
  } catch (err) {
    return { ok: false, error: friendlyVisionError(err) };
  }
}
