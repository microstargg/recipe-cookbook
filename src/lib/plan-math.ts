/** Shared portion maths for the planner and the shopping list. Client-safe. */

type EntryLike = {
  id: string;
  kind: string;
  portions: number;
  freezePortions: number;
  leftoverOfEntryId: string | null;
};

/** Portions a cook entry has to make: eaten now + every leftovers meal from it + freezer extras. */
export function totalCookedPortions(cook: EntryLike, all: EntryLike[]): number {
  const leftovers = all
    .filter((e) => e.kind === "leftovers" && e.leftoverOfEntryId === cook.id)
    .reduce((sum, e) => sum + e.portions, 0);
  return cook.portions + leftovers + cook.freezePortions;
}

/**
 * Scale factor to apply to a recipe's ingredients. A recipe with no servings count is
 * assumed to feed `fallbackServings` (the household's usual portions).
 */
export function recipeScaleFactor(
  portionsNeeded: number,
  recipeServings: number | null,
  fallbackServings: number,
): number {
  const base = recipeServings && recipeServings > 0 ? recipeServings : fallbackServings;
  return base > 0 ? portionsNeeded / base : 1;
}
