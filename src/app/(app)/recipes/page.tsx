import Link from "next/link";
import { getRecipes } from "@/actions/recipes";
import { recipeImages } from "@/db/schema";
import { db } from "@/db";
import { inArray } from "drizzle-orm";

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

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink">
            Your recipes
          </h1>
          <p className="mt-1 text-stone-600">
            Saved in your database — they won’t disappear when a site goes offline.
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
        <ul className="flex flex-col gap-3">
          {list.map((r) => {
            const thumb = firstImage.get(r.id);
            return (
              <li key={r.id}>
                <Link
                  href={`/recipes/${r.id}`}
                  className="flex items-center gap-4 rounded-lg border border-stone-200 bg-white p-4 shadow-sm transition hover:border-sage/40 hover:shadow"
                >
                  {thumb && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumb}
                      alt=""
                      className="h-16 w-16 shrink-0 rounded object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <h2 className="font-medium text-ink">{r.title}</h2>
                    {r.sourceUrl && (
                      <p className="mt-0.5 truncate text-xs text-stone-500">
                        {r.sourceUrl}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-stone-500">
                      Updated {r.updatedAt.toLocaleDateString()}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
