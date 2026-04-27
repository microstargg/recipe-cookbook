"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { z } from "zod";
import type { RecipeDraft } from "@/lib/recipe-schema";
import { saveRecipe } from "@/actions/recipes";

const formSchema = z
  .object({
    id: z.string().uuid().optional(),
    title: z.string().min(1),
    ingredients: z.array(z.object({ value: z.string() })),
    steps: z.array(z.object({ value: z.string() })),
    tagsRaw: z.string().optional(),
    sourceUrl: z.string().optional(),
    notes: z.string().optional(),
    imageUrl: z.string().optional(),
  })
  .refine(
    (d) => d.ingredients.some((i) => i.value.trim().length > 0),
    { path: ["ingredients"], message: "Add at least one ingredient" },
  )
  .refine((d) => d.steps.some((s) => s.value.trim().length > 0), {
    path: ["steps"],
    message: "Add at least one step",
  });

type FormValues = z.infer<typeof formSchema>;

export function RecipeForm(props: {
  initial?: Partial<RecipeDraft> & {
    id?: string;
    imageUrl?: string | null;
  };
  submitLabel?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const defaultValues: FormValues = {
    title: props.initial?.title ?? "",
    ingredients: props.initial?.ingredients?.length
      ? props.initial.ingredients.map((s) => ({ value: s }))
      : [{ value: "" }],
    steps: props.initial?.steps?.length
      ? props.initial.steps.map((s) => ({ value: s }))
      : [{ value: "" }],
    tagsRaw: (props.initial?.tags ?? []).join(", "),
    sourceUrl: props.initial?.sourceUrl ?? "",
    notes: props.initial?.notes ?? "",
    id: props.initial?.id,
    imageUrl: props.initial?.imageUrl ?? "",
  };

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  const ing = useFieldArray({ control, name: "ingredients" });
  const stepFields = useFieldArray({ control, name: "steps" });

  const onSubmit = (data: FormValues) => {
    setError(null);
    const tags = (data.tagsRaw ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const ingredients = data.ingredients
      .map((i) => i.value.trim())
      .filter(Boolean);
    const stepList = data.steps.map((s) => s.value.trim()).filter(Boolean);
    startTransition(async () => {
      try {
        const imageUrl =
          data.imageUrl && data.imageUrl.length > 0 ? data.imageUrl : undefined;
        const saved = await saveRecipe({
          id: data.id,
          title: data.title,
          ingredients,
          steps: stepList,
          tags,
          sourceUrl: data.sourceUrl || undefined,
          notes: data.notes || undefined,
          imageUrl,
        });
        router.push(`/recipes/${saved.id}`);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save");
      }
    });
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-8"
    >
      {error && (
        <p
          className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          role="alert"
        >
          {error}
        </p>
      )}

      <div>
        <label className="block text-sm font-medium text-stone-700">
          Title
        </label>
        <input
          className="mt-1 w-full rounded border border-stone-300 bg-white px-3 py-2 text-stone-900 shadow-sm"
          {...register("title")}
        />
        {errors.title && (
          <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-stone-700">
            Ingredients
          </label>
          <button
            type="button"
            onClick={() => ing.append({ value: "" })}
            className="text-sm text-accent"
          >
            + Add line
          </button>
        </div>
        <ul className="mt-2 flex flex-col gap-2">
          {ing.fields.map((field, index) => (
            <li key={field.id} className="flex gap-2">
              <input
                className="w-full rounded border border-stone-300 bg-white px-3 py-2"
                {...register(`ingredients.${index}.value` as const)}
              />
              <button
                type="button"
                onClick={() => ing.remove(index)}
                className="shrink-0 text-sm text-stone-400 hover:text-stone-700"
                aria-label="Remove ingredient"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        {errors.ingredients && (
          <p className="mt-1 text-sm text-red-600">
            {String(errors.ingredients?.root?.message ?? errors.ingredients?.message)}
          </p>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-stone-700">Steps</label>
          <button
            type="button"
            onClick={() => stepFields.append({ value: "" })}
            className="text-sm text-accent"
          >
            + Add step
          </button>
        </div>
        <ol className="mt-2 flex flex-col gap-2">
          {stepFields.fields.map((field, index) => (
            <li key={field.id} className="flex gap-2">
              <span className="mt-2 w-6 shrink-0 text-stone-400">
                {index + 1}.
              </span>
              <textarea
                rows={2}
                className="w-full rounded border border-stone-300 bg-white px-3 py-2"
                {...register(`steps.${index}.value` as const)}
              />
              <button
                type="button"
                onClick={() => stepFields.remove(index)}
                className="shrink-0 self-start text-sm text-stone-400 hover:text-stone-700"
              >
                Remove
              </button>
            </li>
          ))}
        </ol>
        {errors.steps && (
          <p className="mt-1 text-sm text-red-600">
            {String(errors.steps?.root?.message ?? errors.steps?.message)}
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-700">
          Tags (comma-separated)
        </label>
        <input
          className="mt-1 w-full rounded border border-stone-300 bg-white px-3 py-2"
          placeholder="dinner, vegetarian"
          {...register("tagsRaw")}
        />
      </div>

      {props.initial?.sourceUrl && (
        <p className="text-sm text-stone-600">
          <span className="font-medium">Source: </span>
          <a
            href={props.initial.sourceUrl}
            className="text-accent underline"
            target="_blank"
            rel="noreferrer"
          >
            {props.initial.sourceUrl}
          </a>
        </p>
      )}

      <div>
        <label className="block text-sm font-medium text-stone-700">Notes</label>
        <textarea
          rows={3}
          className="mt-1 w-full rounded border border-stone-300 bg-white px-3 py-2"
          {...register("notes")}
        />
      </div>

      {props.initial?.imageUrl ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-stone-700">Recipe photo</p>
          <p className="text-sm text-stone-600">
            We pulled the main image from the page (or Open Graph). It will be saved as the cover
            when you submit.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={props.initial.imageUrl}
            alt=""
            className="max-h-56 w-auto max-w-full rounded-md border border-stone-200 object-contain"
          />
          <input type="hidden" {...register("imageUrl")} />
        </div>
      ) : null}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-sage px-4 py-2 text-white shadow hover:bg-sage/90 disabled:opacity-50"
        >
          {pending ? "Saving…" : props.submitLabel ?? "Save recipe"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded border border-stone-300 px-4 py-2 text-stone-700"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
