"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { addMeal, deleteQuickMeal, type AddMealInput, type WeekPlan } from "@/actions/plan";
import type { MealSlot } from "@/db/schema";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Stepper } from "@/components/ui/stepper";
import { addDays, formatDay, MEAL_SLOTS, SLOT_LABELS, weekDates } from "@/lib/week";

type Tab = "recipe" | "quick" | "leftovers" | "freezer";

type Selection =
  | { type: "recipe"; id: string; title: string }
  | { type: "quick"; id: string; title: string }
  | { type: "newQuick" }
  | { type: "leftovers"; id: string; title: string; dateLabel: string }
  | { type: "freezer"; id: string; title: string; remaining: number };

const TAB_LABELS: Record<Tab, string> = {
  recipe: "Recipes",
  quick: "Quick meals",
  leftovers: "Leftovers",
  freezer: "Freezer",
};

const listBtn =
  "flex min-h-[48px] w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-cream active:bg-stone-100";
const input =
  "min-h-[48px] w-full rounded border border-stone-300 bg-white px-3 text-base";

export function AddMealSheet(props: {
  date: string;
  slot: MealSlot;
  plan: WeekPlan;
  onClose: () => void;
}) {
  const { date, slot, plan } = props;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(slot === "breakfast" ? "quick" : "recipe");
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState<Selection | null>(null);

  const [portions, setPortions] = useState(plan.defaultPortions);
  const [freezePortions, setFreezePortions] = useState(0);
  const [leftoversNextDay, setLeftoversNextDay] = useState(false);
  const [days, setDays] = useState<string[]>([date]);
  const [newTitle, setNewTitle] = useState("");
  const [newIngredients, setNewIngredients] = useState("");
  const [saveQuick, setSaveQuick] = useState(true);

  const { weekday } = formatDay(date);
  const title = `${SLOT_LABELS[slot]} · ${weekday}`;

  const recipes = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = plan.recipes.filter((r) => !q || r.title.toLowerCase().includes(q));
    // Recipes tagged for this meal (e.g. "breakfast") float to the top.
    const tagged = (r: (typeof matches)[number]) =>
      r.tags.some((t) => t.toLowerCase().includes(slot)) ? 0 : 1;
    return [...matches].sort((a, b) => tagged(a) - tagged(b));
  }, [plan.recipes, query, slot]);

  const quickMeals = useMemo(
    () => [...plan.quickMeals].sort((a, b) => Number(a.slot !== slot) - Number(b.slot !== slot)),
    [plan.quickMeals, slot],
  );

  // Cook entries from the previous few days, or earlier today.
  const leftoverSources = useMemo(() => {
    const slotIdx = MEAL_SLOTS.indexOf(slot);
    return plan.entries.filter(
      (e) =>
        e.kind === "cook" &&
        e.date >= addDays(date, -4) &&
        (e.date < date || (e.date === date && MEAL_SLOTS.indexOf(e.slot) < slotIdx)),
    );
  }, [plan.entries, date, slot]);

  const freezer = plan.freezer.filter((i) => i.remaining > 0);
  const weekDays = weekDates(plan.weekStart);

  function submit(payload: AddMealInput) {
    setError(null);
    startTransition(async () => {
      try {
        await addMeal(payload);
        router.refresh();
        props.onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not add that meal");
      }
    });
  }

  function onAdd() {
    if (!sel) return;
    switch (sel.type) {
      case "recipe":
        return submit({
          kind: "cook",
          date,
          slot,
          recipeId: sel.id,
          portions,
          freezePortions,
          leftoversNextDay: slot === "dinner" && leftoversNextDay,
        });
      case "quick":
        return submit({ kind: "quick", dates: days, slot, quickMealId: sel.id, portions });
      case "newQuick":
        return submit({
          kind: "simple",
          dates: days,
          slot,
          title: newTitle,
          ingredientsText: newIngredients,
          portions,
          saveAsQuickMeal: saveQuick,
        });
      case "leftovers":
        return submit({ kind: "leftovers", date, slot, sourceEntryId: sel.id, portions });
      case "freezer":
        return submit({ kind: "freezer", date, slot, freezerItemId: sel.id, portions });
    }
  }

  const footer = sel ? (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => setSel(null)}
        className="min-h-[48px] rounded border border-stone-300 bg-white px-4 text-ink"
      >
        Back
      </button>
      <button
        type="button"
        disabled={pending || (sel.type === "newQuick" && !newTitle.trim()) || days.length === 0}
        onClick={onAdd}
        className="min-h-[48px] flex-1 rounded bg-sage px-4 font-medium text-white disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add to plan"}
      </button>
    </div>
  ) : undefined;

  return (
    <BottomSheet open onClose={props.onClose} title={title} footer={footer}>
      {error && (
        <p role="alert" className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {!sel && (
        <>
          <div className="-mx-1 mb-3 flex gap-1 overflow-x-auto pb-1" role="tablist">
            {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`min-h-[40px] shrink-0 rounded-full px-4 text-sm ${
                  tab === t ? "bg-ink text-white" : "border border-stone-300 bg-white text-ink"
                }`}
              >
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>

          {tab === "recipe" && (
            <>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search recipes"
                className={input}
                aria-label="Search recipes"
              />
              <ul className="mt-2">
                {recipes.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      className={listBtn}
                      onClick={() => {
                        setSel({ type: "recipe", id: r.id, title: r.title });
                        setLeftoversNextDay(false);
                        setFreezePortions(0);
                      }}
                    >
                      <span className="min-w-0 truncate">{r.title}</span>
                      {r.servings ? (
                        <span className="shrink-0 text-xs text-stone-500">serves {r.servings}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
                {recipes.length === 0 && (
                  <li className="px-3 py-6 text-center text-sm text-stone-500">No recipes match.</li>
                )}
              </ul>
            </>
          )}

          {tab === "quick" && (
            <>
              <button
                type="button"
                className={`${listBtn} border border-dashed border-stone-300 text-accent`}
                onClick={() => {
                  setSel({ type: "newQuick" });
                  setDays([date]);
                }}
              >
                + Something simple (e.g. toast &amp; eggs)
              </button>
              <ul className="mt-2">
                {quickMeals.map((q) => (
                  <li key={q.id} className="flex items-center">
                    <button
                      type="button"
                      className={listBtn}
                      onClick={() => {
                        setSel({ type: "quick", id: q.id, title: q.title });
                        setDays([date]);
                      }}
                    >
                      <span className="min-w-0 truncate">{q.title}</span>
                      {q.ingredients.length > 0 && (
                        <span className="shrink-0 text-xs text-stone-500">
                          {q.ingredients.length} item{q.ingredients.length === 1 ? "" : "s"}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete quick meal ${q.title}`}
                      className="flex h-11 w-11 shrink-0 items-center justify-center text-stone-400 hover:text-red-700"
                      onClick={() => {
                        if (confirm(`Delete "${q.title}" from quick meals?`)) {
                          startTransition(async () => {
                            await deleteQuickMeal(q.id);
                            router.refresh();
                          });
                        }
                      }}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
              {quickMeals.length === 0 && (
                <p className="px-3 py-4 text-sm text-stone-500">
                  Save your go-to breakfasts and lunches here so they&apos;re one tap next time.
                </p>
              )}
            </>
          )}

          {tab === "leftovers" && (
            <ul>
              {leftoverSources.map((e) => {
                const { weekday: wd } = formatDay(e.date);
                const label = `${wd} ${SLOT_LABELS[e.slot].toLowerCase()}`;
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      className={listBtn}
                      onClick={() => setSel({ type: "leftovers", id: e.id, title: e.title, dateLabel: label })}
                    >
                      <span className="min-w-0 truncate">{e.title}</span>
                      <span className="shrink-0 text-xs text-stone-500">{label}</span>
                    </button>
                  </li>
                );
              })}
              {leftoverSources.length === 0 && (
                <li className="px-3 py-6 text-center text-sm text-stone-500">
                  No meals cooked in the last few days to use up.
                </li>
              )}
            </ul>
          )}

          {tab === "freezer" && (
            <ul>
              {freezer.map((i) => (
                <li key={i.id}>
                  <button
                    type="button"
                    className={listBtn}
                    onClick={() => {
                      setSel({ type: "freezer", id: i.id, title: i.title, remaining: i.remaining });
                      setPortions(Math.min(plan.defaultPortions, i.remaining));
                    }}
                  >
                    <span className="min-w-0 truncate">{i.title}</span>
                    <span className="shrink-0 text-xs text-stone-500">{i.remaining} left</span>
                  </button>
                </li>
              ))}
              {freezer.length === 0 && (
                <li className="px-3 py-6 text-center text-sm text-stone-500">
                  Nothing in the freezer yet. Batch cook a recipe and freeze extra portions.
                </li>
              )}
            </ul>
          )}
        </>
      )}

      {sel && (
        <div>
          {sel.type !== "newQuick" && (
            <p className="font-display text-xl font-semibold text-ink">{sel.title}</p>
          )}
          {sel.type === "leftovers" && (
            <p className="text-sm text-stone-500">Leftovers from {sel.dateLabel}</p>
          )}

          {sel.type === "newQuick" && (
            <div className="space-y-3">
              <label className="block">
                <span className="text-sm text-stone-600">What is it?</span>
                <input
                  autoFocus
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Overnight oats"
                  className={`${input} mt-1`}
                  maxLength={200}
                />
              </label>
              <label className="block">
                <span className="text-sm text-stone-600">
                  Shopping items for one meal (optional, one per line)
                </span>
                <textarea
                  value={newIngredients}
                  onChange={(e) => setNewIngredients(e.target.value)}
                  placeholder={"80g oats\n150ml milk\n1 banana"}
                  rows={4}
                  className="mt-1 w-full rounded border border-stone-300 bg-white px-3 py-2 text-base"
                />
              </label>
              <label className="flex min-h-[44px] items-center gap-3">
                <input
                  type="checkbox"
                  checked={saveQuick}
                  onChange={(e) => setSaveQuick(e.target.checked)}
                  className="h-5 w-5 accent-sage"
                />
                <span>Save to quick meals</span>
              </label>
            </div>
          )}

          <div className="mt-3 divide-y divide-stone-200">
            <Stepper
              label={sel.type === "recipe" ? "Eating now" : "Portions"}
              value={portions}
              onChange={setPortions}
              min={1}
              max={sel.type === "freezer" ? sel.remaining : 50}
            />

            {sel.type === "recipe" && slot === "dinner" && (
              <label className="flex min-h-[56px] items-center justify-between gap-3 py-2">
                <span>
                  <span className="block text-ink">Extra for tomorrow&apos;s lunch</span>
                  <span className="text-sm text-stone-500">
                    Adds {portions} more and plans {formatDay(addDays(date, 1)).weekday}&apos;s lunch
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={leftoversNextDay}
                  onChange={(e) => setLeftoversNextDay(e.target.checked)}
                  className="h-6 w-6 shrink-0 accent-sage"
                />
              </label>
            )}

            {sel.type === "recipe" && (
              <Stepper
                label="Extra to freeze"
                hint="Batch cook for later lunches"
                value={freezePortions}
                onChange={setFreezePortions}
              />
            )}

            {(sel.type === "quick" || sel.type === "newQuick") && (
              <div className="py-3">
                <p className="text-ink">Which days?</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {weekDays.map((d) => {
                    const on = days.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          setDays((cur) => (on ? cur.filter((x) => x !== d) : [...cur, d]))
                        }
                        className={`h-11 min-w-[44px] rounded-full px-3 text-sm ${
                          on ? "bg-sage text-white" : "border border-stone-300 bg-white text-ink"
                        }`}
                      >
                        {formatDay(d).weekday.slice(0, 3)}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className="mt-2 min-h-[40px] text-sm text-accent"
                  onClick={() => setDays(weekDays.slice(0, 5))}
                >
                  Every weekday
                </button>
              </div>
            )}
          </div>

          {sel.type === "recipe" && (
            <p className="mt-3 rounded bg-cream px-3 py-2 text-sm text-stone-700">
              You&apos;ll cook{" "}
              <strong>
                {portions + (slot === "dinner" && leftoversNextDay ? portions : 0) + freezePortions}
              </strong>{" "}
              portions.
            </p>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
