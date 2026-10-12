"use server";

import { and, asc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  freezerItems,
  households,
  planEntries,
  quickMeals,
  recipes,
  type MealSlot,
} from "@/db/schema";
import { requireHousehold } from "@/lib/household";
import { parseIngredientLine } from "@/lib/ingredient-utils";
import type { RecipeIngredient } from "@/lib/recipe-schema";
import { addDays, isIsoDate, MEAL_SLOTS, todayIso, weekStartOf } from "@/lib/week";

const isoDate = z.string().refine(isIsoDate, "Invalid date");
const slot = z.enum(MEAL_SLOTS);
const portions = z.number().int().min(1).max(50);
const extraPortions = z.number().int().min(0).max(50);

function revalidatePlan() {
  revalidatePath("/plan");
  revalidatePath("/freezer");
}

function ingredientsFromText(text: string | undefined): RecipeIngredient[] {
  return (text ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map(parseIngredientLine);
}

async function householdPortions(householdId: string): Promise<number> {
  const [h] = await db
    .select({ n: households.defaultPortions })
    .from(households)
    .where(eq(households.id, householdId));
  return h?.n ?? 2;
}

/** Freezer items with how many portions are still unplanned. */
async function freezerWithRemaining(householdId: string) {
  const items = await db
    .select()
    .from(freezerItems)
    .where(eq(freezerItems.householdId, householdId))
    .orderBy(asc(freezerItems.frozenOn));
  if (!items.length) return [];

  const used = await db
    .select({
      freezerItemId: planEntries.freezerItemId,
      used: sql<number>`sum(${planEntries.portions})::int`,
    })
    .from(planEntries)
    .where(
      and(
        eq(planEntries.householdId, householdId),
        eq(planEntries.kind, "freezer"),
        isNotNull(planEntries.freezerItemId),
      ),
    )
    .groupBy(planEntries.freezerItemId);
  const usedBy = new Map(used.map((u) => [u.freezerItemId, u.used]));

  return items.map((i) => ({
    id: i.id,
    title: i.title,
    recipeId: i.recipeId,
    portions: i.portions,
    remaining: i.portions - (usedBy.get(i.id) ?? 0),
    frozenOn: i.frozenOn,
    fromPlan: i.sourceEntryId != null,
  }));
}

export async function getWeekPlan(requestedWeek?: string) {
  const { householdId } = await requireHousehold();
  const weekStart = weekStartOf(isIsoDate(requestedWeek) ? requestedWeek : todayIso());

  // A week either side, so leftovers that cross a week boundary still link up.
  const entries = await db
    .select()
    .from(planEntries)
    .where(
      and(
        eq(planEntries.householdId, householdId),
        gte(planEntries.date, addDays(weekStart, -7)),
        lte(planEntries.date, addDays(weekStart, 13)),
      ),
    )
    .orderBy(asc(planEntries.date), asc(planEntries.createdAt));

  const recipeList = await db
    .select({
      id: recipes.id,
      title: recipes.title,
      servings: recipes.servings,
      tags: recipes.tags,
    })
    .from(recipes)
    .where(eq(recipes.householdId, householdId))
    .orderBy(asc(recipes.title));

  const quick = await db
    .select()
    .from(quickMeals)
    .where(eq(quickMeals.householdId, householdId))
    .orderBy(asc(quickMeals.title));

  return {
    weekStart,
    today: todayIso(),
    defaultPortions: await householdPortions(householdId),
    entries: entries.map((e) => ({
      id: e.id,
      date: e.date,
      slot: e.slot,
      kind: e.kind,
      title: e.title,
      recipeId: e.recipeId,
      portions: e.portions,
      freezePortions: e.freezePortions,
      leftoverOfEntryId: e.leftoverOfEntryId,
      freezerItemId: e.freezerItemId,
      ingredients: e.ingredients,
    })),
    recipes: recipeList.map((r) => ({ ...r, tags: r.tags ?? [] })),
    quickMeals: quick.map((q) => ({ id: q.id, title: q.title, slot: q.slot, ingredients: q.ingredients })),
    freezer: await freezerWithRemaining(householdId),
  };
}

export type WeekPlan = Awaited<ReturnType<typeof getWeekPlan>>;
export type PlanEntryView = WeekPlan["entries"][number];

const addMealSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("cook"),
    date: isoDate,
    slot,
    recipeId: z.string().uuid(),
    portions,
    freezePortions: extraPortions.default(0),
    /** Also plan tomorrow's lunch as leftovers of this meal. */
    leftoversNextDay: z.boolean().default(false),
  }),
  z.object({
    kind: z.literal("simple"),
    dates: z.array(isoDate).min(1).max(7),
    slot,
    title: z.string().trim().min(1).max(200),
    ingredientsText: z.string().max(5000).optional(),
    portions,
    saveAsQuickMeal: z.boolean().default(false),
  }),
  z.object({
    kind: z.literal("quick"),
    dates: z.array(isoDate).min(1).max(7),
    slot,
    quickMealId: z.string().uuid(),
    portions,
  }),
  z.object({
    kind: z.literal("leftovers"),
    date: isoDate,
    slot,
    sourceEntryId: z.string().uuid(),
    portions,
  }),
  z.object({
    kind: z.literal("freezer"),
    date: isoDate,
    slot,
    freezerItemId: z.string().uuid(),
    portions,
  }),
]);

