// Counts in words: "1 note", "3 notes", "1,204 words". The plural form comes
// from Intl.PluralRules, so a translated build only needs its own word pairs.

const rules = new Map<string, Intl.PluralRules>();

function rule(locale: string) {
  let r = rules.get(locale);
  if (!r) {
    r = new Intl.PluralRules(locale);
    rules.set(locale, r);
  }
  return r;
}

/** An English noun's plural: "story" → "stories", "box" → "boxes", "note" → "notes". */
export function pluralOf(word: string): string {
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  return `${word}s`;
}

/** The right form of `one` for `count`, without the number: plural(3, "note") → "notes". */
export function plural(count: number, one: string, many: string = pluralOf(one), locale = "en"): string {
  return rule(locale).select(count) === "one" ? one : many;
}

/** The count and its noun: count(3, "note") → "3 notes"; count(1204, "word") → "1,204 words". */
export function count(n: number, one: string, many?: string, locale = "en"): string {
  return `${n.toLocaleString(locale)} ${plural(n, one, many, locale)}`;
}
