"use client";

import { useState } from "react";
import { parseRecipeFromImageUrl } from "@/actions/photo";
import { RecipeForm } from "@/components/recipe-form";
import { compressImageForUpload } from "@/lib/compress-image";
import type { RecipeDraft } from "@/lib/recipe-schema";

export function PhotoImportForm() {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<RecipeDraft | null>(null);
  const [phase, setPhase] = useState<"idle" | "compress" | "upload" | "parse">(
    "idle",
  );

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Allow re-selecting the same file after a failed attempt (common on mobile).
    e.target.value = "";
    if (!file) return;

    setError(null);
    setDraft(null);
    setBlobUrl(null);
    setPhase("compress");
    try {
      const compressed = await compressImageForUpload(file);

      setPhase("upload");
      const fd = new FormData();
      fd.set("file", compressed);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Upload failed (${res.status})`);
      }
      const { url } = (await res.json()) as { url: string };
      setBlobUrl(url);
      setPhase("parse");
      const d = await parseRecipeFromImageUrl(url);
      setDraft({
        title: d.title,
        ingredients: d.ingredients,
        steps: d.steps,
        tags: d.tags ?? [],
        sourceUrl: d.sourceUrl,
        notes: d.notes,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPhase("idle");
    }
  }

  if (draft && blobUrl) {
    return (
      <div>
        <p className="mb-4 text-sm text-stone-600">
          Review and correct the text — especially amounts and long ingredient lists.
        </p>
        <RecipeForm
          initial={{ ...draft, imageUrl: blobUrl }}
          submitLabel="Save recipe from photo"
        />
      </div>
    );
  }

  return (
    <div>
      <div>
        <label
          htmlFor="photo"
          className="block text-sm font-medium text-stone-700"
        >
          Screenshot or photo
        </label>
        <input
          id="photo"
          type="file"
          accept="image/*,image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          onChange={onFileChange}
          disabled={phase !== "idle"}
          className="mt-2 block w-full min-h-[48px] text-base text-stone-600 file:mr-4 file:rounded-md file:border-0 file:bg-sage file:px-4 file:py-2.5 file:text-sm file:font-medium file:text-white"
        />
      </div>
      {phase === "compress" && (
        <p className="mt-4 text-sm text-stone-600">Preparing photo…</p>
      )}
      {phase === "upload" && (
        <p className="mt-4 text-sm text-stone-600">Uploading…</p>
      )}
      {phase === "parse" && (
        <p className="mt-4 text-sm text-stone-600">Reading recipe with AI…</p>
      )}
      {error && (
        <p className="mt-4 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      <p className="mt-6 text-sm text-stone-600">
        Large phone photos are resized automatically before upload. Use a clear
        shot of the recipe text (JPEG or PNG works best).
      </p>
    </div>
  );
}