export type AddMealInput = z.input<typeof addMealSchema>;

export async function addMeal(input: AddMealInput) {
  const { householdId, userId } = await requireHousehold();
  const data = addMealSchema.parse(input);
  const base = { householdId, createdBy: userId, slot: data.slot as MealSlot };

  switch (data.kind) {
    case "cook": {
      const [recipe] = await db
        .select({ id: recipes.id, title: recipes.title })
        .from(recipes)
        .where(and(eq(recipes.id, data.recipeId), eq(recipes.householdId, householdId)));
      if (!recipe) throw new Error("Recipe not found");

      const cookId = crypto.randomUUID();
      await db.batch([
        db.insert(planEntries).values({
          ...base,
          id: cookId,
          date: data.date,
          kind: "cook",
          title: recipe.title,
          recipeId: recipe.id,
          portions: data.portions,
          freezePortions: data.freezePortions,
        }),
        ...(data.leftoversNextDay
          ? [
              db.insert(planEntries).values({
                ...base,
                date: addDays(data.date, 1),
                slot: "lunch" as const,
                kind: "leftovers" as const,
                title: recipe.title,
                recipeId: recipe.id,
                portions: data.portions,
                leftoverOfEntryId: cookId,
              }),
            ]
          : []),
        ...(data.freezePortions > 0
          ? [
              db.insert(freezerItems).values({
                householdId,
                title: recipe.title,
                recipeId: recipe.id,
                portions: data.freezePortions,
                frozenOn: data.date,
                sourceEntryId: cookId,
              }),
            ]
          : []),
      ]);
      break;
    }

    case "simple":
    case "quick": {
      let title: string;
      let ingredients: RecipeIngredient[];
      if (data.kind === "simple") {
        title = data.title;
        ingredients = ingredientsFromText(data.ingredientsText);
        if (data.saveAsQuickMeal) {
          await db.insert(quickMeals).values({ householdId, title, slot: data.slot, ingredients });
        }
      } else {
        const [q] = await db
          .select()
          .from(quickMeals)
          .where(and(eq(quickMeals.id, data.quickMealId), eq(quickMeals.householdId, householdId)));
        if (!q) throw new Error("Quick meal not found");
        title = q.title;
        ingredients = q.ingredients;
      }
      await db.insert(planEntries).values(
        [...new Set(data.dates)].map((date) => ({
          ...base,
          date,
          kind: "simple" as const,
          title,
          portions: data.portions,
          ingredients,
        })),
      );
      break;
    }

    case "leftovers": {
      const [source] = await db
        .select()
        .from(planEntries)
        .where(
          and(
            eq(planEntries.id, data.sourceEntryId),
            eq(planEntries.householdId, householdId),
            eq(planEntries.kind, "cook"),
          ),
        );
      if (!source) throw new Error("That meal isn't in the plan any more");
      await db.insert(planEntries).values({
        ...base,
        date: data.date,
        kind: "leftovers",
        title: source.title,
        recipeId: source.recipeId,
        portions: data.portions,
        leftoverOfEntryId: source.id,
      });
      break;
    }

    case "freezer": {
      const stock = await freezerWithRemaining(householdId);
      const item = stock.find((i) => i.id === data.freezerItemId);
      if (!item) throw new Error("That freezer item is gone");
      if (item.remaining < data.portions) {
        throw new Error(`Only ${Math.max(item.remaining, 0)} portion(s) of ${item.title} left`);
      }
      await db.insert(planEntries).values({
        ...base,
        date: data.date,
        kind: "freezer",
        title: item.title,
        recipeId: item.recipeId,
        portions: data.portions,
        freezerItemId: item.id,
      });
      break;
    }
  }

  revalidatePlan();
}

