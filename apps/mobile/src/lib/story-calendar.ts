// Story time: a copy of the web app's apps/app/lib/calendar.ts (without the
// axis ticks and the definition cleaner), so the phone reads and writes story
// dates exactly as the web's timeline does. Every date is a number of minutes
// since the epoch of its calendar. Pure.

export type CalendarMonth = { name: string; days: number };
export type CalendarEra = { name: string; startYear: number };
export type CalendarDefinition = { months: CalendarMonth[]; hoursPerDay: number; eras?: CalendarEra[] };
export type Calendar = {
  id: string;
  name: string;
  /** Null for the Gregorian calendar. */
  definition: CalendarDefinition | null;
};

export const GREGORIAN_ID = "gregorian";
export const gregorian: Calendar = { id: GREGORIAN_ID, name: "Gregorian", definition: null };

export type DateParts = { year: number; month: number; day: number; hour: number; minute: number };

const MINUTE = 1;
const HOUR = 60;

/** Minutes in one day of the calendar. */
export const dayMinutes = (cal: Calendar) => (cal.definition ? cal.definition.hoursPerDay : 24) * HOUR;

/** Minutes in one (non-leap) year of the calendar, or on average for Gregorian. */
export function yearMinutes(cal: Calendar) {
  if (!cal.definition) return 365.2425 * 24 * HOUR;
  return cal.definition.months.reduce((n, m) => n + m.days, 0) * dayMinutes(cal);
}

export const monthMinutes = (cal: Calendar) => yearMinutes(cal) / (cal.definition?.months.length || 12);

function utc(parts: DateParts) {
  const date = new Date(Date.UTC(2000, 0, 1, 0, 0));
  // setUTCFullYear, unlike Date.UTC, doesn't turn years 0–99 into 1900–1999.
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  date.setUTCHours(parts.hour, parts.minute, 0, 0);
  return date.getTime() / 60_000;
}

export function toMinutes(cal: Calendar, parts: DateParts): number {
  const def = cal.definition;
  if (!def) return utc(parts);
  const day = dayMinutes(cal);
  const month = Math.min(Math.max(parts.month, 1), def.months.length);
  let days = 0;
  for (let i = 0; i < month - 1; i++) days += def.months[i].days;
  return parts.year * yearMinutes(cal) + (days + parts.day - 1) * day + parts.hour * HOUR + parts.minute;
}

export function fromMinutes(cal: Calendar, minutes: number): DateParts {
  const def = cal.definition;
  if (!def) {
    const d = new Date(Math.round(minutes) * 60_000);
    return {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
      hour: d.getUTCHours(),
      minute: d.getUTCMinutes(),
    };
  }
  const total = Math.round(minutes);
  const perYear = yearMinutes(cal);
  const perDay = dayMinutes(cal);
  const year = Math.floor(total / perYear);
  let rest = total - year * perYear;
  let dayOfYear = Math.floor(rest / perDay);
  rest -= dayOfYear * perDay;
  let month = 1;
  for (const m of def.months) {
    if (dayOfYear < m.days) break;
    dayOfYear -= m.days;
    month++;
  }
  month = Math.min(month, def.months.length);
  return { year, month, day: dayOfYear + 1, hour: Math.floor(rest / HOUR), minute: rest % HOUR };
}

const CANONICAL = /^\s*(-?\d{1,6})(?:-(\d{1,2})(?:-(\d{1,2}))?)?(?:[ T](\d{1,2}):(\d{2}))?\s*$/;

/** Parses a story date in the calendar; null when it can't be read. */
export function parseStoryDate(cal: Calendar, text: string | null | undefined): number | null {
  if (!text?.trim()) return null;
  const match = CANONICAL.exec(text);
  if (match) {
    const months = cal.definition?.months.length ?? 12;
    const parts: DateParts = {
      year: Number(match[1]),
      month: Math.min(Math.max(Number(match[2] ?? 1), 1), months),
      day: Math.max(Number(match[3] ?? 1), 1),
      hour: Number(match[4] ?? 0),
      minute: Number(match[5] ?? 0),
    };
    if (cal.definition) {
      parts.day = Math.min(parts.day, cal.definition.months[parts.month - 1]?.days ?? 1);
      parts.hour = Math.min(parts.hour, cal.definition.hoursPerDay - 1);
    }
    return toMinutes(cal, parts);
  }
  if (cal.definition) return parseByMonthName(cal, text);
  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) return null;
  // Non-ISO strings parse as local time; keep the wall-clock reading.
  const d = new Date(parsed);
  return utc({ year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: d.getHours(), minute: d.getMinutes() });
}

