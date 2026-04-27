import { createTogetherAI } from "@ai-sdk/togetherai";
import { generateObject } from "ai";
import { z } from "zod";
import { recipeDraftSchema } from "@/lib/recipe-schema";

/**
 * Uses Together.ai through the Vercel AI SDK (`@ai-sdk/togetherai`).
 * Get a key: https://api.together.ai/ — free credits / Llama-Vision-Free tier.
 *
 * BLOB_READ_WRITE_TOKEN is unrelated: that comes from Vercel Blob (image upload storage).
 */
const together = createTogetherAI({
  apiKey: process.env.TOGETHER_API_KEY ?? "",
});

/** Text-only: good default for URL fallback extraction (override with TOGETHER_TEXT_MODEL). */
const textModelId =
  process.env.TOGETHER_TEXT_MODEL ??
  "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo";

/** Vision: defaults to Together’s free vision endpoint (override with TOGETHER_VISION_MODEL). */
const visionModelId =
  process.env.TOGETHER_VISION_MODEL ?? "Llama-Vision-Free";

const looseRecipeSchema = recipeDraftSchema;

export async function structureRecipeFromPlainText(
  bodyText: string,
): Promise<z.infer<typeof looseRecipeSchema> | null> {
  if (!process.env.TOGETHER_API_KEY) return null;
  if (bodyText.length < 20) return null;

  const { object } = await generateObject({
    model: together(textModelId),
    schema: looseRecipeSchema,
    prompt: `You are helping import a home recipe. From the text below, extract a title, a list of ingredient lines, and step-by-step instructions. 
If the text is not a recipe, still do your best to split it sensibly. Keep ingredient lines as a cook would write them.
Text:\n\n${bodyText.slice(0, 12_000)}`,
  });
  return object;
}

export async function structureRecipeFromImageUrl(
  imageUrl: string,
): Promise<z.infer<typeof looseRecipeSchema>> {
  if (!process.env.TOGETHER_API_KEY) {
    throw new Error("TOGETHER_API_KEY is not configured");
  }
  const { object } = await generateObject({
    model: together(visionModelId),
    schema: looseRecipeSchema,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Extract a cooking recipe from this image. Return title, ingredients as separate list items, and numbered-style steps. If something is unclear, make a best guess and keep lines short.",
          },
          { type: "image", image: new URL(imageUrl) },
        ],
      },
    ],
  });
  return object;
}
