// Writing stats (plan.md 2.3 "Word count / reading time / session goals",
// Phase 10). Pure helpers shared by the server action and the Stats view.

/** The property a chapter's (or any note's) own word target is kept in (lib/templates.ts). */
export const TARGET_KEY = "target-words";

/** One calendar day in the reader's time zone, as "2026-03-09". */
export type WritingDay = { day: string; added: number; removed: number };

/** The day before or after `day`, in the same "YYYY-MM-DD" form. Plain date arithmetic: no time zone involved. */
export function shiftDay(day: string, by: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + by)).toISOString().slice(0, 10);
}

/** The last `count` days ending today, oldest first, with zeroes for days nothing was written. */
export function fillDays(days: WritingDay[], today: string, count: number): WritingDay[] {
  const byDay = new Map(days.map((d) => [d.day, d]));
  return Array.from({ length: count }, (_, i) => {
    const day = shiftDay(today, i - count + 1);
    return byDay.get(day) ?? { day, added: 0, removed: 0 };
  });
}

/**
 * Days in a row with at least `goal` words added (or any words, with no goal).
 * `current` ends today, or yesterday when today hasn't got there yet: a streak
 * isn't broken by the day still being young.
 */
export function streaks(days: WritingDay[], today: string, goal: number | null): { current: number; longest: number } {
  const met = new Set(days.filter((d) => d.added >= Math.max(goal ?? 0, 1)).map((d) => d.day));
  let current = 0;
  for (let day = met.has(today) ? today : shiftDay(today, -1); met.has(day); day = shiftDay(day, -1)) current++;
  let longest = 0;
  for (const day of met) {
    // Only count from the first day of each run.
    if (met.has(shiftDay(day, -1))) continue;
    let run = 0;
    for (let d = day; met.has(d); d = shiftDay(d, 1)) run++;
    longest = Math.max(longest, run);
  }
  return { current, longest };
}

/** A time zone name the database can be handed, or "UTC" for anything that isn't one. */
export function safeTimeZone(zone: unknown): string {
  if (typeof zone !== "string" || !/^[A-Za-z0-9_+\-/]{1,64}$/.test(zone)) return "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return zone;
  } catch {
    return "UTC";
  }
}

/** Today's date in a time zone, as "YYYY-MM-DD". */
export function todayIn(zone: string): string {
  // en-CA formats dates as year-month-day.
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