export async function updateEntry(
  id: string,
  patch: { portions?: number; freezePortions?: number },
) {
  const { householdId } = await requireHousehold();
  const entryId = z.string().uuid().parse(id);
  const next = z
    .object({ portions: portions.optional(), freezePortions: extraPortions.optional() })
    .parse(patch);

  const [entry] = await db
    .select()
    .from(planEntries)
    .where(and(eq(planEntries.id, entryId), eq(planEntries.householdId, householdId)));
  if (!entry) throw new Error("Not found");

  if (next.portions != null) {
    await db.update(planEntries).set({ portions: next.portions }).where(eq(planEntries.id, entry.id));
  }

  if (next.freezePortions != null && entry.kind === "cook") {
    await db
      .update(planEntries)
      .set({ freezePortions: next.freezePortions })
      .where(eq(planEntries.id, entry.id));
    if (next.freezePortions > 0) {
      await db
        .insert(freezerItems)
        .values({
          householdId,
          title: entry.title,
          recipeId: entry.recipeId,
          portions: next.freezePortions,
          frozenOn: entry.date,
          sourceEntryId: entry.id,
        })
        .onConflictDoUpdate({
          target: freezerItems.sourceEntryId,
          set: { portions: next.freezePortions },
        });
    } else {
      await db.delete(freezerItems).where(eq(freezerItems.sourceEntryId, entry.id));
    }
  }

  revalidatePlan();
}

/** Deleting a cook entry also removes its leftovers and its freezer batch (FK cascades). */
export async function deleteEntry(id: string) {
  const { householdId } = await requireHousehold();
  await db
    .delete(planEntries)
    .where(and(eq(planEntries.id, z.string().uuid().parse(id)), eq(planEntries.householdId, householdId)));
  revalidatePlan();
}

/**
 * Copy last week's meals into an empty week. Freezer meals are skipped (that stock
 * may be eaten); batch-cook entries recreate their freezer portions.
 */
