import type { PropertyOptions, PropertyType, PropertyValue } from "@plotra/db/schema";
import { slugify } from "../slug";

// Typed properties from an Obsidian vault (beat-the-competitors.md, step 3):
// the fields of each note's front matter (`status: draft`, `age: 32`,
// `home: "[[Verona]]"`, `born: 1592-07-31`, a list of factions) become the
// project's properties for that kind of note, each with the type its values
// have across the whole import. Pure: the preview and the import share it.

export type RawProperty = string | string[];

export type ImportedProperty = {
  /** The property's key in the project (`first-seen`), made from its name as `createPropertyDef` makes one. */
  key: string;
  /** Its name as the vault wrote it (`first seen`), with a capital. */
  label: string;
  type: PropertyType;
  options: PropertyOptions;
  /** The name the notes' front matter uses. */
  source: string;
};

/** How many fields one import turns into properties, so a vault of one-off fields doesn't bury the inspector. */
export const MAX_IMPORTED_PROPERTIES = 40;
const MAX_CHOICES = 60;

const LINK = /^\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]$/;
const DATE = /^(\d{4}-\d{2}-\d{2})(?:[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const NUMBER = /^-?\d+(?:\.\d+)?$/;
const BOOLEAN = /^(true|false|yes|no)$/i;
const WEB = /^https?:\/\/\S+$/i;

const list = (raw: RawProperty) => (Array.isArray(raw) ? raw : [raw]).map((v) => v.trim()).filter(Boolean);

/** The title a `[[link]]` names, or null when the value isn't one. */
export const linkTitle = (value: string): string | null => LINK.exec(value.trim())?.[1].trim() ?? null;

function typeOf(values: RawProperty[]): { type: PropertyType; options: PropertyOptions } {
  const items = values.flatMap(list);
  const several = values.some((v) => Array.isArray(v) && v.length > 1);
  const every = (test: RegExp | ((v: string) => boolean)) => items.length > 0 && items.every((v) => (typeof test === "function" ? test(v) : test.test(v)));
  if (every((v) => linkTitle(v) !== null)) return { type: "node", options: { multiple: values.some((v) => Array.isArray(v)) } };
  if (!several && !values.some(Array.isArray)) {
    if (every(BOOLEAN)) return { type: "checkbox", options: {} };
    if (every(NUMBER)) return { type: "number", options: {} };
    if (every(DATE)) return { type: "date", options: {} };
    if (every(WEB)) return { type: "url", options: {} };
  }
  if (values.some(Array.isArray)) {
    const choices = [...new Set(items.map((v) => v.slice(0, 80)))];
    if (choices.length <= MAX_CHOICES) return { type: "multi_select", options: { choices } };
  }
  return { type: "text", options: {} };
}

const labelOf = (name: string) => {
  const spaced = name.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return (spaced.charAt(0).toUpperCase() + spaced.slice(1)).slice(0, 60);
};

/**
 * The properties an import's notes declare, in the order they first appear,
 * each typed from all its values: links to notes, a yes or no, a number, a
 * date, a web address, a list of choices, or text.
 */
export function inferProperties(notes: Array<Record<string, RawProperty> | undefined>): ImportedProperty[] {
  const seen = new Map<string, { source: string; values: RawProperty[] }>();
  for (const props of notes) {
    for (const [source, value] of Object.entries(props ?? {})) {
      const key = slugify(source) || "property";
      const known = seen.get(key);
      if (known) known.values.push(value);
      else if (seen.size < MAX_IMPORTED_PROPERTIES) seen.set(key, { source, values: [value] });
    }
  }
  return [...seen].map(([key, { source, values }]) => ({ key, label: labelOf(source), source, ...typeOf(values) }));
}

/**
 * A note's value for a property, in the property's type; undefined when it
 * doesn't fit (a word where a number belongs). `find` turns a link's title
 * into a note's id.
 */
export function propertyValue(type: PropertyType, raw: RawProperty, options: PropertyOptions, find: (title: string) => string | undefined): PropertyValue | undefined {
  const items = list(raw);
  if (!items.length) return undefined;
  const first = items[0];
  switch (type) {
    case "node": {
      const ids = [...new Set(items.flatMap((v) => (find(linkTitle(v) ?? v) ? [find(linkTitle(v) ?? v)!] : [])))];
      if (!ids.length) return undefined;
      return options.multiple ? ids : ids[0];
    }
    case "checkbox":
      return BOOLEAN.test(first) ? /^(true|yes)$/i.test(first) : undefined;
    case "number":
      return NUMBER.test(first) ? Number(first) : undefined;
    case "date":
      return DATE.exec(first)?.[1];
    case "url":
      return WEB.test(first) ? first : undefined;
    case "multi_select":
      return items.map((v) => v.slice(0, 80)).slice(0, MAX_CHOICES);
    case "select":
      return first.slice(0, 80);
    default:
      // Links written in text keep their title, without the brackets.
      return items.map((v) => linkTitle(v) ?? v).join(", ").slice(0, 2000);
  }
}
