"use server";

import { createHash } from "node:crypto";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  aisleOverrides,
  households,
  ingredientAisleCache,
  planEntries,
  recipes,
  shoppingItems,
  shoppingLists,
} from "@/db/schema";
import { requireHousehold } from "@/lib/household";
import { coerceIngredients } from "@/lib/ingredient-utils";
import { classifyGroceryAisles } from "@/lib/llm-recipe-fallback";
import { recipeScaleFactor, totalCookedPortions } from "@/lib/plan-math";
import { mergeIngredients, normalizeIngredientName, toSources, type ShoppingSource } from "@/lib/shopping/aggregate";
import { AISLES, classifyByKeyword, isAisleKey, type AisleKey } from "@/lib/shopping/aisles";
import { addDays, isIsoDate, todayIso, weekStartOf } from "@/lib/week";

const AI_CLASSIFY_TIMEOUT_MS = 8000;

function resolveWeek(input?: string): string {
  return weekStartOf(isIsoDate(input) ? input : todayIso());
}

/** Everything the list is built from for one week, plus a fingerprint of it. */
async function collectPlanIngredients(householdId: string, weekStart: string) {
  const weekEnd = addDays(weekStart, 6);
  // Leftovers can sit in the following week, so look a week either side for portion totals.
  const entries = await db
    .select()
    .from(planEntries)
    .where(
      and(
        eq(planEntries.householdId, householdId),
        gte(planEntries.date, addDays(weekStart, -7)),
        lte(planEntries.date, addDays(weekEnd, 7)),
      ),
    );
  const inWeek = entries.filter(
    (e) => e.date >= weekStart && e.date <= weekEnd && (e.kind === "cook" || e.kind === "simple"),
  );

  const recipeIds = [...new Set(inWeek.map((e) => e.recipeId).filter((x): x is string => !!x))];
  const recipeRows = recipeIds.length
    ? await db
        .select({
          id: recipes.id,
          title: recipes.title,
          servings: recipes.servings,
          ingredients: recipes.ingredients,
          updatedAt: recipes.updatedAt,
        })
        .from(recipes)
        .where(and(inArray(recipes.id, recipeIds), eq(recipes.householdId, householdId)))
    : [];
  const recipeById = new Map(recipeRows.map((r) => [r.id, r]));

  const [{ defaultPortions }] = await db
    .select({ defaultPortions: households.defaultPortions })
    .from(households)
    .where(eq(households.id, householdId));

  const sources: ShoppingSource[] = [];
  const fingerprint: string[] = [];
  for (const e of inWeek.sort((a, b) => a.id.localeCompare(b.id))) {
    if (e.kind === "cook") {
      const recipe = e.recipeId ? recipeById.get(e.recipeId) : undefined;
      if (!recipe) continue;
      const total = totalCookedPortions(e, entries);
      const factor = recipeScaleFactor(total, recipe.servings, defaultPortions);
      sources.push(...toSources(coerceIngredients(recipe.ingredients), factor, recipe.title));
      fingerprint.push(`${e.id}:${total}:${recipe.updatedAt.toISOString()}`);
    } else {
      sources.push(...toSources(e.ingredients, 1, e.title));
      fingerprint.push(`${e.id}:${JSON.stringify(e.ingredients)}`);
    }
  }
  fingerprint.push(`portions:${defaultPortions}`);

  const signature = createHash("sha1").update(fingerprint.join("|")).digest("hex");
  return { sources, signature, mealCount: inWeek.length };
}

