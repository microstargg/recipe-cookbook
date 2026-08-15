"use server";

import { requireUserId } from "@/lib/require-user";
import {
  hasLlmApiKey,
  structureRecipeFromPlainText,
} from "@/lib/llm-recipe-fallback";
import { fetchAndParseUrl, type ParsedRecipe } from "@/lib/import-url";
import {
  fetchInstagramRecipeSource,
  isInstagramUrl,
} from "@/lib/import-instagram";
import { recipeDraftSchema, type RecipeDraft } from "@/lib/recipe-schema";
import { formatIngredient } from "@/lib/ingredient-utils";
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
  fields: Pick<
    RecipeDraft,
    "title" | "ingredients" | "steps" | "tags" | "servings" | "servingsLabel"
  >,
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

async function importRecipeFromInstagram(pageUrl: URL): Promise<RecipeDraft> {
  if (!hasLlmApiKey()) {
    throw new Error(
      "Instagram import needs GOOGLE_GENERATIVE_AI_API_KEY (get a free key at https://aistudio.google.com/apikey).",
    );
  }

  const extracted = await fetchInstagramRecipeSource(pageUrl);
  const ai = await structureRecipeFromPlainText(extracted.bodyText, {
    context: "instagram",
  });
  if (!ai?.ingredients.length || !ai.steps.length) {
    throw new Error(
      "Could not find a recipe in that Instagram post. If the recipe is only in the video, import a screenshot instead.",
    );
  }

  const parsed: ParsedRecipe = {
    title: ai.title,
    ingredients: ai.ingredients,
    steps: ai.steps,
    source: "readability",
    coverImageUrl: extracted.coverImageUrl,
    rawWarnings: extracted.warnings,
  };

  return finalizeImportedDraft(
    parsed,
    pageUrl,
    {
      title: ai.title,
      ingredients: ai.ingredients,
      steps: ai.steps,
      tags: ai.tags ?? [],
      servings: ai.servings ?? null,
      servingsLabel: ai.servingsLabel ?? null,
    },
    [
      ...extracted.warnings,
      "Recipe was structured with AI from the Instagram caption and comments; verify before cooking.",
    ],
  );
}

function combinedPageText(parsed: ParsedRecipe): string {
  return [
    parsed.ingredients.map(formatIngredient).join("\n"),
    parsed.steps.join("\n\n"),
  ]
    .join("\n\n")
    .trim();
}

function needsArticleAiStructure(parsed: ParsedRecipe): boolean {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) return false;
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
      ...parsed.ingredients.map((i) => `- ${formatIngredient(i)}`),
    );
  }
  chunks.push("", "Extracted article / method text:", parsed.steps.join("\n\n"));
  return chunks.join("\n");
}

export async function importRecipeFromUrl(
  url: string,
): Promise<{ ok: true; draft: RecipeDraft } | { ok: false; error: string }> {
  try {
    await requireUserId();

    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return { ok: false, error: "Invalid URL" };
    }
    if (!["http:", "https:"].includes(u.protocol)) {
      return { ok: false, error: "Only http(s) URLs are allowed" };
    }

    if (isInstagramUrl(u)) {
      const draft = await importRecipeFromInstagram(u);
      return { ok: true, draft };
    }

    const draft = await importRecipeFromWebPage(u);
    return { ok: true, draft };
  } catch (err) {
    return { ok: false, error: friendlyImportError(err) };
  }
}

function friendlyImportError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const cleaned = message.replace(/^Error:\s*/i, "").trim();
  if (
    cleaned &&
    cleaned.length < 320 &&
    !cleaned.includes("digest") &&
    !cleaned.includes("omitted") &&
    !cleaned.includes("at ignore-listed")
  ) {
    return cleaned;
  }
  console.error("[importRecipeFromUrl]", err);
  return "Could not import that URL. Try again, or import a screenshot instead.";
}

async function importRecipeFromWebPage(u: URL): Promise<RecipeDraft> {
  let parsed = (await fetchAndParseUrl(u.toString())).parsed;
  let warnings = [...(parsed.rawWarnings ?? [])];
  let tagsFromAi: string[] = [];
  let servings = parsed.servings ?? null;
  let servingsLabel = parsed.servingsLabel ?? null;

  if (
    !parsed.steps.length &&
    parsed.ingredients.length &&
    process.env.GOOGLE_GENERATIVE_AI_API_KEY
  ) {
    const body = [
      parsed.title,
      "",
      "Ingredients:",
      ...parsed.ingredients.map((x) => `- ${formatIngredient(x)}`),
      "",
      "There are no usable step-by-step instructions in the source data. Write clear, ordered cooking steps that match this title and these ingredients. Use only reasonable home-cooking techniques.",
    ].join("\n");
    const ai = await structureRecipeFromPlainText(body);
    if (ai?.steps?.length) {
      parsed = { ...parsed, steps: ai.steps };
      if (ai.tags?.length) tagsFromAi = ai.tags;
      if (servings == null && ai.servings != null) {
        servings = ai.servings;
        servingsLabel = ai.servingsLabel ?? servingsLabel;
      }
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
      if (servings == null && ai.servings != null) {
        servings = ai.servings;
        servingsLabel = ai.servingsLabel ?? servingsLabel;
      }
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
        : [{ amount: null, unit: null, name: "(see steps)", raw: "(see steps)" }],
      steps: parsed.steps.length
        ? parsed.steps
        : ["(see original page)"],
      tags: tagsFromAi,
      servings,
      servingsLabel,
    },
    warnings,
  );
}
