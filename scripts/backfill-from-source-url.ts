/**
 * Backfill structured ingredients + servings from source URLs.
 *
 * Usage (from repo root):
 *   export $(grep -v '^#' .env.local | xargs)
 *   npm run backfill:source
 *
 * Options:
 *   --dry-run   Print actions without writing
 *   --limit=N   Process at most N recipes
 */

import { db } from "../src/db";
import { recipes } from "../src/db/schema";
import { fetchAndParseUrl } from "../src/lib/import-url";
import {
  coerceIngredients,
  parseIngredientLine,
} from "../src/lib/ingredient-utils";
import type { RecipeIngredient } from "../src/lib/recipe-schema";
import { eq } from "drizzle-orm";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function looksLegacy(ingredients: unknown): boolean {
  if (!Array.isArray(ingredients) || ingredients.length === 0) return true;
  return ingredients.every((item) => typeof item === "string");
}

function structuredCount(ings: RecipeIngredient[]): number {
  return ings.filter((i) => i.amount != null || i.unit != null).length;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : Infinity;

  const all = await db.select().from(recipes);
  const targets = all.slice(0, Number.isFinite(limit) ? limit : all.length);

  const summary = {
    total: targets.length,
    urlOk: 0,
    urlFail: 0,
    servingsFilled: 0,
    ingredientsFromUrl: 0,
    ingredientsOffline: 0,
    noYield: 0,
    skippedNoChange: 0,
  };

  for (const recipe of targets) {
    console.log(`\n→ ${recipe.title} (${recipe.id})`);

    const snapshot = {
      title: recipe.title,
      ingredients: recipe.ingredients,
      steps: recipe.steps,
      notes: recipe.notes,
      servings: recipe.servings,
      servingsLabel: recipe.servingsLabel,
      snapshottedAt: new Date().toISOString(),
    };

    let nextIngredients: RecipeIngredient[] | null = null;
    let nextServings: number | null = recipe.servings;
    let nextServingsLabel: string | null = recipe.servingsLabel;
    let source: "url" | "offline" | "none" = "none";

    if (recipe.sourceUrl) {
      try {
        const { parsed } = await fetchAndParseUrl(recipe.sourceUrl);
        if (parsed.ingredients.length) {
          nextIngredients = parsed.ingredients;
          source = "url";
          summary.urlOk += 1;
          summary.ingredientsFromUrl += 1;
        } else {
          console.warn("  URL parse returned no ingredients; falling back offline");
          summary.urlFail += 1;
        }
        if (recipe.servings == null && parsed.servings != null) {
          nextServings = parsed.servings;
          nextServingsLabel = parsed.servingsLabel ?? nextServingsLabel;
          summary.servingsFilled += 1;
        } else if (parsed.servings == null) {
          summary.noYield += 1;
          console.log("  No yield/servings found on page");
        } else if (parsed.servingsLabel && !recipe.servingsLabel) {
          nextServingsLabel = parsed.servingsLabel;
        }
      } catch (err) {
        summary.urlFail += 1;
        console.warn(
          `  URL fetch failed: ${err instanceof Error ? err.message : err}`,
        );
      }
      await sleep(800);
    }

    if (!nextIngredients) {
      const coerced = coerceIngredients(recipe.ingredients);
      // Re-parse legacy strings (and raw-only objects) for better amount/unit split
      nextIngredients = coerced.map((i) => {
        if (i.amount != null || i.unit != null) return i;
        const line = i.raw ?? i.name;
        return parseIngredientLine(line);
      });
      source = recipe.sourceUrl ? source : "offline";
      if (source === "offline" || looksLegacy(recipe.ingredients)) {
        summary.ingredientsOffline += 1;
      }
    }

    const sameIngredients =
      JSON.stringify(coerceIngredients(recipe.ingredients)) ===
      JSON.stringify(nextIngredients);
    const sameServings =
      recipe.servings === nextServings &&
      recipe.servingsLabel === nextServingsLabel;
    const needsShapeUpgrade = looksLegacy(recipe.ingredients);

    if (sameIngredients && sameServings && !needsShapeUpgrade) {
      summary.skippedNoChange += 1;
      console.log("  No changes");
      continue;
    }

    console.log(
      `  Update via ${source}: structured=${structuredCount(nextIngredients)}/${nextIngredients.length}` +
        (nextServings != null ? `, servings=${nextServings}` : ", servings=null"),
    );

    if (dryRun) {
      console.log("  (dry-run — not written)");
      continue;
    }

    const prevMeta =
      recipe.rawExtractMeta && typeof recipe.rawExtractMeta === "object"
        ? recipe.rawExtractMeta
        : {};

    await db
      .update(recipes)
      .set({
        ingredients: nextIngredients,
        servings: nextServings,
        servingsLabel: nextServingsLabel,
        rawExtractMeta: {
          ...prevMeta,
          preBackfillSnapshot: snapshot,
        },
        updatedAt: new Date(),
      })
      .where(eq(recipes.id, recipe.id));
  }

  console.log("\n=== Backfill summary ===");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
