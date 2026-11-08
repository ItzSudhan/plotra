// Short-text fields (plan.md 2.8): UI text, item descriptions, captions and alt
// text, each with a stable String ID (its key) and an optional character limit.
// Shared by the strings view and its server actions.

export const stringCategories = [
  { id: "ui", label: "UI text" },
  { id: "item", label: "Item descriptions" },
  { id: "caption", label: "Captions" },
  { id: "alt", label: "Alt text" },
] as const;

/** A built-in category's label, or the name a writer gave their own. */
export const categoryLabel = (category: string) => stringCategories.find((c) => c.id === category)?.label ?? category;

export const STRING_KEY = /^[A-Za-z0-9_.-]+$/;
export const MAX_STRING_KEY = 80;
export const MAX_STRING_TEXT = 5000;
export const MAX_STRING_CONTEXT = 500;
export const MAX_STRING_CATEGORY = 40;
export const MAX_CHAR_LIMIT = 10_000;
/** Short-text fields a project can hold. */
export const MAX_STRINGS = 10_000;

/** The shape of a dialogue line's String ID (`d3f9_0007`, see `nextStringId`), which a short-text field mustn't take. */
const DIALOGUE_STRING_ID = /^([0-9a-f]{4}|dlg)_\d{4,}$/;

/** What's wrong with a key, or null when it's fine. Uniqueness is checked against `taken`. */
export function stringKeyProblem(key: string, taken?: Iterable<string>): string | null {
  if (!key) return "A string needs an ID.";
  if (key.length > MAX_STRING_KEY) return `An ID can be at most ${MAX_STRING_KEY} characters.`;
  if (!STRING_KEY.test(key)) return "An ID can only use letters, digits, dots, dashes and underscores.";
  if (DIALOGUE_STRING_ID.test(key)) return "That ID has the shape of a dialogue line's, like d3f9_0001. Pick another, such as menu.start.";
  if (taken) for (const other of taken) if (other === key) return `“${key}” is already another string's ID.`;
  return null;
}

/**
 * Length as a reader counts it: characters, not UTF-16 units, so an emoji or
 * an accented letter is one.
 */
export const textLength = (text: string) => Array.from(text).length;

/** One row of the project-wide string table: a short-text field or a dialogue line. */
export type ProjectString = {
  /** The stable String ID. */
  key: string;
  text: string;
  /** Dialogue lines: who says it. Empty otherwise. */
  speaker: string;
  source: "string" | "dialogue";
  /** The dialogue a line is in, or the note a short-text field is attached to. */
  nodeId: string | null;
  charLimit: number | null;
  context: string;
};
