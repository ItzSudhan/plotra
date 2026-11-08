import { describe, expect, test } from "bun:test";
import {
  type Calendar,
  canonicalDate,
  cleanDefinition,
  type DateParts,
  dayMinutes,
  formatDate,
  formatDuration,
  formatYear,
  fromMinutes,
  gregorian,
  parseDuration,
  parseStoryDate,
  ticks,
  toMinutes,
  yearMinutes,
} from "@/lib/calendar";

// Story dates on the timeline (lib/calendar.ts): minutes since a calendar's
// epoch, for the Gregorian calendar and for invented ones.

// Three months of 10, 20 and 30 days, 20-hour days: a 60-day year.
const shire: Calendar = {
  id: "shire",
  name: "Shire Reckoning",
  definition: {
    months: [
      { name: "Frostmonth", days: 10 },
      { name: "Thaw", days: 20 },
      { name: "Harvest", days: 30 },
    ],
    hoursPerDay: 20,
    eras: [
      { name: "First Age", startYear: 0 },
      { name: "Second Age", startYear: 500 },
    ],
  },
};

const at = (year: number, month: number, day: number, hour = 0, minute = 0): DateParts => ({ year, month, day, hour, minute });

describe("minutes and back", () => {
  test("round trips in the Gregorian calendar", () => {
    for (const parts of [at(1820, 5, 3, 14, 0), at(2024, 2, 29, 23, 59), at(1, 1, 1), at(50, 12, 31, 6, 30), at(-450, 2, 1, 12, 5), at(0, 3, 1)]) {
      expect(fromMinutes(gregorian, toMinutes(gregorian, parts))).toEqual(parts);
    }
  });

  test("round trips in a made-up calendar", () => {
    for (const parts of [at(0, 1, 1), at(312, 1, 10, 19, 59), at(312, 2, 1), at(312, 3, 30, 19, 0), at(-7, 2, 15, 3, 45)]) {
      expect(fromMinutes(shire, toMinutes(shire, parts))).toEqual(parts);
    }
  });

  test("a made-up calendar's days and years have its own length", () => {
    expect(dayMinutes(shire)).toBe(20 * 60);
    expect(yearMinutes(shire)).toBe(60 * 20 * 60);
    expect(toMinutes(shire, at(1, 1, 1))).toBe(yearMinutes(shire));
    expect(toMinutes(shire, at(0, 2, 1))).toBe(10 * dayMinutes(shire));
  });

  test("Gregorian years 0 to 99 stay in the first century", () => {
    expect(fromMinutes(gregorian, toMinutes(gregorian, at(42, 6, 1))).year).toBe(42);
  });
});

describe("reading a story date", () => {
  test("YYYY-MM-DD and YYYY-MM-DD HH:mm", () => {
    expect(parseStoryDate(gregorian, "1820-05-03")).toBe(toMinutes(gregorian, at(1820, 5, 3)));
    expect(parseStoryDate(gregorian, "1820-05-03 14:30")).toBe(toMinutes(gregorian, at(1820, 5, 3, 14, 30)));
    expect(parseStoryDate(gregorian, "1820-05-03T14:30")).toBe(toMinutes(gregorian, at(1820, 5, 3, 14, 30)));
    expect(parseStoryDate(gregorian, " 1820 ")).toBe(toMinutes(gregorian, at(1820, 1, 1)));
  });

  test("negative years", () => {
    const minutes = parseStoryDate(gregorian, "-0450-02-01");
    expect(minutes).toBe(toMinutes(gregorian, at(-450, 2, 1)));
    expect(fromMinutes(gregorian, minutes!)).toEqual(at(-450, 2, 1));
  });

  test("years 0 to 99 don't turn into the 1900s", () => {
    for (const year of [0, 7, 99]) {
      const minutes = parseStoryDate(gregorian, `${String(year).padStart(4, "0")}-03-04`);
      expect(fromMinutes(gregorian, minutes!)).toEqual(at(year, 3, 4));
    }
  });

  test("text that can't be read is null", () => {
    expect(parseStoryDate(gregorian, "")).toBeNull();
    expect(parseStoryDate(gregorian, "   ")).toBeNull();
    expect(parseStoryDate(gregorian, null)).toBeNull();
    expect(parseStoryDate(gregorian, undefined)).toBeNull();
    expect(parseStoryDate(gregorian, "the morning after the ball")).toBeNull();
    expect(parseStoryDate(shire, "sometime in spring")).toBeNull();
  });

  test("in a made-up calendar, by number or by month name", () => {
    expect(parseStoryDate(shire, "0312-02-05 10:15")).toBe(toMinutes(shire, at(312, 2, 5, 10, 15)));
    expect(parseStoryDate(shire, "4 Frostmonth 312")).toBe(toMinutes(shire, at(312, 1, 4)));
    expect(parseStoryDate(shire, "Harvest 21, 312")).toBe(toMinutes(shire, at(312, 3, 21)));
  });

  test("in a made-up calendar, days and hours past the end are clamped", () => {
    // Frostmonth has 10 days and a day 20 hours.
    expect(parseStoryDate(shire, "0312-01-25 22:00")).toBe(toMinutes(shire, at(312, 1, 10, 19, 0)));
    expect(parseStoryDate(shire, "0312-09-01")).toBe(toMinutes(shire, at(312, 3, 1)));
  });
});