export async function copyPreviousWeek(weekStartInput: string): Promise<{ copied: number }> {
  const { householdId, userId } = await requireHousehold();
  const weekStart = weekStartOf(isoDate.parse(weekStartInput));
  const weekEnd = addDays(weekStart, 6);

  const [existing] = await db
    .select({ id: planEntries.id })
    .from(planEntries)
    .where(
      and(
        eq(planEntries.householdId, householdId),
        gte(planEntries.date, weekStart),
        lte(planEntries.date, weekEnd),
      ),
    )
    .limit(1);
  if (existing) throw new Error("This week already has meals. Clear it first to copy last week.");

  const source = await db
    .select()
    .from(planEntries)
    .where(
      and(
        eq(planEntries.householdId, householdId),
        gte(planEntries.date, addDays(weekStart, -7)),
        lte(planEntries.date, addDays(weekStart, -1)),
        inArray(planEntries.kind, ["cook", "simple", "leftovers"]),
      ),
    );

  const newIds = new Map(source.map((e) => [e.id, crypto.randomUUID()]));
  const rows = source
    // Leftovers whose cook entry was in an earlier week can't be re-linked.
    .filter((e) => e.kind !== "leftovers" || (e.leftoverOfEntryId && newIds.has(e.leftoverOfEntryId)))
    .map((e) => ({
      id: newIds.get(e.id)!,
      householdId,
      createdBy: userId,
      date: addDays(e.date, 7),
      slot: e.slot,
      kind: e.kind,
      title: e.title,
      recipeId: e.recipeId,
      portions: e.portions,
      freezePortions: e.freezePortions,
      leftoverOfEntryId: e.leftoverOfEntryId ? newIds.get(e.leftoverOfEntryId)! : null,
      ingredients: e.ingredients,
    }));
  if (!rows.length) return { copied: 0 };

  // Cook entries first so leftovers can reference them.
  rows.sort((a, b) => Number(a.kind === "leftovers") - Number(b.kind === "leftovers"));
  const freezerRows = rows
    .filter((r) => r.kind === "cook" && r.freezePortions > 0)
    .map((r) => ({
      householdId,
      title: r.title,
      recipeId: r.recipeId,
      portions: r.freezePortions,
      frozenOn: r.date,
      sourceEntryId: r.id,
    }));

  await db.batch([
    db.insert(planEntries).values(rows.filter((r) => r.kind !== "leftovers")),
    ...(rows.some((r) => r.kind === "leftovers")
      ? [db.insert(planEntries).values(rows.filter((r) => r.kind === "leftovers"))]
      : []),
    ...(freezerRows.length ? [db.insert(freezerItems).values(freezerRows)] : []),
  ]);

  revalidatePlan();
  return { copied: rows.length };
}

export async function setDefaultPortions(n: number) {
  const { householdId } = await requireHousehold();
  await db
    .update(households)
    .set({ defaultPortions: portions.parse(n) })
    .where(eq(households.id, householdId));
  revalidatePlan();
  revalidatePath("/settings/household");
}

export async function deleteQuickMeal(id: string) {
  const { householdId } = await requireHousehold();
  await db
    .delete(quickMeals)
    .where(and(eq(quickMeals.id, z.string().uuid().parse(id)), eq(quickMeals.householdId, householdId)));
  revalidatePlan();
}

export async function getFreezer() {
  const { householdId } = await requireHousehold();
  return freezerWithRemaining(householdId);
}

export async function addFreezerItem(input: { title: string; portions: number }) {
  const { householdId } = await requireHousehold();
  const data = z
    .object({ title: z.string().trim().min(1).max(200), portions })
    .parse(input);
  await db.insert(freezerItems).values({
    householdId,
    title: data.title,
    portions: data.portions,
    frozenOn: todayIso(),
  });
  revalidatePlan();
}

/** Set how many portions are physically left; planned freezer meals still count against it. */
export async function setFreezerRemaining(id: string, remaining: number) {
  const { householdId } = await requireHousehold();
  const itemId = z.string().uuid().parse(id);
  const left = extraPortions.parse(remaining);
  const item = (await freezerWithRemaining(householdId)).find((i) => i.id === itemId);
  if (!item) throw new Error("Not found");
  const used = item.portions - item.remaining;
  await db
    .update(freezerItems)
    .set({ portions: used + left })
    .where(and(eq(freezerItems.id, itemId), eq(freezerItems.householdId, householdId)));
  revalidatePlan();
}

export async function deleteFreezerItem(id: string) {
  const { householdId } = await requireHousehold();
  await db
    .delete(freezerItems)
    .where(and(eq(freezerItems.id, z.string().uuid().parse(id)), eq(freezerItems.householdId, householdId)));
  revalidatePlan();
}
