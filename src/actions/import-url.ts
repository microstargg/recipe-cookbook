"use server";

import { requireUserId } from "@/lib/require-user";
import { structureRecipeFromPlainText } from "@/lib/llm-recipe-fallback";
import { fetchAndParseUrl, type ParsedRecipe } from "@/lib/import-url";
import { recipeDraftSchema, type RecipeDraft } from "@/lib/recipe-schema";
import { rehostRecipeImageIfConfigured } from "@/lib/rehost-recipe-image";

/** Warnings that mean extraction is fuzzy and AI should re-structure page text. */
const WEAK_EXTRACTION_PATTERNS = [
  /Heuristic extraction only/i,
  /ingredients may need to be split/i,
  /structured instructions were missing or incomplete/i,
  /Recipe found in JSON-LD but no ingredients or steps/i,
];

async function finalizeImportedDraft(
  parsed: ParsedRecipe,
  pageUrl: URL,
  fields: Pick<RecipeDraft, "title" | "ingredients" | "steps" | "tags">,
  warnings: string[],
): Promise<RecipeDraft> {
  let imageUrl = parsed.coverImageUrl ?? undefined;
  if (imageUrl) {
    imageUrl = await rehostRecipeImageIfConfigured(imageUrl, fields.title);
  }
  return recipeDraftSchema.parse({
    ...fields,
    sourceUrl: pageUrl.toString(),
    notes: warnings.length ? warnings.join(" ") : undefined,
    imageUrl,
  });
}

function combinedPageText(parsed: ParsedRecipe): string {
  return [parsed.ingredients.join("\n"), parsed.steps.join("\n\n")]
    .join("\n\n")
    .trim();
}

function needsArticleAiStructure(parsed: ParsedRecipe): boolean {
  if (!process.env.TOGETHER_API_KEY) return false;
  if (parsed.source === "next-data") return false;
  if (combinedPageText(parsed).length < 25) return false;

  if (parsed.source === "readability" && parsed.steps.length > 0) return true;
  if (!parsed.ingredients.length && parsed.steps.length >= 3) return true;
  if (
    parsed.rawWarnings?.some((w) =>
      WEAK_EXTRACTION_PATTERNS.some((re) => re.test(w)),
    )
  ) {
    return true;
  }
  return false;
}

function buildArticleScrapeBody(parsed: ParsedRecipe): string {
  const chunks: string[] = [];
  if (parsed.title.trim()) {
    chunks.push(`Title (from page): ${parsed.title.trim()}`);
  }
  if (parsed.ingredients.length) {
    chunks.push(
      "Ingredient lines from structured data (may be incomplete):",
      ...parsed.ingredients.map((i) => `- ${i}`),
    );
  }
  chunks.push("", "Extracted article / method text:", parsed.steps.join("\n\n"));
  return chunks.join("\n");
}

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

  let parsed = (await fetchAndParseUrl(u.toString())).parsed;
  let warnings = [...(parsed.rawWarnings ?? [])];
  let tagsFromAi: string[] = [];

  if (
    !parsed.steps.length &&
    parsed.ingredients.length &&
    process.env.TOGETHER_API_KEY
  ) {
    const body = [
      parsed.title,
      "",
      "Ingredients:",
      ...parsed.ingredients.map((x) => `- ${x}`),
      "",
      "There are no usable step-by-step instructions in the source data. Write clear, ordered cooking steps that match this title and these ingredients. Use only reasonable home-cooking techniques.",
    ].join("\n");
    const ai = await structureRecipeFromPlainText(body);
    if (ai?.steps?.length) {
      parsed = { ...parsed, steps: ai.steps };
      if (ai.tags?.length) tagsFromAi = ai.tags;
      warnings.push(
        "Steps were generated with AI from the title and ingredients because none were found on the page; verify before cooking.",
      );
    }
  }

  if (needsArticleAiStructure(parsed)) {
    const body = buildArticleScrapeBody(parsed);
    const ai = await structureRecipeFromPlainText(body, {
      context: "article-scrape",
    });
    if (ai?.ingredients?.length && ai?.steps?.length) {
      parsed = {
        ...parsed,
        title: ai.title.trim() || parsed.title,
        ingredients: ai.ingredients,
        steps: ai.steps,
      };
      tagsFromAi = ai.tags ?? [];
      warnings = warnings.filter(
        (w) => !WEAK_EXTRACTION_PATTERNS.some((re) => re.test(w)),
      );
      const already = warnings.some((w) =>
        w.includes("structured with AI from page text"),
      );
      if (!already) {
        warnings.push(
          "Recipe was structured with AI from unstructured page text; verify ingredients and steps before cooking.",
        );
      }
    }
  }

  if (!parsed.ingredients.length && !parsed.steps.length) {
    throw new Error("Could not find recipe data on that page");
  }

  return finalizeImportedDraft(
    parsed,
    u,
    {
      title: parsed.title,
      ingredients: parsed.ingredients.length
        ? parsed.ingredients
        : ["(see steps)"],
      steps: parsed.steps.length
        ? parsed.steps
        : ["(see original page)"],
      tags: tagsFromAi,
    },
    warnings,
  );
}
