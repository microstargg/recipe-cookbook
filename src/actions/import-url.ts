"use server";

import { requireUserId } from "@/lib/require-user";
import { structureRecipeFromPlainText } from "@/lib/llm-recipe-fallback";
import { fetchAndParseUrl } from "@/lib/import-url";
import { recipeDraftSchema } from "@/lib/recipe-schema";

export async function importRecipeFromUrl(url: string) {
  await requireUserId();

  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error("Invalid URL");
  }
  if (!["http:", "https:"].includes(u.protocol)) {
    throw new Error("Only http(s) URLs are allowed");
  }

  const { parsed } = await fetchAndParseUrl(u.toString());
  const warnings = [...(parsed.rawWarnings ?? [])];

  if (
    parsed.source === "readability" &&
    (parsed.steps.length > 0 || !parsed.ingredients.length) &&
    process.env.TOGETHER_API_KEY
  ) {
    const body = parsed.steps.join("\n");
    const ai = await structureRecipeFromPlainText(body);
    if (ai) {
      return recipeDraftSchema.parse({
        ...ai,
        sourceUrl: u.toString(),
        notes: warnings.length ? warnings.join(" ") : undefined,
      });
    }
  }

  if (!parsed.ingredients.length && !parsed.steps.length) {
    throw new Error("Could not find recipe data on that page");
  }

  return recipeDraftSchema.parse({
    title: parsed.title,
    ingredients: parsed.ingredients.length ? parsed.ingredients : ["(see steps)"],
    steps: parsed.steps.length ? parsed.steps : ["(see original page)"],
    sourceUrl: u.toString(),
    notes: warnings.length ? warnings.join(" ") : undefined,
  });
}
