// Reads the Markdown the API returns (apps/app/lib/io/markdown.ts writes it)
// into blocks and styled runs the phone can draw. It covers what that writer
// produces: headings, marks (**bold**, *italic*, ~~strike~~, ==highlight==,
// <u>underline</u>, `code`), links, [[wiki-links]], lists and to-dos, quotes,
// callouts, rules, tables, images and embeds. Pure, so it can be tested.

export type Wiki = { title: string; heading?: string; alias?: string };

export type Run = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  highlight?: boolean;
  underline?: boolean;
  code?: boolean;
  href?: string;
  wiki?: Wiki;
};

export type Block =
  | { kind: "heading"; level: number; runs: Run[] }
  | { kind: "paragraph"; runs: Run[] }
  | { kind: "quote"; runs: Run[] }
  | { kind: "callout"; label: string; runs: Run[] }
  | { kind: "list"; style: "bullet" | "ordered" | "todo"; level: number; number: number; checked: boolean; runs: Run[] }
  | { kind: "rule" }
  | { kind: "code"; text: string }
  | { kind: "table"; rows: Run[][][] }
  | { kind: "image"; url: string; alt: string }
  | { kind: "embed"; wiki: Wiki };

type Mark = "bold" | "italic" | "strike" | "highlight" | "underline";

/** `[[Title#Heading|Alias]]`'s parts. */
export function parseWiki(inner: string): Wiki {
  const [target, alias] = splitOnce(inner, "|");
  const [title, heading] = splitOnce(target, "#");
  return { title: title.trim(), ...(heading?.trim() && { heading: heading.trim() }), ...(alias?.trim() && { alias: alias.trim() }) };
}

function splitOnce(text: string, sep: string): [string, string | undefined] {
  const at = text.indexOf(sep);
  return at < 0 ? [text, undefined] : [text.slice(0, at), text.slice(at + sep.length)];
}

const isWordChar = (ch: string | undefined) => ch !== undefined && /[\p{L}\p{N}]/u.test(ch);

/** Inline Markdown into runs. Marks that never close are read as plain characters. */
export function parseInline(source: string): Run[] {
  const runs: Run[] = [];
  const active = new Set<Mark>();
  let text = "";

  const style = (): Omit<Run, "text"> => {
    const s: Omit<Run, "text"> = {};
    for (const m of active) s[m] = true;
    return s;
  };
  const flush = () => {
    if (text) runs.push({ text, ...style() });
    text = "";
  };
  const push = (run: Run) => {
    flush();
    runs.push({ ...style(), ...run });
  };
  const toggle = (mark: Mark, delim: string, i: number): boolean => {
    if (active.has(mark)) {
      flush();
      active.delete(mark);
      return true;
    }
    // Only a delimiter that closes later opens a mark.
    if (source.indexOf(delim, i + delim.length) < 0) return false;
    flush();
    active.add(mark);
    return true;
  };

  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    const rest = source.slice(i);
    if (ch === "\\" && i + 1 < source.length) {
      // A backslash before a line break is a line break.
      text += source[i + 1];
      i += 2;
      continue;
    }
    if (ch === "`") {
      const end = source.indexOf("`", i + 1);
      if (end > i) {
        push({ text: source.slice(i + 1, end), code: true });
        i = end + 1;
        continue;
      }
    }
    if (rest.startsWith("[[")) {
      const end = source.indexOf("]]", i + 2);
      if (end > i) {
        const wiki = parseWiki(source.slice(i + 2, end));
        push({ text: wiki.alias ?? (wiki.heading ? `${wiki.title} › ${wiki.heading}` : wiki.title), wiki });
        i = end + 2;
        continue;
      }
    }
    if (ch === "[") {
      const link = /^\[((?:\\.|[^\]\\])*)\]\(([^)\s]*)\)/.exec(rest);
      if (link) {
        flush();
        for (const run of parseInline(link[1])) runs.push({ ...style(), ...run, href: decodeHref(link[2]) });
        i += link[0].length;
        continue;
      }
    }
    if (/^<br\s*\/?>/i.test(rest)) {
      text += "\n";
      i += rest.match(/^<br\s*\/?>/i)![0].length;
      continue;
    }
    if (rest.startsWith("<u>") && (active.has("underline") || source.includes("</u>", i))) {
      flush();
      active.add("underline");
      i += 3;
      continue;
    }
    if (rest.startsWith("</u>") && active.has("underline")) {
      flush();
      active.delete("underline");
      i += 4;
      continue;
    }
    if (rest.startsWith("**") && toggle("bold", "**", i)) {
      i += 2;
      continue;
    }
    if (rest.startsWith("~~") && toggle("strike", "~~", i)) {
      i += 2;
      continue;
    }
    if (rest.startsWith("==") && toggle("highlight", "==", i)) {
      i += 2;
      continue;
    }
    if (ch === "*" && toggle("italic", "*", i)) {
      i += 1;
      continue;
    }
    if (ch === "_" && !(isWordChar(source[i - 1]) && isWordChar(source[i + 1])) && toggle("italic", "_", i)) {
      i += 1;
      continue;
    }
    if (ch === "&") {
      const entity = /^&(amp|lt|gt|quot|#39|nbsp);/.exec(rest);
      if (entity) {
        text += { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " }[entity[1]];
        i += entity[0].length;
        continue;
      }
    }
    text += ch;
    i++;
  }
  flush();
  return merge(runs);
}

