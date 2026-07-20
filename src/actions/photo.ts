"use server";

import { requireUserId } from "@/lib/require-user";
import { structureRecipeFromImageUrl } from "@/lib/llm-recipe-fallback";
import type { RecipeDraft } from "@/lib/recipe-schema";

function friendlyVisionError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("GOOGLE_GENERATIVE_AI_API_KEY")) {
    return message;
  }
  if (
    message.includes("API key not valid") ||
    message.includes("API_KEY_INVALID")
  ) {
    return "Google AI API key is missing or invalid. Add GOOGLE_GENERATIVE_AI_API_KEY in Vercel (free key: https://aistudio.google.com/apikey).";
  }
  if (
    message.includes("no longer available") ||
    message.includes("NOT_FOUND") ||
    message.includes("is not found")
  ) {
    return "The Gemini model is unavailable. Update GEMINI_VISION_MODEL (tried gemini-3.1-flash-lite and fallbacks).";
  }
  if (
    message.toLowerCase().includes("high demand") ||
    message.toLowerCase().includes("try again later")
  ) {
    return "Gemini is busy right now. Wait a minute and try again — we will also try lighter models automatically.";
  }
  if (message.includes("Could not extract")) {
    return message;
  }
  if (message.includes("Could not read uploaded image")) {
    return message;
  }
  // Prefer the real provider message over a vague "clearer shot" hint.
  const cleaned = message.replace(/^Error:\s*/i, "").trim();
  if (cleaned && cleaned.length < 280 && !cleaned.includes("at ignore-listed")) {
    console.error("[parseRecipeFromImageUrl]", err);
    return cleaned;
  }
  console.error("[parseRecipeFromImageUrl]", err);
  return "Could not read a recipe from this photo. Try again in a moment.";
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
