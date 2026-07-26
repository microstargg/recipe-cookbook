import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";
import { getPrivateBlobBytes, isVercelBlobUrl } from "@/lib/blob-storage";
import {
  recipeDraftSchema,
  type RecipeDraft,
  type RecipeIngredient,
} from "@/lib/recipe-schema";
import {
  coerceIngredients,
  parseIngredientLine,
  parseRecipeYield,
} from "@/lib/ingredient-utils";

/**
 * Google Gemini via the Vercel AI SDK (`@ai-sdk/google`).
 * Free API key: https://aistudio.google.com/apikey
 *
 * BLOB_READ_WRITE_TOKEN is unrelated — that is only for Vercel Blob image storage.
 */
const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "",
});

/**
 * Prefer lighter free-tier models first (less “high demand”), then fall back.
 * Override primary with GEMINI_TEXT_MODEL / GEMINI_VISION_MODEL.
 */
const DEFAULT_MODEL_CANDIDATES = [
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite",
  "gemini-3-flash-preview",
  "gemini-3.5-flash",
] as const;

function modelCandidates(preferred?: string): string[] {
  const primary = preferred?.trim();
  const list = primary
    ? [primary, ...DEFAULT_MODEL_CANDIDATES.filter((m) => m !== primary)]
    : [...DEFAULT_MODEL_CANDIDATES];
  return [...new Set(list)];
}

const textModelPreferred = process.env.GEMINI_TEXT_MODEL;
const visionModelPreferred = process.env.GEMINI_VISION_MODEL;

export function hasLlmApiKey(): boolean {
  return Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
}

function isRetryableCapacityError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  return (
    lower.includes("high demand") ||
    lower.includes("try again later") ||
    lower.includes("resource_exhausted") ||
    lower.includes("rate limit") ||
    lower.includes("quota") ||
    lower.includes("unavailable") ||
    lower.includes("overloaded") ||
    lower.includes("no longer available") ||
    lower.includes("not found") ||
    lower.includes("404")
  );
}

async function generateTextWithModelFallback(
  buildArgs: (modelId: string) => Parameters<typeof generateText>[0],
  preferred?: string,
): Promise<string> {
  const candidates = modelCandidates(preferred);
  let lastError: unknown;
  for (const modelId of candidates) {
    try {
      const { text } = await generateText(buildArgs(modelId));
      return text;
    } catch (err) {
      lastError = err;
      if (!isRetryableCapacityError(err)) throw err;
      console.warn(
        `[llm] ${modelId} failed (${err instanceof Error ? err.message : err}); trying next model…`,
      );
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("All Gemini models failed");
}

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

function coerceIngredientListFromLlm(v: unknown): RecipeIngredient[] {
  if (v == null || v === "") return [];
  if (typeof v === "string") {
    return v
      .split(/\n+/)
      .map((line) => line.replace(/^[\s>*-]+|^\d+[.)]\s*/, "").trim())
      .filter(Boolean)
      .map(parseIngredientLine);
  }
  if (!Array.isArray(v)) return [];

  const out: RecipeIngredient[] = [];
  for (const item of v) {
    if (typeof item === "string") {
      const t = item.trim();
      if (t) out.push(parseIngredientLine(t));
      continue;
    }
    if (!isRecord(item)) continue;
    if (Array.isArray(item.itemListElement)) {
      out.push(...coerceIngredientListFromLlm(item.itemListElement));
      continue;
    }
    const amount =
      item.amount != null
        ? String(item.amount).trim()
        : item.quantity != null
          ? String(item.quantity).trim()
          : "";
    const unit = typeof item.unit === "string" ? item.unit.trim() : "";
    const name =
      typeof item.name === "string"
        ? item.name.trim()
        : typeof item.item === "string"
          ? item.item.trim()
          : typeof item.ingredient === "string"
            ? item.ingredient.trim()
            : typeof item.text === "string"
              ? item.text.trim()
              : "";
    const note =
      typeof item.note === "string"
        ? item.note.trim()
        : typeof item.notes === "string"
          ? item.notes.trim()
          : "";

    if (amount || unit || name) {
      if (name && !amount && !unit) {
        out.push(parseIngredientLine(name));
      } else {
        out.push({
          amount: amount || null,
          unit: unit || null,
          name: name || [amount, unit].filter(Boolean).join(" "),
          note: note || null,
          raw: [amount, unit, name].filter(Boolean).join(" ") || null,
        });
      }
    }
  }
  return out.length ? out : coerceIngredients(v);
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

  const ingredients = coerceIngredientListFromLlm(
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

  const yieldParsed = parseRecipeYield(
    raw.servings ?? raw.recipeYield ?? raw.yield ?? raw.serves,
  );

  const parsed = recipeDraftSchema.safeParse({
    title: title || "Recipe",
    ingredients,
    steps,
    tags,
    servings: yieldParsed.servings,
    servingsLabel: yieldParsed.servingsLabel,
  });
  return parsed.success ? parsed.data : null;
}

const jsonOnlyRecipeInstructions = `Reply with one JSON object only (no markdown fences, no commentary). Use this shape:
{
  "title": string,
  "ingredients": [
    { "amount": string|null, "unit": string|null, "name": string, "note"?: string|null }
  ],
  "steps": string[],
  "tags"?: string[],
  "servings"?: number|null
}
Rules:
- ingredients: structured objects. amount is the quantity ("1/2", "2", "750"); unit is the measure ("cup", "g", "tbsp") or null; name is the ingredient. Put prep notes in note.
- You may also use plain strings for ingredients if needed; prefer structured objects.
- steps: ordered cooking steps, one string per step.
- servings: number of portions the recipe makes, if known.
- tags: optional short labels.
If a field would be empty, use [] for arrays. Do not use null for arrays.`;

async function extractRecipeWithTextPrompt(prompt: string): Promise<RecipeDraft | null> {
  const text = await generateTextWithModelFallback(
    (modelId) => ({
      model: google(modelId),
      prompt,
      temperature: 0.2,
      maxOutputTokens: 4096,
    }),
    textModelPreferred,
  );
  const json = extractJsonObjectFromModelText(text);
  return json != null ? recipeDraftFromUnknownJson(json) : null;
}

export async function structureRecipeFromPlainText(
  bodyText: string,
  options?: { context?: "plain" | "article-scrape" },
): Promise<RecipeDraft | null> {
  if (!hasLlmApiKey()) return null;
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
  if (!hasLlmApiKey()) {
    throw new Error(
      "GOOGLE_GENERATIVE_AI_API_KEY is not configured (get a free key at https://aistudio.google.com/apikey).",
    );
  }

  // Private Blob URLs are not fetchable by the vision provider — pass bytes instead.
  const image = isVercelBlobUrl(imageUrl)
    ? (await getPrivateBlobBytes(imageUrl)).bytes
    : new URL(imageUrl);

  const text = await generateTextWithModelFallback(
    (modelId) => ({
      model: google(modelId),
      temperature: 0.2,
      maxOutputTokens: 4096,
      messages: [
        {
          role: "user" as const,
          content: [
            {
              type: "text" as const,
              text: `Extract the cooking recipe from this image into JSON.
${jsonOnlyRecipeInstructions}
If handwritten or unclear, make reasonable guesses; keep lines short.`,
            },
            { type: "image" as const, image },
          ],
        },
      ],
    }),
    visionModelPreferred,
  );

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