describe("writing a story date", () => {
  test("canonicalDate is what parseStoryDate reads", () => {
    for (const text of ["1820-05-03", "1820-05-03 14:30", "-0450-02-01", "0042-12-31 00:05"]) {
      expect(canonicalDate(gregorian, parseStoryDate(gregorian, text)!)).toBe(text);
    }
    expect(canonicalDate(shire, toMinutes(shire, at(312, 3, 30, 19, 59)))).toBe("0312-03-30 19:59");
  });

  test("formatDate at each precision", () => {
    const minutes = toMinutes(gregorian, at(1820, 5, 3, 14, 0));
    expect(formatDate(gregorian, minutes)).toBe("3 May 1820, 14:00");
    expect(formatDate(gregorian, minutes, "day")).toBe("3 May 1820");
    expect(formatDate(gregorian, minutes, "month")).toBe("May 1820");
    expect(formatDate(gregorian, minutes, "year")).toBe("1820");
    expect(formatDate(gregorian, toMinutes(gregorian, at(1820, 5, 3)))).toBe("3 May 1820");
    expect(formatDate(shire, toMinutes(shire, at(512, 2, 7)))).toBe("7 Thaw 13 Second Age");
  });

  test("formatYear names eras, and BC for Gregorian years before 1", () => {
    expect(formatYear(gregorian, 1820)).toBe("1820");
    expect(formatYear(gregorian, 0)).toBe("1 BC");
    expect(formatYear(gregorian, -450)).toBe("451 BC");
    expect(formatYear(shire, 0)).toBe("1 First Age");
    expect(formatYear(shire, 499)).toBe("500 First Age");
    expect(formatYear(shire, 500)).toBe("1 Second Age");
    expect(formatYear(shire, -3)).toBe("-3");
  });
});

describe("durations", () => {
  test("parseDuration reads units and sums them", () => {
    expect(parseDuration(gregorian, "2h")).toBe(120);
    expect(parseDuration(gregorian, "1h 30m")).toBe(90);
    expect(parseDuration(gregorian, "3 days")).toBe(3 * 24 * 60);
    expect(parseDuration(gregorian, "2 weeks")).toBe(14 * 24 * 60);
    expect(parseDuration(gregorian, "1 month")).toBe(yearMinutes(gregorian) / 12);
    expect(parseDuration(gregorian, "1.5 hours")).toBe(90);
    expect(parseDuration(shire, "1d")).toBe(20 * 60);
    expect(parseDuration(shire, "1 year")).toBe(yearMinutes(shire));
  });

  test("parseDuration is null for nothing it can read", () => {
    expect(parseDuration(gregorian, "")).toBeNull();
    expect(parseDuration(gregorian, null)).toBeNull();
    expect(parseDuration(gregorian, "a while")).toBeNull();
    expect(parseDuration(gregorian, "0h")).toBeNull();
  });

  test("formatDuration", () => {
    expect(formatDuration(gregorian, 90)).toBe("1h 30m");
    expect(formatDuration(gregorian, 2 * 24 * 60 + 4 * 60)).toBe("2d 4h");
    expect(formatDuration(gregorian, 0)).toBe("1m");
    expect(formatDuration(shire, 25 * 60)).toBe("1d 5h");
    // Minutes are noise once a duration runs to years.
    expect(formatDuration(shire, yearMinutes(shire) + 2 * 20 * 60 + 7)).toBe("1y 2d");
  });

  test("formatDuration reads back as the same length", () => {
    for (const minutes of [5, 90, 3000, 10_000]) {
      expect(parseDuration(gregorian, formatDuration(gregorian, minutes))).toBe(minutes);
    }
  });
});

