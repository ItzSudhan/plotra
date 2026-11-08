import { describe, expect, test } from "bun:test";
import { fillDays, safeTimeZone, shiftDay, streaks, todayIn, type WritingDay } from "@/lib/stats";

// Writing stats and streaks (lib/stats.ts), behind the Stats view.

const wrote = (day: string, added: number, removed = 0): WritingDay => ({ day, added, removed });
/** Days in a row ending on `last`, each with `added` words. */
const run = (last: string, length: number, added = 500) => Array.from({ length }, (_, i) => wrote(shiftDay(last, -i), added));

describe("shiftDay", () => {
  test("within a month", () => {
    expect(shiftDay("2026-03-09", 1)).toBe("2026-03-10");
    expect(shiftDay("2026-03-09", -1)).toBe("2026-03-08");
    expect(shiftDay("2026-03-09", 0)).toBe("2026-03-09");
  });

  test("across month and year ends", () => {
    expect(shiftDay("2026-04-30", 1)).toBe("2026-05-01");
    expect(shiftDay("2026-05-01", -1)).toBe("2026-04-30");
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDay("2027-01-01", -1)).toBe("2026-12-31");
    expect(shiftDay("2026-01-15", 365)).toBe("2027-01-15");
  });

  test("29 February only in a leap year", () => {
    expect(shiftDay("2024-02-28", 1)).toBe("2024-02-29");
    expect(shiftDay("2024-02-29", 1)).toBe("2024-03-01");
    expect(shiftDay("2024-03-01", -1)).toBe("2024-02-29");
    expect(shiftDay("2026-02-28", 1)).toBe("2026-03-01");
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("fillDays", () => {
  test("exactly `count` days ending today, oldest first, with zeroes for gaps", () => {
    const days = fillDays([wrote("2026-03-08", 300, 20), wrote("2026-03-02", 1000), wrote("2026-03-10", 50)], "2026-03-09", 4);
    expect(days).toEqual([wrote("2026-03-06", 0), wrote("2026-03-07", 0), wrote("2026-03-08", 300, 20), wrote("2026-03-09", 0)]);
  });

  test("across a month end", () => {
    const days = fillDays([wrote("2026-02-28", 10)], "2026-03-01", 3);
    expect(days.map((d) => d.day)).toEqual(["2026-02-27", "2026-02-28", "2026-03-01"]);
    expect(days.map((d) => d.added)).toEqual([0, 10, 0]);
  });

  test("no days asked for, none given", () => {
    expect(fillDays([wrote("2026-03-09", 10)], "2026-03-09", 0)).toEqual([]);
  });
});

describe("streaks", () => {
  const today = "2026-03-09";

  test("a streak that ends today", () => {
    expect(streaks(run(today, 3), today, null)).toEqual({ current: 3, longest: 3 });
  });

  test("a streak that ends yesterday isn't broken: today isn't over yet", () => {
    expect(streaks(run(shiftDay(today, -1), 4), today, null)).toEqual({ current: 4, longest: 4 });
  });

  test("a missed day breaks it", () => {
    const days = [...run(today, 2), ...run(shiftDay(today, -3), 5)];
    expect(streaks(days, today, null)).toEqual({ current: 2, longest: 5 });
    // Nothing yesterday or today: no current streak.
    expect(streaks(run(shiftDay(today, -2), 3), today, null)).toEqual({ current: 0, longest: 3 });
  });

  test("a day with words only removed doesn't count", () => {
    expect(streaks([wrote(today, 0, 400), ...run(shiftDay(today, -1), 2)], today, null)).toEqual({ current: 2, longest: 2 });
  });

  test("with a daily goal, days that miss it break the streak", () => {
    const days = [wrote(today, 600), wrote(shiftDay(today, -1), 499), wrote(shiftDay(today, -2), 800), wrote(shiftDay(today, -3), 500)];
    expect(streaks(days, today, 500)).toEqual({ current: 1, longest: 2 });
    // With no goal any words at all count.
    expect(streaks(days, today, null)).toEqual({ current: 4, longest: 4 });
    // A goal of zero still needs a word.
    expect(streaks([wrote(today, 0)], today, 0)).toEqual({ current: 0, longest: 0 });
  });

  test("longest finds a run in the past, whatever order the days come in", () => {
    const days = [...run("2025-12-31", 10), ...run(today, 1)].reverse();
    expect(streaks(days, today, null)).toEqual({ current: 1, longest: 10 });
  });

  test("a run across a year end counts as one", () => {
    expect(streaks(run("2026-01-02", 5), "2026-01-02", null)).toEqual({ current: 5, longest: 5 });
  });

  test("nothing written", () => {
    expect(streaks([], today, 500)).toEqual({ current: 0, longest: 0 });
  });
});

describe("time zones", () => {
  test("safeTimeZone keeps real zones", () => {
    expect(safeTimeZone("Europe/London")).toBe("Europe/London");
    expect(safeTimeZone("America/Argentina/Buenos_Aires")).toBe("America/Argentina/Buenos_Aires");
    expect(safeTimeZone("UTC")).toBe("UTC");
  });

  test("safeTimeZone returns UTC for anything else", () => {
    for (const zone of ["", "Not/AZone", "Europe/London'; drop table node; --", "x".repeat(65), null, undefined, 42, {}, ["Europe/London"]]) {
      expect(safeTimeZone(zone)).toBe("UTC");
    }
  });

  test("todayIn is a YYYY-MM-DD date", () => {
    expect(todayIn("UTC")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(todayIn("Pacific/Kiritimati")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
