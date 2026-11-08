import type { DialogueValue } from "./model";

// Variables shown in a line or a choice (plan.md 2.8): `{$gold}` in the text is
// replaced by the variable's value when the dialogue plays. The same spelling
// as Yarn Spinner's; the exporters write each format's own (Ink's `{gold}`,
// SugarCube's `<<print $gold>>`) and the importers read those back into it.

/** `{$name}` in a line or a choice. */
export const INTERPOLATION = /\{\$([A-Za-z_][A-Za-z0-9_]*)\}/g;

/** A text cut into what's written and the variables shown in it. */
export type TextPart = { text: string } | { variable: string };

export function textParts(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let at = 0;
  for (const match of text.matchAll(INTERPOLATION)) {
    if (match.index > at) parts.push({ text: text.slice(at, match.index) });
    parts.push({ variable: match[1] });
    at = match.index + match[0].length;
  }
  if (at < text.length || !parts.length) parts.push({ text: text.slice(at) });
  return parts;
}

/** The variables a text shows, each once. */
export function textVariables(text: string | undefined): string[] {
  return [...new Set([...(text ?? "").matchAll(INTERPOLATION)].map((m) => m[1]))];
}

const shown = (value: DialogueValue) => (typeof value === "string" ? value : String(value));

/** The text as it's shown: each `{$name}` replaced by its value. One with no such variable is left as written. */
export function interpolate(text: string, variables: Record<string, DialogueValue>): string {
  return text.replace(INTERPOLATION, (whole, name: string) => (Object.hasOwn(variables, name) ? shown(variables[name]) : whole));
}
