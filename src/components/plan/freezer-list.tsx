"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addFreezerItem, deleteFreezerItem, setFreezerRemaining } from "@/actions/plan";
import { Stepper } from "@/components/ui/stepper";

type Item = {
  id: string;
  title: string;
  remaining: number;
  frozenOn: string;
  fromPlan: boolean;
};

function frozenLabel(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function FreezerList({ items }: { items: Item[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [portions, setPortions] = useState(2);
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  const stocked = items.filter((i) => i.remaining > 0);
  const planned = items.filter((i) => i.remaining <= 0);

  return (
    <div className="mt-6 space-y-8">
      {error && (
        <p role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {stocked.length === 0 ? (
        <p className="rounded-lg border border-dashed border-stone-300 bg-white/50 p-8 text-center text-stone-600">
          Nothing spare in the freezer. When you plan a recipe, use &ldquo;Extra to freeze&rdquo; to
          batch cook.
        </p>
      ) : (
        <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
          {stocked.map((i) => (
            <li key={i.id} className="px-4 py-2">
              <Stepper
                label={i.title}
                hint={`${i.fromPlan ? "Batch cooked" : "Added"} ${frozenLabel(i.frozenOn)}`}
                value={i.remaining}
                min={0}
                onChange={(n) => run(() => setFreezerRemaining(i.id, n))}
              />
            </li>
          ))}
        </ul>
      )}

      {planned.length > 0 && (
        <section>
          <h2 className="text-sm font-medium uppercase tracking-wide text-stone-500">All planned</h2>
          <ul className="mt-2 divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
            {planned.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-2">
                <span className="min-w-0 truncate text-stone-600">{i.title}</span>
                <button
                  type="button"
                  disabled={pending}
                  className="min-h-[44px] shrink-0 px-2 text-sm text-stone-500 hover:text-red-700"
                  onClick={() => run(() => deleteFreezerItem(i.id))}
                >
                  Clear
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="font-display text-lg font-semibold text-ink">Add something already frozen</h2>
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await addFreezerItem({ title, portions });
              setTitle("");
              setPortions(2);
            });
          }}
        >
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Chilli con carne"
            maxLength={200}
            className="min-h-[48px] w-full rounded border border-stone-300 bg-white px-3 text-base"
            aria-label="What's in the freezer"
          />
          <Stepper label="Portions" value={portions} onChange={setPortions} min={1} />
          <button
            type="submit"
            disabled={pending || !title.trim()}
            className="min-h-[48px] w-full rounded bg-sage px-4 font-medium text-white disabled:opacity-50 sm:w-auto"
          >
            Add to freezer
          </button>
        </form>
      </section>
    </div>
  );
}
