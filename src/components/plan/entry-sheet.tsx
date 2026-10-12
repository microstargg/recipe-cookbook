"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteEntry, updateEntry, type PlanEntryView, type WeekPlan } from "@/actions/plan";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Stepper } from "@/components/ui/stepper";
import { formatIngredient } from "@/lib/ingredient-utils";
import { totalCookedPortions } from "@/lib/plan-math";
import { formatDay, SLOT_LABELS } from "@/lib/week";

export function EntrySheet(props: { entry: PlanEntryView; plan: WeekPlan; onClose: () => void }) {
  const { entry, plan } = props;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [portions, setPortions] = useState(entry.portions);
  const [freezePortions, setFreezePortions] = useState(entry.freezePortions);

  const leftovers = plan.entries.filter(
    (e) => e.kind === "leftovers" && e.leftoverOfEntryId === entry.id,
  );
  const source =
    entry.kind === "leftovers"
      ? plan.entries.find((e) => e.id === entry.leftoverOfEntryId)
      : undefined;
  const freezerItem =
    entry.kind === "freezer" ? plan.freezer.find((i) => i.id === entry.freezerItemId) : undefined;

  const dirty = portions !== entry.portions || freezePortions !== entry.freezePortions;
  const total =
    entry.kind === "cook"
      ? totalCookedPortions({ ...entry, portions, freezePortions }, plan.entries)
      : null;

  function run(fn: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
        props.onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  const { weekday } = formatDay(entry.date);

  return (
    <BottomSheet
      open
      onClose={props.onClose}
      title={`${SLOT_LABELS[entry.slot]} · ${weekday}`}
      footer={
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              const extra =
                entry.kind === "cook" && (leftovers.length || entry.freezePortions)
                  ? " Its leftovers and freezer portions will be removed too."
                  : "";
              if (confirm(`Remove ${entry.title} from the plan?${extra}`)) {
                run(() => deleteEntry(entry.id));
              }
            }}
            className="min-h-[48px] rounded border border-red-200 bg-white px-4 text-red-800"
          >
            Remove
          </button>
          <button
            type="button"
            disabled={pending || !dirty}
            onClick={() =>
              run(() =>
                updateEntry(entry.id, {
                  portions,
                  ...(entry.kind === "cook" ? { freezePortions } : {}),
                }),
              )
            }
            className="min-h-[48px] flex-1 rounded bg-sage px-4 font-medium text-white disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      }
    >
      {error && (
        <p role="alert" className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <p className="font-display text-xl font-semibold text-ink">{entry.title}</p>
      {source && (
        <p className="text-sm text-stone-500">
          Leftovers from {formatDay(source.date).weekday} {SLOT_LABELS[source.slot].toLowerCase()}
        </p>
      )}
      {entry.kind === "freezer" && (
        <p className="text-sm text-stone-500">
          From the freezer{freezerItem ? ` · ${freezerItem.remaining} left after planned meals` : ""}
        </p>
      )}
      {entry.recipeId && (
        <Link href={`/recipes/${entry.recipeId}`} className="mt-2 inline-flex min-h-[44px] items-center text-accent">
          Open recipe →
        </Link>
      )}

      <div className="mt-2 divide-y divide-stone-200">
        <Stepper
          label={entry.kind === "cook" ? "Eating now" : "Portions"}
          value={portions}
          onChange={setPortions}
          min={1}
        />
        {entry.kind === "cook" && (
          <Stepper label="Extra to freeze" value={freezePortions} onChange={setFreezePortions} />
        )}
      </div>

      {entry.kind === "cook" && total != null && (
        <div className="mt-3 rounded bg-cream px-3 py-2 text-sm text-stone-700">
          <p>
            Cook <strong>{total}</strong> portions in total.
          </p>
          {leftovers.map((l) => (
            <p key={l.id}>
              · {l.portions} for {formatDay(l.date).weekday} {SLOT_LABELS[l.slot].toLowerCase()}
            </p>
          ))}
          {freezePortions > 0 && <p>· {freezePortions} into the freezer</p>}
        </div>
      )}

      {entry.kind === "simple" && entry.ingredients.length > 0 && (
        <div className="mt-3">
          <p className="text-sm text-stone-500">On the shopping list:</p>
          <ul className="mt-1 list-inside list-disc text-sm text-ink">
            {entry.ingredients.map((i, idx) => (
              <li key={idx}>{formatIngredient(i)}</li>
            ))}
          </ul>
        </div>
      )}
    </BottomSheet>
  );
}
