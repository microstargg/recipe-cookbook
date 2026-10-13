"use server";

import { db } from "@/db";
import { recipeImages, recipes } from "@/db/schema";
import { requireHousehold } from "@/lib/household";
import { recipeDraftSchema, normalizeDraft } from "@/lib/recipe-schema";
import { and, asc, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export async function getRecipes() {
  const { householdId } = await requireHousehold();

  return db
    .select()
    .from(recipes)
    .where(eq(recipes.householdId, householdId))
    .orderBy(desc(recipes.updatedAt));
}

export async function getRecipe(id: string) {
  const { householdId } = await requireHousehold();

  const [recipe] = await db
    .select()
    .from(recipes)
    .where(and(eq(recipes.id, id), eq(recipes.householdId, householdId)))
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
  const { userId, householdId } = await requireHousehold();

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
        servings: normalized.servings ?? null,
        servingsLabel: normalized.servingsLabel ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(eq(recipes.id, data.id), eq(recipes.householdId, householdId)),
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
      householdId,
      title: normalized.title,
      ingredients: normalized.ingredients,
      steps: normalized.steps,
      tags: normalized.tags ?? [],
      sourceUrl: normalized.sourceUrl ?? null,
      notes: normalized.notes ?? null,
      servings: normalized.servings ?? null,
      servingsLabel: normalized.servingsLabel ?? null,
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
  const { householdId } = await requireHousehold();

  const [del] = await db
    .delete(recipes)
    .where(and(eq(recipes.id, id), eq(recipes.householdId, householdId)))
    .returning();

  if (!del) throw new Error("Not found");
  revalidatePath("/recipes");
}
