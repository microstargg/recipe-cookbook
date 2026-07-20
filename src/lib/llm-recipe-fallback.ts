import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";
import { getPrivateBlobBytes, isVercelBlobUrl } from "@/lib/blob-storage";
import { recipeDraftSchema, type RecipeDraft } from "@/lib/recipe-schema";

/**
 * Google Gemini via the Vercel AI SDK (`@ai-sdk/google`).
 * Free API key: https://aistudio.google.com/apikey
 *
 * BLOB_READ_WRITE_TOKEN is unrelated — that is only for Vercel Blob image storage.
 */
const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "",
});

/** Text structuring (URL import fallback). Override with GEMINI_TEXT_MODEL. */
const textModelId =
  process.env.GEMINI_TEXT_MODEL ?? "gemini-2.5-flash";

/** Vision / photo import. Override with GEMINI_VISION_MODEL. */
const visionModelId =
  process.env.GEMINI_VISION_MODEL ?? "gemini-2.5-flash";

export function hasLlmApiKey(): boolean {
  return Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
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
    model: google(textModelId),
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

  const { text } = await generateText({
    model: google(visionModelId),
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
          { type: "image", image },
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
