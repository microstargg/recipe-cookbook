import { z } from "zod";
import { parseIngredientLine } from "@/lib/ingredient-utils";

export const recipeIngredientSchema = z.object({
  amount: z.string().nullable(),
  unit: z.string().nullable(),
  name: z.string().min(1),
  note: z.string().nullable().optional(),
  raw: z.string().nullable().optional(),
});

export type RecipeIngredient = z.infer<typeof recipeIngredientSchema>;

/** Accept legacy string[] or structured ingredients and normalize. */
function coerceIngredientList(v: unknown): unknown {
  if (!Array.isArray(v)) return v;
  return v
    .map((item) => {
      if (typeof item === "string") {
        const t = item.trim();
        if (!t) return null;
        return parseIngredientLine(t);
      }
      return item;
    })
    .filter(Boolean);
}

export const recipeDraftSchema = z.object({
  title: z.string().min(1, "Title is required").max(500),
  ingredients: z.preprocess(
    coerceIngredientList,
    z.array(recipeIngredientSchema).min(1, "Add at least one ingredient"),
  ),
  steps: z.array(z.string().min(1)).min(1, "Add at least one step"),
  tags: z.array(z.string()).optional().default([]),
  sourceUrl: z.string().url().optional().or(z.literal("")).transform((v) => (v ? v : undefined)),
  notes: z.string().max(10_000).optional().or(z.literal("")).transform((v) => (v ? v : undefined)),
  servings: z
    .union([z.number().int().positive(), z.null()])
    .optional()
    .default(null),
  servingsLabel: z
    .union([z.string().max(200), z.null(), z.literal("")])
    .optional()
    .transform((v) => (v ? v : null))
    .default(null),
  /** Absolute http(s) URL for the main recipe photo (import or manual). */
  imageUrl: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.string().url().optional(),
  ),
});

export type RecipeDraft = z.infer<typeof recipeDraftSchema>;

export function normalizeDraft(input: {
  title: string;
  ingredients: RecipeIngredient[] | string[];
  steps: string[];
  tags?: string[];
  sourceUrl?: string | null;
  notes?: string | null;
  servings?: number | null;
  servingsLabel?: string | null;
  imageUrl?: string | null;
}): RecipeDraft {
  return recipeDraftSchema.parse({
    title: input.title.trim(),
    ingredients: input.ingredients,
    steps: input.steps.map((s) => s.trim()).filter(Boolean),
    tags: (input.tags ?? []).map((t) => t.trim()).filter(Boolean),
    sourceUrl: input.sourceUrl ?? undefined,
    notes: input.notes ?? undefined,
    servings: input.servings ?? null,
    servingsLabel: input.servingsLabel ?? null,
    imageUrl: input.imageUrl ?? undefined,
  });
}
