"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export interface RecipeListItem {
  id: string;
  title: string;
  sourceUrl: string | null;
  updatedAtLabel: string;
  thumbUrl?: string;
  tags: string[];
  ingredients: string[];
  steps: string[];
  notes: string | null;
}

function recipeMatches(query: string, r: RecipeListItem): boolean {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  const hay = [
    r.title,
    ...r.tags,
    ...r.ingredients,
    ...r.steps,
    r.notes ?? "",
    r.sourceUrl ?? "",
  ]
    .join("\n")
    .toLowerCase();
  return hay.includes(q);
}

export function RecipeListClient({ recipes }: { recipes: RecipeListItem[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () => recipes.filter((r) => recipeMatches(query, r)),
    [recipes, query],
  );

  return (
    <div>
      <div className="mb-4">
        <label htmlFor="recipe-search" className="mb-1.5 block text-sm font-medium text-stone-700">
          Search
        </label>
        <input
          id="recipe-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by title, ingredient, tag, or notes…"
          className="w-full max-w-md rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-ink shadow-sm placeholder:text-stone-400 focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/30"
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <p className="sr-only" aria-live="polite">
        {filtered.length === recipes.length
          ? `${recipes.length} recipes`
          : `${filtered.length} of ${recipes.length} recipes match`}
      </p>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-stone-200 bg-white/50 p-8 text-center text-stone-600">
          <p>
            No recipes match &ldquo;{query.trim() || "…"}&rdquo;.
          </p>
          <p className="mt-2 text-sm">Try a shorter word or clear the search.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered.map((r) => (
            <li key={r.id}>
              <Link
                href={`/recipes/${r.id}`}
                className="flex items-center gap-4 rounded-lg border border-stone-200 bg-white p-4 shadow-sm transition hover:border-sage/40 hover:shadow"
              >
                {r.thumbUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.thumbUrl}
                    alt=""
                    className="h-16 w-16 shrink-0 rounded object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="font-medium text-ink">{r.title}</h2>
                  {r.sourceUrl && (
                    <p className="mt-0.5 truncate text-xs text-stone-500">{r.sourceUrl}</p>
                  )}
                  <p className="mt-1 text-xs text-stone-500">
                    Updated {r.updatedAtLabel}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
