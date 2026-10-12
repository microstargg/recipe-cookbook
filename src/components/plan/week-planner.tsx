"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { copyPreviousWeek, type PlanEntryView, type WeekPlan } from "@/actions/plan";
import type { MealSlot } from "@/db/schema";
import { totalCookedPortions } from "@/lib/plan-math";
import {
  addDays,
  formatDay,
  formatWeekRange,
  MEAL_SLOTS,
  SLOT_LABELS,
  weekDates,
} from "@/lib/week";
import { AddMealSheet } from "./add-meal-sheet";
import { EntrySheet } from "./entry-sheet";

const KIND_BADGE: Record<string, { label: string; className: string } | null> = {
  cook: null,
  leftovers: { label: "Leftovers", className: "bg-amber-100 text-amber-900" },
  freezer: { label: "Freezer", className: "bg-sky-100 text-sky-900" },
  simple: null,
};

export function WeekPlanner({ plan }: { plan: WeekPlan }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ date: string; slot: MealSlot } | null>(null);
  const [openEntryId, setOpenEntryId] = useState<string | null>(null);

  const dates = weekDates(plan.weekStart);
  const weekEnd = dates[6];
  const thisWeek = plan.entries.filter((e) => e.date >= plan.weekStart && e.date <= weekEnd);
  const freezerCount = plan.freezer.reduce((n, i) => n + Math.max(i.remaining, 0), 0);

  const bySlot = useMemo(() => {
    const m = new Map<string, PlanEntryView[]>();
    for (const e of plan.entries) {
      const key = `${e.date}|${e.slot}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(e);
    }
    return m;
  }, [plan.entries]);

  const openEntry = openEntryId ? plan.entries.find((e) => e.id === openEntryId) ?? null : null;

  function cookSummary(e: PlanEntryView): string | null {
    if (e.kind !== "cook") return null;
    const total = totalCookedPortions(e, plan.entries);
    const leftovers = total - e.portions - e.freezePortions;
    const parts = [`Makes ${total}`];
    if (leftovers > 0) parts.push(`${leftovers} for leftovers`);
    if (e.freezePortions > 0) parts.push(`${e.freezePortions} to freeze`);
    return total === e.portions ? null : parts.join(" · ");
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/plan?week=${addDays(plan.weekStart, -7)}`}
          className="flex h-11 w-11 items-center justify-center rounded-md text-ink hover:bg-stone-100"
          aria-label="Previous week"
        >
          <Chevron dir="left" />
        </Link>
        <div className="text-center">
          <h1 className="font-display text-xl font-semibold text-ink sm:text-2xl">
            {formatWeekRange(plan.weekStart)}
          </h1>
          {(plan.today < plan.weekStart || plan.today > weekEnd) && (
            <Link href="/plan" className="text-sm text-accent">
              Back to this week
            </Link>
          )}
        </div>
        <Link
          href={`/plan?week=${addDays(plan.weekStart, 7)}`}
          className="flex h-11 w-11 items-center justify-center rounded-md text-ink hover:bg-stone-100"
          aria-label="Next week"
        >
          <Chevron dir="right" />
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/freezer"
          className="inline-flex min-h-[40px] items-center rounded-full border border-stone-300 bg-white px-4 text-sm text-ink"
        >
          Freezer · {freezerCount} portion{freezerCount === 1 ? "" : "s"}
        </Link>
        {thisWeek.length === 0 && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                try {
                  const { copied } = await copyPreviousWeek(plan.weekStart);
                  if (!copied) setError("Last week was empty, so there was nothing to copy.");
                  router.refresh();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Could not copy last week");
                }
              })
            }
            className="inline-flex min-h-[40px] items-center rounded-full border border-stone-300 bg-white px-4 text-sm text-ink disabled:opacity-50"
          >
            {pending ? "Copying…" : "Copy last week"}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-800">
          {error}
        </p>
      )}

      <ol className="mt-5 space-y-4">
        {dates.map((date) => {
          const { weekday, short } = formatDay(date);
          const isToday = date === plan.today;
          return (
            <li
              key={date}
              className={`overflow-hidden rounded-xl border bg-white ${
                isToday ? "border-sage ring-1 ring-sage" : "border-stone-200"
              }`}
            >
              <div className="flex items-baseline justify-between border-b border-stone-100 px-4 py-2.5">
                <h2 className="font-display text-lg font-semibold text-ink">{weekday}</h2>
                <span className="text-sm text-stone-500">
                  {isToday ? "Today · " : ""}
                  {short}
                </span>
              </div>
              <div className="divide-y divide-stone-100">
                {MEAL_SLOTS.map((slot) => {
                  const items = bySlot.get(`${date}|${slot}`) ?? [];
                  return (
                    <div key={slot} className="flex items-start gap-3 px-4 py-2">
                      <span className="w-[4.5rem] shrink-0 pt-2.5 text-xs font-medium uppercase tracking-wide text-stone-500">
                        {SLOT_LABELS[slot]}
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        {items.map((e) => {
                          const badge = KIND_BADGE[e.kind];
                          const summary = cookSummary(e);
                          return (
                            <button
                              key={e.id}
                              type="button"
                              onClick={() => setOpenEntryId(e.id)}
                              className="flex min-h-[44px] w-full flex-col justify-center rounded-md px-2 py-1.5 text-left hover:bg-cream active:bg-stone-100"
                            >
                              <span className="flex items-center gap-2">
                                <span className="min-w-0 truncate text-ink">{e.title}</span>
                                {badge && (
                                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${badge.className}`}>
                                    {badge.label}
                                  </span>
                                )}
                              </span>
                              {summary && <span className="text-xs text-stone-500">{summary}</span>}
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => setAdding({ date, slot })}
                          className="flex min-h-[44px] items-center rounded-md px-2 text-left text-sm text-stone-500 hover:bg-cream hover:text-accent"
                          aria-label={`Add ${SLOT_LABELS[slot].toLowerCase()} on ${weekday}`}
                        >
                          + Add
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ol>

      {adding && (
        <AddMealSheet
          key={`${adding.date}|${adding.slot}`}
          date={adding.date}
          slot={adding.slot}
          plan={plan}
          onClose={() => setAdding(null)}
        />
      )}
      {openEntry && (
        <EntrySheet
          key={openEntry.id}
          entry={openEntry}
          plan={plan}
          onClose={() => setOpenEntryId(null)}
        />
      )}
    </div>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d={dir === "left" ? "M15.75 19.5 8.25 12l7.5-7.5" : "m8.25 4.5 7.5 7.5-7.5 7.5"}
      />
    </svg>
  );
}
