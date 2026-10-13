"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useOptimistic, useState, useTransition } from "react";
import {
  addManualItem,
  deleteItem,
  generateShoppingList,
  moveItemToAisle,
  setItemChecked,
  type ShoppingItemView,
  type ShoppingListView,
} from "@/actions/shopping";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { AISLES, orderedAisles, STORES, type AisleKey, type StoreKey } from "@/lib/shopping/aisles";
import { addDays, formatWeekRange } from "@/lib/week";

const STORE_PREF_KEY = "shopping-store";
const POLL_MS = 10_000;

function readStorePref(): StoreKey {
  try {
    const v = localStorage.getItem(STORE_PREF_KEY);
    if (v && v in STORES) return v as StoreKey;
  } catch {
    // Private mode etc.
  }
  return "lidl";
}

export function ShoppingList({ list }: { list: ShoppingListView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [store, setStore] = useState<StoreKey>("lidl");
  const [newItem, setNewItem] = useState("");
  const [menuItem, setMenuItem] = useState<ShoppingItemView | null>(null);
  const [items, toggleOptimistic] = useOptimistic(
    list.items,
    (state, { id, checked }: { id: string; checked: boolean }) =>
      state.map((i) => (i.id === id ? { ...i, checked } : i)),
  );

  useEffect(() => setStore(readStorePref()), []);

  // Keep both phones in step while shopping together.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const t = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router]);

  const groups = useMemo(() => {
    const byAisle = new Map<AisleKey, ShoppingItemView[]>();
    for (const i of items) {
      if (!byAisle.has(i.aisle)) byAisle.set(i.aisle, []);
      byAisle.get(i.aisle)!.push(i);
    }
    return orderedAisles(store)
      .filter((a) => byAisle.has(a))
      .map((a) => ({
        aisle: a,
        items: byAisle.get(a)!.sort((x, y) => Number(x.checked) - Number(y.checked)),
      }));
  }, [items, store]);

  const remaining = items.filter((i) => !i.checked && i.aisle !== "pantry").length;

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

  function toggle(item: ShoppingItemView) {
    startTransition(async () => {
      toggleOptimistic({ id: item.id, checked: !item.checked });
      try {
        await setItemChecked(item.id, !item.checked);
        router.refresh();
      } catch {
        setError("Couldn't save that tick. Check your signal and try again.");
      }
    });
  }

  async function share() {
    const text = groups
      .filter((g) => g.items.some((i) => !i.checked))
      .map(
        (g) =>
          `${AISLES[g.aisle]}\n${g.items
            .filter((i) => !i.checked)
            .map((i) => `- ${i.name}${i.quantity ? ` (${i.quantity})` : ""}`)
            .join("\n")}`,
      )
      .join("\n\n");
    const title = `Shopping ${formatWeekRange(list.weekStart)}`;
    if (navigator.share) {
      try {
        await navigator.share({ title, text });
        return;
      } catch {
        // Cancelled: fall through to copy.
      }
    }
    try {
      await navigator.clipboard.writeText(`${title}\n\n${text}`);
      setError(null);
      alert("List copied");
    } catch {
      setError("Couldn't share or copy the list on this device.");
    }
  }

  const generateLabel = list.exists ? "Update from plan" : "Make list from plan";

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/shopping?week=${addDays(list.weekStart, -7)}`}
          className="flex h-11 w-11 items-center justify-center rounded-md text-2xl text-ink hover:bg-stone-100"
          aria-label="Previous week"
        >
          ‹
        </Link>
        <div className="text-center">
          <h1 className="font-display text-xl font-semibold text-ink sm:text-2xl">Shopping</h1>
          <p className="text-sm text-stone-500">{formatWeekRange(list.weekStart)}</p>
        </div>
        <Link
          href={`/shopping?week=${addDays(list.weekStart, 7)}`}
          className="flex h-11 w-11 items-center justify-center rounded-md text-2xl text-ink hover:bg-stone-100"
          aria-label="Next week"
        >
          ›
        </Link>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {list.mealCount > 0 && (!list.exists || list.stale) && (
        <div className="mt-4 rounded-xl border border-sage/40 bg-white p-4">
          <p className="text-ink">
            {list.exists
              ? "The meal plan has changed since this list was made."
              : `${list.mealCount} meal${list.mealCount === 1 ? "" : "s"} planned this week.`}
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => generateShoppingList(list.weekStart))}
            className="mt-3 min-h-[48px] w-full rounded bg-sage px-4 font-medium text-white disabled:opacity-50 sm:w-auto"
          >
            {pending ? "Working it out…" : generateLabel}
          </button>
          {list.exists && (
            <p className="mt-2 text-xs text-stone-500">
              Items you added by hand stay. Ticks stay where the amount hasn&apos;t changed.
            </p>
          )}
        </div>
      )}

      {list.mealCount === 0 && !list.exists && (
        <div className="mt-6 rounded-lg border border-dashed border-stone-300 bg-white/50 p-8 text-center text-stone-600">
          <p>No meals planned for this week yet.</p>
          <Link href={`/plan?week=${list.weekStart}`} className="mt-3 inline-flex min-h-[44px] items-center text-accent">
            Plan this week →
          </Link>
        </div>
      )}

      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const text = newItem.trim();
          if (!text) return;
          setNewItem("");
          run(() => addManualItem(list.weekStart, text));
        }}
      >
        <input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          placeholder="Add an item, e.g. bin bags"
          maxLength={200}
          enterKeyHint="done"
          className="min-h-[48px] min-w-0 flex-1 rounded border border-stone-300 bg-white px-3 text-base"
          aria-label="Add an item"
        />
        <button
          type="submit"
          disabled={!newItem.trim()}
          className="min-h-[48px] shrink-0 rounded border border-stone-300 bg-white px-4 text-ink disabled:opacity-50"
        >
          Add
        </button>
      </form>

      {items.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex rounded-full border border-stone-300 bg-white p-0.5" role="radiogroup" aria-label="Shop">
            {(Object.keys(STORES) as StoreKey[]).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={store === s}
                onClick={() => {
                  setStore(s);
                  try {
                    localStorage.setItem(STORE_PREF_KEY, s);
                  } catch {
                    // Not persisted; fine.
                  }
                }}
                className={`min-h-[36px] rounded-full px-3 text-sm ${
                  store === s ? "bg-ink text-white" : "text-ink"
                }`}
              >
                {STORES[s]}
              </button>
            ))}
          </div>
          <button type="button" onClick={share} className="min-h-[40px] px-2 text-sm text-accent">
            Share list
          </button>
        </div>
      )}

      {items.length > 0 && (
        <p className="mt-3 text-sm text-stone-500">
          {remaining === 0 ? "All done!" : `${remaining} item${remaining === 1 ? "" : "s"} to get`}
        </p>
      )}

      <div className="mt-3 space-y-5">
        {groups.map((g) => {
          const left = g.items.filter((i) => !i.checked).length;
          return (
            <section key={g.aisle}>
              <h2 className="flex items-baseline justify-between px-1 text-sm font-semibold uppercase tracking-wide text-stone-500">
                <span>{AISLES[g.aisle]}</span>
                <span className="font-normal normal-case tracking-normal">
                  {left === 0 ? "done" : left}
                </span>
              </h2>
              {g.aisle === "pantry" && (
                <p className="px-1 text-xs text-stone-500">Usually in the cupboard. Tick if you&apos;ve got enough.</p>
              )}
              <ul className="mt-1 divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white">
                {g.items.map((i) => (
                  <li key={i.id} className="flex items-stretch">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={i.checked}
                      onClick={() => toggle(i)}
                      className="flex min-h-[56px] min-w-0 flex-1 items-center gap-3 px-4 py-2 text-left active:bg-stone-50"
                    >
                      <span
                        aria-hidden
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${
                          i.checked ? "border-sage bg-sage text-white" : "border-stone-300"
                        }`}
                      >
                        {i.checked && (
                          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path
                              fillRule="evenodd"
                              d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block ${i.checked ? "text-stone-400 line-through" : "text-ink"}`}>
                          {i.name}
                        </span>
                        {!i.checked && i.sources.length > 0 && (
                          <span className="block truncate text-xs text-stone-500">{i.sources.join(", ")}</span>
                        )}
                      </span>
                      {i.quantity && (
                        <span className={`shrink-0 text-sm tabular-nums ${i.checked ? "text-stone-400" : "text-stone-600"}`}>
                          {i.quantity}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setMenuItem(i)}
                      aria-label={`Options for ${i.name}`}
                      className="flex w-11 shrink-0 items-center justify-center text-stone-400 hover:text-ink"
                    >
                      ⋯
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {menuItem && (
        <BottomSheet open title={menuItem.name} onClose={() => setMenuItem(null)}>
          <p className="text-sm text-stone-500">Move to a different aisle. We&apos;ll remember it next time.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {orderedAisles(store).map((a) => (
              <button
                key={a}
                type="button"
                disabled={pending}
                onClick={() => {
                  const id = menuItem.id;
                  setMenuItem(null);
                  run(() => moveItemToAisle(id, a));
                }}
                className={`min-h-[48px] rounded-lg border px-3 text-left text-sm ${
                  a === menuItem.aisle ? "border-sage bg-sage/10 text-ink" : "border-stone-200 bg-white text-ink"
                }`}
              >
                {AISLES[a]}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              const id = menuItem.id;
              setMenuItem(null);
              run(() => deleteItem(id));
            }}
            className="mt-4 min-h-[48px] w-full rounded border border-red-200 bg-white px-4 text-red-800"
          >
            Remove from list
          </button>
        </BottomSheet>
      )}
    </div>
  );
}