/** Override → keyword list → cached AI answer → ask AI (briefly) → "other". */
async function classifyKeys(
  householdId: string,
  items: { key: string; classifyUnit: string | null }[],
): Promise<Map<string, AisleKey>> {
  const result = new Map<string, AisleKey>();
  if (!items.length) return result;
  const keys = items.map((i) => i.key);

  const overrides = await db
    .select()
    .from(aisleOverrides)
    .where(and(eq(aisleOverrides.householdId, householdId), inArray(aisleOverrides.key, keys)));
  for (const o of overrides) if (isAisleKey(o.aisle)) result.set(o.key, o.aisle);

  const unknown: string[] = [];
  for (const i of items) {
    if (result.has(i.key)) continue;
    const guess = classifyByKeyword(i.key, i.classifyUnit);
    if (guess !== "other") result.set(i.key, guess);
    else unknown.push(i.key);
  }
  if (!unknown.length) return result;

  const cached = await db
    .select()
    .from(ingredientAisleCache)
    .where(inArray(ingredientAisleCache.key, unknown));
  for (const c of cached) if (isAisleKey(c.aisle)) result.set(c.key, c.aisle);

  const ask = unknown.filter((k) => !result.has(k));
  if (ask.length) {
    const { pantry: _pantry, other: _other, ...choices } = AISLES;
    try {
      const answers = await Promise.race([
        classifyGroceryAisles(ask, choices),
        new Promise<Record<string, string>>((resolve) =>
          setTimeout(() => resolve({}), AI_CLASSIFY_TIMEOUT_MS),
        ),
      ]);
      const rows = Object.entries(answers).filter(([, a]) => isAisleKey(a));
      for (const [k, a] of rows) result.set(k, a as AisleKey);
      if (rows.length) {
        await db
          .insert(ingredientAisleCache)
          .values(rows.map(([key, aisle]) => ({ key, aisle })))
          .onConflictDoNothing();
      }
    } catch (err) {
      // The list is still useful with these under "Other"; the user can move them.
      console.warn("[shopping] AI aisle lookup failed", err);
    }
  }

  for (const k of unknown) if (!result.has(k)) result.set(k, "other");
  return result;
}

export async function getShoppingList(requestedWeek?: string) {
  const { householdId } = await requireHousehold();
  const weekStart = resolveWeek(requestedWeek);

  const [list] = await db
    .select()
    .from(shoppingLists)
    .where(and(eq(shoppingLists.householdId, householdId), eq(shoppingLists.weekStart, weekStart)));
  const { signature, mealCount } = await collectPlanIngredients(householdId, weekStart);

  const items = list
    ? await db
        .select()
        .from(shoppingItems)
        .where(eq(shoppingItems.listId, list.id))
        .orderBy(asc(shoppingItems.name))
    : [];

  return {
    weekStart,
    mealCount,
    exists: Boolean(list),
    stale: Boolean(list && list.planSignature !== signature),
    items: items.map((i) => ({
      id: i.id,
      name: i.name,
      quantity: i.quantity,
      aisle: (isAisleKey(i.aisle) ? i.aisle : "other") as AisleKey,
      sources: i.sources,
      checked: i.checked,
      manual: i.manual,
    })),
  };
}

export type ShoppingListView = Awaited<ReturnType<typeof getShoppingList>>;
export type ShoppingItemView = ShoppingListView["items"][number];

/**
 * (Re)build the week's list from the plan. Hand-added items stay; ticks carry over for
 * items whose quantity didn't change.
 */
