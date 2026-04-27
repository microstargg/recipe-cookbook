import { createTogetherAI } from "@ai-sdk/togetherai";
import { generateText } from "ai";
import { recipeDraftSchema, type RecipeDraft } from "@/lib/recipe-schema";

/**
 * Uses Together.ai through the Vercel AI SDK (`@ai-sdk/togetherai`).
 * Get a key: https://api.together.ai/ — free credits / Llama-Vision-Free tier.
 *
 * BLOB_READ_WRITE_TOKEN is unrelated: that comes from Vercel Blob (image upload storage).
 */
const together = createTogetherAI({
  apiKey: process.env.TOGETHER_API_KEY ?? "",
});

/**
 * Text / vision extraction uses plain text + JSON parsing. `generateObject` validates with the
 * provider JSON schema pipeline and often fails on real model output (nulls, nested ingredient
 * objects, alternate keys, prose) with "response did not match schema".
 *
 * Cheaper serverless option: `meta-llama/Meta-Llama-3-8B-Instruct-Lite` via `TOGETHER_TEXT_MODEL`.
 * @see https://docs.together.ai/docs/serverless-models
 */
const textModelId =
  process.env.TOGETHER_TEXT_MODEL ??
  "meta-llama/Llama-3.3-70B-Instruct-Turbo";

/** Vision: defaults to Together’s free vision endpoint (override with TOGETHER_VISION_MODEL). */
const visionModelId =
  process.env.TOGETHER_VISION_MODEL ?? "Llama-Vision-Free";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Pull a `{ ... }` object from model output (handles ```json fences and trailing junk). */
function extractJsonObjectFromModelText(text: string): unknown | null {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const inner = fence ? fence[1].trim() : trimmed;
  const start = inner.indexOf("{");
  const end = inner.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(inner.slice(start, end + 1));
  } catch {
    return null;
  }
}

function coerceStringList(v: unknown): string[] {
  if (v == null || v === "") return [];
  if (Array.isArray(v)) {
    return v.flatMap((item) => {
      if (typeof item === "string") {
        const t = item.trim();
        return t ? [t] : [];
      }
      if (typeof item === "number" && Number.isFinite(item)) return [String(item)];
      if (isRecord(item)) {
        if (Array.isArray(item.itemListElement)) {
          return coerceStringList(item.itemListElement);
        }
        const single = ["text", "name", "ingredient", "item", "description", "content"].find(
          (k) => typeof item[k] === "string" && String(item[k]).trim(),
        );
        if (single) return [String(item[single]).trim()];
        const amount =
          typeof item.amount === "string"
            ? item.amount.trim()
            : typeof item.amount === "number"
              ? String(item.amount)
              : "";
        const name =
          typeof item.name === "string"
            ? item.name.trim()
            : typeof item.item === "string"
              ? item.item.trim()
              : "";
        if (amount && name) return [`${amount} ${name}`.trim()];
        if (name) return [name];
        return [];
      }
      return [];
    });
  }
  if (typeof v === "string") {
    return v
      .split(/\n+/)
      .map((line) => line.replace(/^[\s>*-]+|^\d+[.)]\s*/, "").trim())
      .filter(Boolean);
  }
  return [];
}

function unwrapNestedListField(v: unknown): unknown {
  if (isRecord(v) && Array.isArray(v.itemListElement)) {
    return v.itemListElement;
  }
  return v;
}

function recipeDraftFromUnknownJson(raw: unknown): RecipeDraft | null {
  if (!isRecord(raw)) return null;

  const titleRaw = raw.title ?? raw.name ?? raw.recipeName;
  const title =
    typeof titleRaw === "string"
      ? titleRaw.trim()
      : typeof titleRaw === "number"
        ? String(titleRaw)
        : "";

  const ingredients = coerceStringList(
    unwrapNestedListField(
      raw.ingredients ?? raw.ingredient ?? raw.recipeIngredient,
    ),
  );

  const steps = coerceStringList(
    unwrapNestedListField(
      raw.steps ??
        raw.instructions ??
        raw.method ??
        raw.directions ??
        raw.recipeInstructions,
    ),
  );

  const tagsRaw = raw.tags ?? raw.keywords ?? raw.category;
  const tags =
    typeof tagsRaw === "string"
      ? tagsRaw
          .split(/[,;]+/)
          .map((t) => t.trim())
          .filter(Boolean)
      : coerceStringList(tagsRaw);

  const parsed = recipeDraftSchema.safeParse({
    title: title || "Recipe",
    ingredients,
    steps,
    tags,
  });
  return parsed.success ? parsed.data : null;
}

const jsonOnlyRecipeInstructions = `Reply with one JSON object only (no markdown fences, no commentary). Use this shape:
{
  "title": string,
  "ingredients": string[],
  "steps": string[],
  "tags"?: string[]
}
Rules:
- ingredients: one string per ingredient line (include amounts in the string).
- steps: ordered cooking steps, one string per step.
- tags: optional short labels.
If a field would be empty, use [] for arrays. Do not use null for arrays.`;

async function extractRecipeWithTextPrompt(prompt: string): Promise<RecipeDraft | null> {
  const { text } = await generateText({
    model: together(textModelId),
    prompt,
    temperature: 0.2,
    maxOutputTokens: 4096,
  });
  const json = extractJsonObjectFromModelText(text);
  return json != null ? recipeDraftFromUnknownJson(json) : null;
}

export async function structureRecipeFromPlainText(
  bodyText: string,
  options?: { context?: "plain" | "article-scrape" },
): Promise<RecipeDraft | null> {
  if (!process.env.TOGETHER_API_KEY) return null;
  if (bodyText.length < 20) return null;

  const articleHints =
    options?.context === "article-scrape"
      ? `The source may be messy: story text, ads, duplicated sections. Ignore bios, subscribe boxes, and unrelated paragraphs.
Isolate the real recipe — ingredient lines (with amounts) and ordered cooking steps.
`
      : "";

  const prompt = `You extract home recipes into JSON.
${jsonOnlyRecipeInstructions}
${articleHints}
Source text:

${bodyText.slice(0, 12_000)}`;

  return extractRecipeWithTextPrompt(prompt);
}

export async function structureRecipeFromImageUrl(
  imageUrl: string,
): Promise<RecipeDraft> {
  if (!process.env.TOGETHER_API_KEY) {
    throw new Error("TOGETHER_API_KEY is not configured");
  }

  const { text } = await generateText({
    model: together(visionModelId),
    temperature: 0.2,
    maxOutputTokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Extract the cooking recipe from this image into JSON.
${jsonOnlyRecipeInstructions}
If handwritten or unclear, make reasonable guesses; keep lines short.`,
          },
          { type: "image", image: new URL(imageUrl) },
        ],
      },
    ],
  });

  const json = extractJsonObjectFromModelText(text);
  const draft =
    json != null ? recipeDraftFromUnknownJson(json) : null;
  if (!draft) {
    throw new Error(
      "Could not extract a valid recipe from the image (missing title, ingredients, or steps).",
    );
  }
  return draft;
}
