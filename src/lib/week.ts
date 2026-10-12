/** Plan dates are plain "YYYY-MM-DD" strings; weeks start on Monday. Pure, client-safe. */

export const PLAN_TIME_ZONE = "Europe/London";

export const MEAL_SLOTS = ["breakfast", "lunch", "dinner"] as const;

export const SLOT_LABELS: Record<(typeof MEAL_SLOTS)[number], string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(s: string | null | undefined): s is string {
  if (!s || !ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function toUtc(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export function addDays(iso: string, days: number): string {
  const d = toUtc(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week containing `iso`. */
export function weekStartOf(iso: string): string {
  const dow = toUtc(iso).getUTCDay(); // 0 = Sunday
  return addDays(iso, dow === 0 ? -6 : 1 - dow);
}

export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function todayIso(timeZone = PLAN_TIME_ZONE): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function formatDay(iso: string): { weekday: string; short: string } {
  const d = toUtc(iso);
  return {
    weekday: d.toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" }),
    short: d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }),
  };
}

export function formatWeekRange(weekStart: string): string {
  const end = addDays(weekStart, 6);
  const a = toUtc(weekStart);
  const b = toUtc(end);
  const sameMonth = a.getUTCMonth() === b.getUTCMonth();
  const startLabel = a.toLocaleDateString("en-GB", {
    day: "numeric",
    month: sameMonth ? undefined : "short",
    timeZone: "UTC",
  });
  const endLabel = b.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${startLabel} – ${endLabel}`;
}
