import Link from "next/link";
import { getRecipes } from "@/actions/recipes";
import { recipeImages } from "@/db/schema";
import { db } from "@/db";
import { inArray } from "drizzle-orm";
import { RecipeListClient } from "@/components/recipe-list-client";

export default async function RecipesPage() {
  const list = await getRecipes();
  const ids = list.map((r) => r.id);
  const firstImage = new Map<string, string>();
  if (ids.length) {
    const imgs = await db
      .select()
      .from(recipeImages)
      .where(inArray(recipeImages.recipeId, ids));
    for (const im of imgs) {
      if (!firstImage.has(im.recipeId)) firstImage.set(im.recipeId, im.url);
    }
  }

  const recipeItems = list.map((r) => ({
    id: r.id,
    title: r.title,
    sourceUrl: r.sourceUrl,
    updatedAtLabel: r.updatedAt.toLocaleDateString(),
    thumbUrl: firstImage.get(r.id),
    tags: r.tags ?? [],
    ingredients: r.ingredients ?? [],
    steps: r.steps ?? [],
    notes: r.notes,
  }));

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink">
            Your recipes
          </h1>
          <p className="mt-1 text-stone-600">
            Your saved recipes in Ben&apos;s Cookbook — they won&apos;t disappear when a site goes
            offline.
          </p>
        </div>
        <Link
          href="/recipes/new"
          className="rounded bg-sage px-4 py-2 text-sm font-medium text-white shadow hover:bg-sage/90"
        >
          New recipe
        </Link>
      </div>

      {list.length === 0 ? (
        <div className="rounded-lg border border-dashed border-stone-300 bg-white/50 p-12 text-center text-stone-600">
          <p>No recipes yet.</p>
          <p className="mt-2 text-sm">
            <Link className="text-accent underline" href="/recipes/new">
              Add one manually
            </Link>{" "}
            or import{" "}
            <Link className="text-accent underline" href="/import/url">
              from a URL
            </Link>
            .
          </p>
        </div>
      ) : (
        <RecipeListClient recipes={recipeItems} />
      )}
    </div>
  );
}
