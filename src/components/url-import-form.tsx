"use client";

import { useState, useTransition } from "react";
import { importRecipeFromUrl } from "@/actions/import-url";
import { RecipeForm } from "@/components/recipe-form";
import type { RecipeDraft } from "@/lib/recipe-schema";

export function UrlImportForm() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<RecipeDraft | null>(null);
  const [pending, startTransition] = useTransition();

  function onImport(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const d = await importRecipeFromUrl(url);
        setDraft(d);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Import failed");
      }
    });
  }

  if (draft) {
    return (
      <div>
        <p className="mb-4 text-sm text-stone-600">
          Review the imported fields, then save to Ben&apos;s Cookbook.
        </p>
        <RecipeForm initial={draft} submitLabel="Save imported recipe" />
      </div>
    );
  }

  return (
    <div>
      <form onSubmit={onImport} className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="url" className="block text-sm font-medium text-stone-700">
            Recipe page URL
          </label>
          <input
            id="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            type="url"
            required
            placeholder="https://"
            className="mt-1 w-full rounded border border-stone-300 bg-white px-3 py-2.5 text-base sm:py-2 sm:text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="min-h-[48px] w-full rounded bg-sage px-4 py-3 text-base font-medium text-white hover:bg-sage/90 disabled:opacity-50 sm:w-auto sm:py-2 sm:text-sm"
        >
          {pending ? "Fetching…" : "Import"}
        </button>
      </form>
      {error && (
        <p className="mt-4 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      <p className="mt-6 text-sm text-stone-600">
        We read public <code className="rounded bg-stone-100 px-1">schema.org</code> recipe
        data when available, then fall back to heuristics (and optional AI) for plain text.
      </p>
    </div>
  );
}
