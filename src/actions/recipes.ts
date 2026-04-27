"use server";

import { db } from "@/db";
import { recipeImages, recipes } from "@/db/schema";
import { requireUserId } from "@/lib/require-user";
import { recipeDraftSchema, normalizeDraft } from "@/lib/recipe-schema";
import { and, asc, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export async function getRecipes() {
  const userId = await requireUserId();

  return db
    .select()
    .from(recipes)
    .where(eq(recipes.userId, userId))
    .orderBy(desc(recipes.updatedAt));
}

export async function getRecipe(id: string) {
  const userId = await requireUserId();

  const [recipe] = await db
    .select()
    .from(recipes)
    .where(and(eq(recipes.id, id), eq(recipes.userId, userId)))
    .limit(1);

  if (!recipe) return null;

  const images = await db
    .select()
    .from(recipeImages)
    .where(eq(recipeImages.recipeId, id))
    .orderBy(asc(recipeImages.createdAt));

  return { ...recipe, images };
}

const saveInputSchema = recipeDraftSchema.extend({
  id: z.string().uuid().optional(),
  imageUrl: z.string().url().optional(),
});

export async function saveRecipe(
  input: z.infer<typeof saveInputSchema>,
) {
  const userId = await requireUserId();

  const data = saveInputSchema.parse(input);
  const normalized = normalizeDraft(data);

  if (data.id) {
    const [updated] = await db
      .update(recipes)
      .set({
        title: normalized.title,
        ingredients: normalized.ingredients,
        steps: normalized.steps,
        tags: normalized.tags ?? [],
        sourceUrl: normalized.sourceUrl ?? null,
        notes: normalized.notes ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(eq(recipes.id, data.id), eq(recipes.userId, userId)),
      )
      .returning();

    if (!updated) throw new Error("Not found");
    revalidatePath("/recipes");
    revalidatePath(`/recipes/${updated.id}`);
    return updated;
  }

  const [created] = await db
    .insert(recipes)
    .values({
      userId,
      title: normalized.title,
      ingredients: normalized.ingredients,
      steps: normalized.steps,
      tags: normalized.tags ?? [],
      sourceUrl: normalized.sourceUrl ?? null,
      notes: normalized.notes ?? null,
    })
    .returning();

  if (data.imageUrl) {
    await db.insert(recipeImages).values({
      recipeId: created.id,
      url: data.imageUrl,
      kind: "cover",
    });
  }
  revalidatePath("/recipes");
  revalidatePath(`/recipes/${created.id}`);
  return created;
}

export async function deleteRecipe(id: string) {
  const userId = await requireUserId();

  const [del] = await db
    .delete(recipes)
    .where(and(eq(recipes.id, id), eq(recipes.userId, userId)))
    .returning();

  if (!del) throw new Error("Not found");
  revalidatePath("/recipes");
}