describe("axis ticks", () => {
  const cases: Array<[string, Calendar, number, number, number]> = [
    ["an afternoon", gregorian, toMinutes(gregorian, at(1820, 5, 3, 12)), toMinutes(gregorian, at(1820, 5, 3, 18)), 1],
    ["a month", gregorian, toMinutes(gregorian, at(1820, 5, 1)), toMinutes(gregorian, at(1820, 6, 1)), 0.01],
    ["a decade", gregorian, toMinutes(gregorian, at(1820, 1, 1)), toMinutes(gregorian, at(1830, 1, 1)), 0.0002],
    ["two millennia", gregorian, toMinutes(gregorian, at(-1000, 1, 1)), toMinutes(gregorian, at(1000, 1, 1)), 0.000001],
    ["a made-up year", shire, toMinutes(shire, at(312, 1, 1)), toMinutes(shire, at(313, 1, 1)), 0.005],
  ];

  for (const [name, cal, from, to, pxPerMinute] of cases) {
    test(`over ${name}: in order and never closer than the gap allows`, () => {
      const minGap = 90;
      // Month ticks step by the average month, so a short month sits closer: allow for the shortest one.
      const days = cal.definition?.months.map((m) => m.days) ?? [28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31, 31];
      const slack = Math.min(...days) / (days.reduce((a, b) => a + b, 0) / days.length);
      const out = ticks(cal, from, to, pxPerMinute, minGap);
      expect(out.length).toBeGreaterThan(0);
      for (const tick of out) expect(tick.label).toBeTruthy();
      for (let i = 1; i < out.length; i++) {
        expect(out[i].at).toBeGreaterThan(out[i - 1].at);
        expect((out[i].at - out[i - 1].at) * pxPerMinute).toBeGreaterThanOrEqual(minGap * Math.min(slack, 1));
      }
      expect(out.length).toBeLessThanOrEqual(Math.floor(((to - from) * pxPerMinute) / minGap) + 2);
    });
  }

  test("years carry their label, months their name", () => {
    const decade = ticks(gregorian, toMinutes(gregorian, at(1820, 1, 1)), toMinutes(gregorian, at(1830, 1, 1)), 0.0002);
    expect(decade.map((t) => t.label)).toContain("1825");
    const year = ticks(shire, toMinutes(shire, at(312, 1, 1)), toMinutes(shire, at(313, 1, 1)), 0.005);
    expect(year.map((t) => t.label)).toEqual(["313 First Age", "Thaw", "Harvest", "314 First Age"]);
  });

  test("never more than 400, however wide the span", () => {
    expect(ticks(gregorian, 0, 1e12, 1e9).length).toBeLessThanOrEqual(400);
  });
});

describe("cleaning a calendar definition", () => {
  test("drops empty months and eras, trims names, rounds numbers", () => {
    expect(
      cleanDefinition({
        months: [
          { name: "  Frostmonth ", days: 10.4 },
          { name: "", days: 20 },
          { name: "Nought", days: 0 },
        ],
        hoursPerDay: 20.2,
        eras: [
          { name: "First Age", startYear: 0 },
          { name: " ", startYear: 5 },
        ],
      }),
    ).toEqual({ months: [{ name: "Frostmonth", days: 10 }], hoursPerDay: 20, eras: [{ name: "First Age", startYear: 0 }] });
  });

  test("throws when the calendar is unusable", () => {
    expect(() => cleanDefinition({ months: [], hoursPerDay: 24 })).toThrow();
    expect(() => cleanDefinition({ months: [{ name: "Only", days: 30 }], hoursPerDay: 0 })).toThrow();
  });
});