export async function generateShoppingList(weekStartInput: string) {
  const { householdId } = await requireHousehold();
  const weekStart = resolveWeek(weekStartInput);

  const { sources, signature } = await collectPlanIngredients(householdId, weekStart);
  const merged = mergeIngredients(sources);
  const aisles = await classifyKeys(householdId, merged);

  const [existingList] = await db
    .select()
    .from(shoppingLists)
    .where(and(eq(shoppingLists.householdId, householdId), eq(shoppingLists.weekStart, weekStart)));
  const previous = existingList
    ? await db.select().from(shoppingItems).where(eq(shoppingItems.listId, existingList.id))
    : [];
  const wasChecked = new Set(
    previous.filter((p) => !p.manual && p.checked).map((p) => `${p.key}|${p.quantity}`),
  );

  const listId = existingList?.id ?? crypto.randomUUID();
  const rows = merged.map((m) => ({
    listId,
    key: m.key,
    name: m.name.charAt(0).toUpperCase() + m.name.slice(1),
    quantity: m.quantity,
    aisle: aisles.get(m.key) ?? "other",
    sources: m.sources,
    checked: wasChecked.has(`${m.key}|${m.quantity}`),
  }));

  await db.batch([
    existingList
      ? db
          .update(shoppingLists)
          .set({ planSignature: signature, generatedAt: new Date() })
          .where(eq(shoppingLists.id, listId))
      : db.insert(shoppingLists).values({ id: listId, householdId, weekStart, planSignature: signature }),
    db
      .delete(shoppingItems)
      .where(and(eq(shoppingItems.listId, listId), eq(shoppingItems.manual, false))),
    ...(rows.length ? [db.insert(shoppingItems).values(rows)] : []),
  ]);

  revalidatePath("/shopping");
  return { weekStart };
}

/** Load an item only if it belongs to the caller's household. */
async function ownedItem(householdId: string, itemId: string) {
  const [row] = await db
    .select({ item: shoppingItems })
    .from(shoppingItems)
    .innerJoin(shoppingLists, eq(shoppingLists.id, shoppingItems.listId))
    .where(and(eq(shoppingItems.id, itemId), eq(shoppingLists.householdId, householdId)));
  if (!row) throw new Error("Item not found");
  return row.item;
}

export async function setItemChecked(id: string, checked: boolean) {
  const { householdId } = await requireHousehold();
  const item = await ownedItem(householdId, z.string().uuid().parse(id));
  await db.update(shoppingItems).set({ checked }).where(eq(shoppingItems.id, item.id));
  revalidatePath("/shopping");
}

export async function addManualItem(weekStartInput: string, text: string) {
  const { householdId } = await requireHousehold();
  const weekStart = resolveWeek(weekStartInput);
  const name = z.string().trim().min(1).max(200).parse(text);
  const key = normalizeIngredientName(name);

  let [list] = await db
    .select()
    .from(shoppingLists)
    .where(and(eq(shoppingLists.householdId, householdId), eq(shoppingLists.weekStart, weekStart)));
  if (!list) {
    // Empty signature so the page offers to pull in the plan's items too.
    [list] = await db
      .insert(shoppingLists)
      .values({ householdId, weekStart, planSignature: "" })
      .onConflictDoNothing()
      .returning();
    list ??= (
      await db
        .select()
        .from(shoppingLists)
        .where(and(eq(shoppingLists.householdId, householdId), eq(shoppingLists.weekStart, weekStart)))
    )[0];
  }

  const aisle = (await classifyKeys(householdId, [{ key, classifyUnit: null }])).get(key) ?? "other";
  await db.insert(shoppingItems).values({
    listId: list.id,
    key,
    name: name.charAt(0).toUpperCase() + name.slice(1),
    aisle,
    manual: true,
  });
  revalidatePath("/shopping");
}

/** Move an item to another aisle and remember that for next time. */
export async function moveItemToAisle(id: string, aisle: string) {
  const { householdId } = await requireHousehold();
  const item = await ownedItem(householdId, z.string().uuid().parse(id));
  if (!isAisleKey(aisle)) throw new Error("Unknown aisle");
  await db.batch([
    db.update(shoppingItems).set({ aisle }).where(eq(shoppingItems.id, item.id)),
    db
      .insert(aisleOverrides)
      .values({ householdId, key: item.key, aisle })
      .onConflictDoUpdate({
        target: [aisleOverrides.householdId, aisleOverrides.key],
        set: { aisle },
      }),
  ]);
  revalidatePath("/shopping");
}

export async function deleteItem(id: string) {
  const { householdId } = await requireHousehold();
  const item = await ownedItem(householdId, z.string().uuid().parse(id));
  await db.delete(shoppingItems).where(eq(shoppingItems.id, item.id));
  revalidatePath("/shopping");
}
