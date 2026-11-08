// The Markdown editor's toolbar: wrapping a selection in marks and turning
// lines into headings, lists or quotes. Works on the text and the selection
// and returns both, so the text box can be updated in one go. Pure.

export type Selection = { start: number; end: number };
export type Edit = { text: string; selection: Selection };

/** Wraps the selection in `before`/`after`, or unwraps it if it's already wrapped. With nothing selected, puts the cursor between them. */
export function wrap(text: string, sel: Selection, before: string, after = before): Edit {
  const { start, end } = order(sel);
  const inner = text.slice(start, end);
  if (text.slice(start - before.length, start) === before && text.slice(end, end + after.length) === after) {
    return { text: text.slice(0, start - before.length) + inner + text.slice(end + after.length), selection: { start: start - before.length, end: end - before.length } };
  }
  if (inner.startsWith(before) && inner.endsWith(after) && inner.length >= before.length + after.length) {
    const unwrapped = inner.slice(before.length, inner.length - after.length);
    return { text: text.slice(0, start) + unwrapped + text.slice(end), selection: { start, end: start + unwrapped.length } };
  }
  return { text: text.slice(0, start) + before + inner + after + text.slice(end), selection: { start: start + before.length, end: end + before.length } };
}

/** The start of the line `at` is on. */
const lineStart = (text: string, at: number) => text.lastIndexOf("\n", at - 1) + 1;

const PREFIX = /^(#{1,6} |> |- \[[ xX]\] |- |\d+\. )/;

/** Gives each line in the selection `prefix` ("# ", "- ", "> ", "1. ", "- [ ] "), replacing another one; if they all have it already, takes it off. */
export function setLinePrefix(text: string, sel: Selection, prefix: string): Edit {
  const { start, end } = order(sel);
  const from = lineStart(text, start);
  const nl = text.indexOf("\n", end);
  const to = nl < 0 ? text.length : nl;
  const lines = text.slice(from, to).split("\n");
  const all = lines.every((l) => (prefix === "1. " ? /^\d+\. /.test(l) : l.startsWith(prefix)));
  let n = 0;
  const next = lines.map((line) => {
    const bare = line.replace(PREFIX, "");
    if (all) return bare;
    n++;
    return (prefix === "1. " ? `${n}. ` : prefix) + bare;
  });
  const replaced = next.join("\n");
  const firstDelta = next[0].length - lines[0].length;
  return {
    text: text.slice(0, from) + replaced + text.slice(to),
    selection: { start: Math.max(from, start + firstDelta), end: Math.max(from, end + replaced.length - (to - from)) },
  };
}

/** Puts `insert` at the cursor (replacing the selection), with the cursor after it, or `cursorBack` characters before its end. */
export function insert(text: string, sel: Selection, insertText: string, cursorBack = 0): Edit {
  const { start, end } = order(sel);
  const at = start + insertText.length - cursorBack;
  return { text: text.slice(0, start) + insertText + text.slice(end), selection: { start: at, end: at } };
}

/** On Enter at the end of a list item, the next line starts the same way; on an empty item, the list ends. */
export function continueList(before: string, after: string): Edit | null {
  // `after` is the text with the new line typed; find the line the cursor left.
  if (after.length !== before.length + 1) return null;
  let at = 0;
  while (at < before.length && before[at] === after[at]) at++;
  if (after[at] !== "\n") return null;
  const from = lineStart(after, at);
  const line = after.slice(from, at);
  const match = /^(\s*)(- \[[ xX]\] |- |\* |(\d+)\. )(.*)$/.exec(line);
  if (!match) return null;
  if (!match[4].trim()) {
    // An empty item: end the list instead of adding another.
    const text = after.slice(0, from) + after.slice(at + 1);
    return { text, selection: { start: from, end: from } };
  }
  const marker = match[3] ? `${Number(match[3]) + 1}. ` : match[2].startsWith("- [") ? "- [ ] " : match[2];
  const added = match[1] + marker;
  const text = after.slice(0, at + 1) + added + after.slice(at + 1);
  const cursor = at + 1 + added.length;
  return { text, selection: { start: cursor, end: cursor } };
}

function order(sel: Selection): Selection {
  return sel.start <= sel.end ? sel : { start: sel.end, end: sel.start };
}