function decodeHref(href: string): string {
  try {
    return decodeURI(href);
  } catch {
    return href;
  }
}

/** Joins neighbouring runs that look the same. */
function merge(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const run of runs) {
    const last = out[out.length - 1];
    if (last && !last.wiki && !run.wiki && !last.code && !run.code && sameStyle(last, run)) last.text += run.text;
    else out.push({ ...run });
  }
  return out;
}

const styleKeys = ["bold", "italic", "strike", "highlight", "underline", "href"] as const;
const sameStyle = (a: Run, b: Run) => styleKeys.every((k) => (a[k] ?? false) === (b[k] ?? false));

const LIST = /^(\s*)([-*+]|\d+[.)])\s+(?:\[([ xX])\]\s+)?(.*)$/;
const isTableRow = (line: string) => /^\s*\|.*\|\s*$/.test(line);
const isTableRule = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);

function splitCells(line: string): string[] {
  const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let cell = "";
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === "\\" && inner[i + 1] === "|") {
      cell += "|";
      i++;
    } else if (inner[i] === "|") {
      cells.push(cell.trim());
      cell = "";
    } else cell += inner[i];
  }
  cells.push(cell.trim());
  return cells;
}

/** A note's Markdown as blocks, top to bottom. */
export function parseMarkdown(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const fence = /^\s*(```|~~~)/.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++]);
      i++;
      blocks.push({ kind: "code", text: body.join("\n") });
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length, runs: parseInline(heading[2].replace(/\s+#+\s*$/, "")) });
      i++;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ kind: "rule" });
      i++;
      continue;
    }
    const embed = /^!\[\[([^\]]+)\]\]\s*$/.exec(line.trim());
    if (embed) {
      blocks.push({ kind: "embed", wiki: parseWiki(embed[1]) });
      i++;
      continue;
    }
    const image = /^!\[((?:\\.|[^\]\\])*)\]\(([^)\s]+)\)\s*$/.exec(line.trim());
    if (image) {
      blocks.push({ kind: "image", alt: image[1].replace(/\\(.)/g, "$1"), url: decodeHref(image[2]) });
      i++;
      continue;
    }
    if (line.trimStart().startsWith(">")) {
      const body: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith(">")) body.push(lines[i++].trimStart().replace(/^>\s?/, ""));
      const callout = /^\[!(\w+)\]\s*(.*)$/.exec(body[0] ?? "");
      if (callout) {
        const rest = [callout[2], ...body.slice(1)].filter((l, n) => n > 0 || l.trim());
        blocks.push({ kind: "callout", label: callout[1].toLowerCase(), runs: parseInline(joinLines(rest)) });
      } else blocks.push({ kind: "quote", runs: parseInline(joinLines(body)) });
      continue;
    }
    if (isTableRow(line) && i + 1 < lines.length && isTableRule(lines[i + 1])) {
      const rows: Run[][][] = [splitCells(line).map(parseInline)];
      i += 2;
      while (i < lines.length && isTableRow(lines[i])) rows.push(splitCells(lines[i++]).map(parseInline));
      blocks.push({ kind: "table", rows });
      continue;
    }
    const item = LIST.exec(line);
    if (item) {
      const indent = item[1].replace(/\t/g, "    ").length;
      const ordered = /\d/.test(item[2]);
      blocks.push({
        kind: "list",
        style: item[3] !== undefined ? "todo" : ordered ? "ordered" : "bullet",
        level: Math.floor(indent / 4) + 1,
        number: ordered ? parseInt(item[2], 10) : 0,
        checked: item[3] === "x" || item[3] === "X",
        runs: parseInline(item[4]),
      });
      i++;
      continue;
    }
    const body: string[] = [];
    while (i < lines.length && lines[i].trim() && !startsBlock(lines[i], lines[i + 1])) body.push(lines[i++]);
    if (!body.length) body.push(lines[i++]);
    blocks.push({ kind: "paragraph", runs: parseInline(joinLines(body)) });
  }
  return blocks;
}

/** Lines of one paragraph: a trailing backslash is a line break, otherwise they run together. */
function joinLines(lines: string[]): string {
  let out = "";
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n];
    if (n === lines.length - 1) out += line;
    else if (line.endsWith("\\") && !line.endsWith("\\\\")) out += `${line.slice(0, -1)}<br>`;
    else out += `${line} `;
  }
  return out;
}

function startsBlock(line: string, next: string | undefined): boolean {
  return (
    /^(#{1,6})\s/.test(line) ||
    line.trimStart().startsWith(">") ||
    /^\s*(```|~~~)/.test(line) ||
    LIST.test(line) ||
    /^\s*([-*_])(\s*\1){2,}\s*$/.test(line) ||
    (isTableRow(line) && next !== undefined && isTableRule(next))
  );
}

/** The words in some Markdown, about the way the app counts them. */
export function countWords(markdown: string): number {
  const plain = markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, "$2")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#>*_~=`|\\-]+/g, " ");
  return plain.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** Plain text for a preview line. */
export function plainText(runs: Run[]): string {
  return runs.map((r) => r.text).join("");
}
