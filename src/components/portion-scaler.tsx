"use client";

import { useMemo, useState } from "react";
import type { RecipeIngredient } from "@/lib/recipe-schema";
import { formatIngredient, scaleIngredient } from "@/lib/ingredient-utils";

export function PortionScaler(props: {
  ingredients: RecipeIngredient[];
  servings: number | null;
  servingsLabel: string | null;
}) {
  const baseServings = props.servings != null && props.servings > 0 ? props.servings : 1;
  const [desired, setDesired] = useState(baseServings);

  const factor = desired / baseServings;
  const scaled = useMemo(
    () => props.ingredients.map((i) => scaleIngredient(i, factor)),
    [props.ingredients, factor],
  );

  const hasRealServings = props.servings != null && props.servings > 0;
  const label =
    props.servingsLabel?.trim() ||
    (hasRealServings ? `${props.servings} servings` : null);

  function bump(delta: number) {
    setDesired((d) => Math.max(1, Math.min(99, d + delta)));
  }

  return (
    <section className="mb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-medium text-ink">Ingredients</h2>
          {label ? (
            <p className="mt-1 text-sm text-stone-600">
              Recipe yield: {label}
              {!hasRealServings ? " (amounts as written)" : null}
            </p>
          ) : (
            <p className="mt-1 text-sm text-stone-600">
              Portions scale relative to the recipe as written
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-stone-600">
            {hasRealServings ? "Portions" : "Scale"}
          </span>
          <button
            type="button"
            onClick={() => bump(-1)}
            disabled={desired <= 1}
            className="inline-flex h-10 w-10 items-center justify-center rounded border border-stone-300 bg-white text-lg text-ink disabled:opacity-40"
            aria-label="Decrease portions"
          >
            −
          </button>
          <input
            type="number"
            min={1}
            max={99}
            value={desired}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (!Number.isFinite(n)) return;
              setDesired(Math.max(1, Math.min(99, Math.round(n))));
            }}
            className="h-10 w-14 rounded border border-stone-300 bg-white text-center text-sm tabular-nums"
            aria-label={hasRealServings ? "Number of portions" : "Scale multiplier"}
          />
          <button
            type="button"
            onClick={() => bump(1)}
            disabled={desired >= 99}
            className="inline-flex h-10 w-10 items-center justify-center rounded border border-stone-300 bg-white text-lg text-ink disabled:opacity-40"
            aria-label="Increase portions"
          >
            +
          </button>
          {desired !== baseServings ? (
            <button
              type="button"
              onClick={() => setDesired(baseServings)}
              className="ml-1 text-sm text-accent underline"
            >
              Reset
            </button>
          ) : null}
        </div>
      </div>
      <ul className="mt-3 list-disc pl-5 text-stone-800">
        {scaled.map((i, j) => (
          <li key={j}>{formatIngredient(i)}</li>
        ))}
      </ul>
    </section>
  );
}