/** "4 Frostmonth 312" or "Frostmonth 4, 312" in a custom calendar. */
function parseByMonthName(cal: Calendar, text: string): number | null {
  const def = cal.definition!;
  const lower = text.toLowerCase();
  const month = def.months.findIndex((m) => m.name && lower.includes(m.name.toLowerCase()));
  if (month < 0) return null;
  const rest = lower.replace(def.months[month].name.toLowerCase(), " ");
  const numbers = [...rest.matchAll(/-?\d+/g)].map((m) => Number(m[0]));
  if (numbers.length < 2) return null;
  // The smaller number that fits in the month is the day; the other is the year.
  const [a, b] = numbers;
  const fits = (n: number) => n >= 1 && n <= def.months[month].days;
  const [day, year] = fits(a) && !(fits(b) && Math.abs(a) > Math.abs(b)) ? [a, b] : [b, a];
  return toMinutes(cal, { year, month: month + 1, day, hour: 0, minute: 0 });
}

const pad = (n: number, width = 2) => String(Math.abs(n)).padStart(width, "0");

/** The canonical form written back into a scene's story date. */
export function canonicalDate(cal: Calendar, minutes: number): string {
  const p = fromMinutes(cal, minutes);
  const date = `${p.year < 0 ? "-" : ""}${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
  return p.hour || p.minute ? `${date} ${pad(p.hour)}:${pad(p.minute)}` : date;
}

const gregorianMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthName = (cal: Calendar, month: number) =>
  cal.definition ? (cal.definition.months[month - 1]?.name ?? `Month ${month}`) : gregorianMonths[month - 1];

/** A year as people write it: with the era it falls in, if the calendar names eras. */
export function formatYear(cal: Calendar, year: number) {
  const eras = [...(cal.definition?.eras ?? [])].sort((a, b) => b.startYear - a.startYear);
  const era = eras.find((e) => year >= e.startYear);
  if (era) return `${year - era.startYear + 1} ${era.name}`;
  if (!cal.definition && year <= 0) return `${1 - year} BC`;
  return String(year);
}

/** A readable date: "3 May 1820, 14:00". `precision` drops the parts that are noise at a zoom level. */
export function formatDate(cal: Calendar, minutes: number, precision: "year" | "month" | "day" | "minute" = "minute") {
  const p = fromMinutes(cal, minutes);
  const year = formatYear(cal, p.year);
  if (precision === "year") return year;
  if (precision === "month") return `${monthName(cal, p.month)} ${year}`;
  const date = `${p.day} ${monthName(cal, p.month)} ${year}`;
  if (precision === "day" || (!p.hour && !p.minute)) return date;
  return `${date}, ${pad(p.hour)}:${pad(p.minute)}`;
}

// ---- Durations ------------------------------------------------------------------

const DURATION = /(-?\d+(?:\.\d+)?)\s*(minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|wks?|w|months?|mos?|years?|yrs?|y)\b/gi;

/** Parses "2h", "3 days", "1h 30m", "2 weeks" into minutes; null when nothing matches. */
export function parseDuration(cal: Calendar, text: string | null | undefined): number | null {
  if (!text?.trim()) return null;
  let total = 0;
  let found = false;
  for (const match of text.matchAll(DURATION)) {
    found = true;
    const n = Number(match[1]);
    const unit = match[2].toLowerCase();
    if (unit.startsWith("mo")) total += n * monthMinutes(cal);
    else if (unit.startsWith("m")) total += n * MINUTE;
    else if (unit.startsWith("h")) total += n * HOUR;
    else if (unit.startsWith("d")) total += n * dayMinutes(cal);
    else if (unit.startsWith("w")) total += n * 7 * dayMinutes(cal);
    else total += n * yearMinutes(cal);
  }
  return found && total > 0 ? total : null;
}

/** "2d 4h": the inverse of parseDuration, to the nearest minute. */
export function formatDuration(cal: Calendar, minutes: number) {
  const day = dayMinutes(cal);
  let rest = Math.max(Math.round(minutes), 1);
  const parts: string[] = [];
  const years = Math.floor(rest / yearMinutes(cal));
  if (years) {
    parts.push(`${years}y`);
    rest -= years * yearMinutes(cal);
  }
  const days = Math.floor(rest / day);
  if (days) parts.push(`${days}d`);
  rest -= days * day;
  const hours = Math.floor(rest / HOUR);
  if (hours) parts.push(`${hours}h`);
  rest -= hours * HOUR;
  if (rest && !years) parts.push(`${Math.round(rest)}m`);
  return parts.join(" ") || "1m";
}

