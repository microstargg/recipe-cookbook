import { z } from "zod";

export const recipeDraftSchema = z.object({
  title: z.string().min(1, "Title is required").max(500),
  ingredients: z.array(z.string().min(1)).min(1, "Add at least one ingredient"),
  steps: z.array(z.string().min(1)).min(1, "Add at least one step"),
  tags: z.array(z.string()).optional().default([]),
  sourceUrl: z.string().url().optional().or(z.literal("")).transform((v) => (v ? v : undefined)),
  notes: z.string().max(10_000).optional().or(z.literal("")).transform((v) => (v ? v : undefined)),
  /** Absolute http(s) URL for the main recipe photo (import or manual). */
  imageUrl: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.string().url().optional(),
  ),
});

export type RecipeDraft = z.infer<typeof recipeDraftSchema>;

export function normalizeDraft(input: {
  title: string;
  ingredients: string[];
  steps: string[];
  tags?: string[];
  sourceUrl?: string | null;
  notes?: string | null;
  imageUrl?: string | null;
}): RecipeDraft {
  return recipeDraftSchema.parse({
    title: input.title.trim(),
    ingredients: input.ingredients.map((i) => i.trim()).filter(Boolean),
    steps: input.steps.map((s) => s.trim()).filter(Boolean),
    tags: (input.tags ?? []).map((t) => t.trim()).filter(Boolean),
    sourceUrl: input.sourceUrl ?? undefined,
    notes: input.notes ?? undefined,
    imageUrl: input.imageUrl ?? undefined,
  });
}
