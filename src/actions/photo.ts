"use server";

import { requireUserId } from "@/lib/require-user";
import { structureRecipeFromImageUrl } from "@/lib/llm-recipe-fallback";

export async function parseRecipeFromImageUrl(imageUrl: string) {
  await requireUserId();
  if (!imageUrl?.startsWith("https://")) {
    throw new Error("A secure image URL is required");
  }
  return structureRecipeFromImageUrl(imageUrl);
}
