"use client";

import { useState, useTransition } from "react";
import {
  importRecipeFromPastedText,
  importRecipeFromUrl,
} from "@/actions/import-url";
import { RecipeForm } from "@/components/recipe-form";
import type { RecipeDraft } from "@/lib/recipe-schema";

export function UrlImportForm() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<RecipeDraft | null>(null);
  const [pending, startTransition] = useTransition();
  const [showPaste, setShowPaste] = useState(false);
  const [pasted, setPasted] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [pastePending, startPasteTransition] = useTransition();

  function onPasteImport(e: React.FormEvent) {
    e.preventDefault();
    setPasteError(null);
    startPasteTransition(async () => {
      try {
        const result = await importRecipeFromPastedText(pasted, url);
        if (!result.ok) {
          setPasteError(result.error);
          return;
        }
        setDraft(result.draft);
      } catch {
        setPasteError("Could not read that text. Try again, or import a screenshot instead.");
      }
    });
  }

  function onImport(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const result = await importRecipeFromUrl(url);
        if (!result.ok) {
          setError(result.error);
          if (result.blocked) setShowPaste(true);
          return;
        }
        setDraft(result.draft);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Import failed";
        setError(
          message.includes("omitted") || message.includes("digest")
            ? "Could not import that URL. Try again, or import a screenshot instead."
            : message,
        );
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
            Recipe or Instagram URL
          </label>
          <input
            id="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            type="url"
            required
            placeholder="https://www.instagram.com/reel/…"
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
      {showPaste ? (
        <form onSubmit={onPasteImport} className="mt-6 flex flex-col gap-3">
          <label htmlFor="pasted" className="block text-sm font-medium text-stone-700">
            Paste the recipe text
          </label>
          <textarea
            id="pasted"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={10}
            required
            placeholder="Copy the ingredients and method from the page and paste them here…"
            className="w-full rounded border border-stone-300 bg-white px-3 py-2.5 text-base sm:text-sm"
          />
          <button
            type="submit"
            disabled={pastePending}
            className="min-h-[48px] w-full rounded bg-sage px-4 py-3 text-base font-medium text-white hover:bg-sage/90 disabled:opacity-50 sm:w-auto sm:self-start sm:py-2 sm:text-sm"
          >
            {pastePending ? "Reading…" : "Import pasted text"}
          </button>
          {pasteError && (
            <p className="text-sm text-red-600" role="alert">
              {pasteError}
            </p>
          )}
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowPaste(true)}
          className="mt-4 text-sm text-stone-600 underline hover:text-stone-800"
        >
          Or paste the recipe text instead
        </button>
      )}
      <p className="mt-6 text-sm text-stone-600">
        Recipe sites use public{" "}
        <code className="rounded bg-stone-100 px-1">schema.org</code> data when available,
        then heuristics and optional AI. Instagram share links work when the recipe is in
        the caption or comments. Private reels, or recipes that only appear in the video,
        still need a screenshot.
      </p>
    </div>
  );
}
