// @-mentions in comments, as the web's comment box does them
// (apps/app/components/workflow/comments-panel.tsx): typing "@" and the start
// of a name suggests the project's people, picking one writes "@Their Name ",
// and the server tells everyone whose name follows an "@" (lib/notify.ts
// mentionedIn), longest names first. Pure.

export type Mentionable = { id: string; name: string };

/** The name being typed after an "@" just before the caret, and where its "@" is; null when there isn't one. */
export function mentionAt(text: string, caret: number): { query: string; at: number } | null {
  const match = /(^|\s)@([\p{L}\p{N} .'-]{0,30})$/u.exec(text.slice(0, caret));
  return match ? { query: match[2], at: caret - match[2].length - 1 } : null;
}

/** Up to five people whose names start with what's typed. */
export function suggest<P extends Mentionable>(people: P[], query: string): P[] {
  const q = query.toLowerCase();
  return people.filter((p) => p.name && p.name.toLowerCase().startsWith(q)).slice(0, 5);
}

/** The text with the half-typed mention swapped for the person's whole name, and where the caret goes after it. */
export function insertMention(text: string, mention: { query: string; at: number }, name: string): { text: string; caret: number } {
  const before = `${text.slice(0, mention.at)}@${name} `;
  return { text: before + text.slice(mention.at + 1 + mention.query.length), caret: before.length };
}

/** A comment cut into plain text and mentions of people, to show the mentions picked out. */
export function splitMentions(text: string, names: string[]): { text: string; mention: boolean }[] {
  const sorted = names.filter(Boolean).sort((a, b) => b.length - a.length);
  const parts: { text: string; mention: boolean }[] = [];
  let plain = "";
  let i = 0;
  while (i < text.length) {
    const at = text.indexOf("@", i);
    if (at < 0) break;
    const name = sorted.find((n) => text.slice(at + 1, at + 1 + n.length).toLowerCase() === n.toLowerCase());
    if (!name) {
      plain += text.slice(i, at + 1);
      i = at + 1;
      continue;
    }
    plain += text.slice(i, at);
    if (plain) parts.push({ text: plain, mention: false });
    plain = "";
    parts.push({ text: text.slice(at, at + 1 + name.length), mention: true });
    i = at + 1 + name.length;
  }
  plain += text.slice(i);
  if (plain) parts.push({ text: plain, mention: false });
  return parts;
}
