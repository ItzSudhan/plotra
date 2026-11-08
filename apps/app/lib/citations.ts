// Citations and bibliographies (plan.md 2.8 "Research & sources"). A source is a
// research note: its title is the work's title and its typed properties hold
// the rest (lib/templates.ts). Everything here is pure, so the editor, the
// sources view and exports all format a reference the same way.

export type CitationStyle = "apa" | "mla" | "chicago";

export const citationStyles: Array<{ id: CitationStyle; label: string; description: string }> = [
  { id: "apa", label: "APA", description: "APA 7th edition" },
  { id: "mla", label: "MLA", description: "MLA 9th edition" },
  { id: "chicago", label: "Chicago", description: "Chicago 17th edition, author-date" },
];

export const DEFAULT_CITATION_STYLE: CitationStyle = "apa";

export const isCitationStyle = (value: unknown): value is CitationStyle => value === "apa" || value === "mla" || value === "chicago";

/** What the list of sources is called in each style. */
export const bibliographyTitle: Record<CitationStyle, string> = {
  apa: "References",
  mla: "Works Cited",
  chicago: "Reference List",
};

/** The choices of a research note's "Type" property. */
export const sourceTypeChoices = ["Book", "Article", "Chapter", "Website", "Report", "Interview", "Film", "Other"] as const;
export type SourceType = Lowercase<(typeof sourceTypeChoices)[number]>;

/** Property keys of a research note that make up its reference. */
export const researchKeys = {
  type: "source-type",
  authors: "authors",
  container: "container",
  publisher: "publisher",
  year: "year",
  volume: "volume",
  pages: "pages",
  // The URL keeps the key research notes had before they grew bibliography fields.
  url: "source",
  accessed: "accessed",
  identifier: "identifier",
} as const;

/** A person ("Okafor, Ngozi A.") or, when `literal`, a name printed as it is (an organisation). */
export type Author = { family: string; given: string; literal?: boolean };

/** A date as precise as the writer gave it. `label` is anything that isn't a date ("forthcoming"). */
export type SourceDate = { year?: number; month?: number; day?: number; label?: string };

export type Source = {
  id: string;
  title: string;
  type: SourceType;
  authors: Author[];
  /** The journal, book or site the work appears in. */
  container: string;
  publisher: string;
  date: SourceDate | null;
  volume: string;
  issue: string;
  pages: string;
  url: string;
  accessed: SourceDate | null;
  doi: string;
  isbn: string;
};

/** A piece of formatted text: references italicise titles, and exports need to know which part is a link. */
export type Run = { text: string; italic?: boolean; href?: string };

// ---- Reading a source from a note ---------------------------------------------------

type SourceNode = { id: string; title: string; properties: Record<string, unknown> };

const str = (value: unknown) => (typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "");

const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const mlaMonths = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];

/** Reads "2019", "2019-03", "2019-03-04", "March 4, 2019" or "4 March 2019"; anything else is kept as a label. */
export function parseDate(raw: string): SourceDate | null {
  const text = raw.trim();
  if (!text) return null;
  const iso = /^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?(?:$|[T\s])/.exec(text);
  if (iso) {
    const month = iso[2] ? Number(iso[2]) : undefined;
    const day = iso[3] ? Number(iso[3]) : undefined;
    const validMonth = month && month >= 1 && month <= 12 ? month : undefined;
    return { year: Number(iso[1]), ...(validMonth && { month: validMonth }), ...(validMonth && day && day >= 1 && day <= 31 && { day }) };
  }
  const year = /\b(\d{4})\b/.exec(text);
  if (!year) return { label: text };
  const named = months.findIndex((m) => new RegExp(`\\b${m.slice(0, 3)}`, "i").test(text));
  if (named < 0) {
    // "c. 1850" or "1999a" say more than the year alone: keep them as written.
    return text === year[1] ? { year: Number(year[1]) } : { year: Number(year[1]), label: text };
  }
  const day = /\b(\d{1,2})(?:st|nd|rd|th)?\b(?!\d)/.exec(text.replace(year[1], ""));
  return { year: Number(year[1]), month: named + 1, ...(day && Number(day[1]) >= 1 && Number(day[1]) <= 31 && { day: Number(day[1]) }) };
}

const particles = new Set(["van", "von", "de", "del", "della", "der", "den", "di", "da", "dos", "du", "la", "le", "bin", "ibn", "al", "el", "ter", "ten"]);
const organisation =
  /\b(organi[sz]ation|institute|institution|university|college|school|department|ministry|committee|commission|association|society|agency|council|foundation|bureau|office|group|team|staff|press|news|times|inc|ltd|llc|corp|company|bank|centre|center|museum|library|archive|government|authority|service|network)\b/i;

function parseAuthor(raw: string): Author | null {
  const text = raw.trim().replace(/\s+/g, " ");
  if (!text) return null;
  // {World Health Organization}: printed exactly as written, as in BibTeX.
  const braced = /^\{(.+)\}$/.exec(text);
  if (braced) return { family: braced[1].trim(), given: "", literal: true };
  const comma = text.indexOf(",");
  if (comma > 0) {
    const given = text.slice(comma + 1).trim();
    return given ? { family: text.slice(0, comma).trim(), given } : { family: text.slice(0, comma).trim(), given: "", literal: true };
  }
  const words = text.split(" ");
  if (words.length === 1 || words.length > 4 || organisation.test(text)) return { family: text, given: "", literal: true };
  // "Ludwig van Beethoven": lower-case particles belong to the family name.
  let start = words.length - 1;
  while (start > 1 && particles.has(words[start - 1]) && words[start - 1] === words[start - 1].toLowerCase()) start--;
  return { family: words.slice(start).join(" "), given: words.slice(0, start).join(" ") };
}

/**
 * Authors as typed in a research note: "Last, First; Last, First". Also takes
 * "First Last", names joined by "and", and {an organisation} in braces.
 */
export function parseAuthors(raw: string): Author[] {
  const text = raw.trim();
  if (!text) return [];
  let parts = text.split(/[;\n]+/);
  if (parts.length === 1 && !text.startsWith("{") && !(organisation.test(text) && !text.includes(","))) {
    parts = text.split(/\s+(?:and|&)\s+/i);
  }
  return parts.map(parseAuthor).filter((a): a is Author => a !== null);
}

/** The reverse of `parseAuthors`, for filling in a note's Authors field. */
export function formatAuthorsField(authors: Author[]) {
  return authors.map((a) => (a.literal ? (/[,;]|\s(and|&)\s/i.test(a.family) ? `{${a.family}}` : a.family) : `${a.family}, ${a.given}`)).join("; ");
}

/** "12(3)", "12, no. 3", "12:3" or just "12". */
function parseVolume(raw: string) {
  const text = raw.trim();
  const match = /^(?:vol(?:ume)?\.?\s*)?([\w-]+)\s*(?:[(,:;/]\s*(?:no\.?|issue)?\s*([\w-]+)\)?)?$/i.exec(text);
  return match ? { volume: match[1], issue: match[2] ?? "" } : { volume: text, issue: "" };
}

const DOI = /\b(10\.\d{4,9}\/[^\s"<>]+)/;

function parseIdentifier(raw: string) {
  const text = raw.trim();
  const doi = DOI.exec(text);
  if (doi) return { doi: doi[1].replace(/[.,;]+$/, ""), isbn: "" };
  const digits = text.replace(/^isbn(?:-1[03])?:?\s*/i, "");
  if (/^[\d\s–-]{9,17}[\dxX]$/.test(digits)) return { doi: "", isbn: digits.replace(/[–\s]/g, "-") };
  return { doi: "", isbn: "" };
}

const typeOf = (value: unknown): SourceType => {
  const text = str(value).toLowerCase();
  return (sourceTypeChoices as readonly string[]).some((c) => c.toLowerCase() === text) ? (text as SourceType) : "other";
};

/** The bibliographic record held by a research note. */
export function sourceFromNode(node: SourceNode): Source {
  const p = node.properties ?? {};
  const url = str(p[researchKeys.url]);
  const identifier = parseIdentifier(str(p[researchKeys.identifier]));
  // A DOI pasted as the URL is still a DOI.
  const doi = identifier.doi || (/^https?:\/\/(?:dx\.)?doi\.org\//i.test(url) ? (DOI.exec(url)?.[1] ?? "") : "");
  const explicit = str(p[researchKeys.type]);
  return {
    id: node.id,
    title: node.title.trim(),
    // Notes from before the Type field existed: one with only a link is most likely a web page.
    type: explicit ? typeOf(explicit) : url && !str(p[researchKeys.publisher]) ? "website" : "other",
    authors: parseAuthors(str(p[researchKeys.authors])),
    container: str(p[researchKeys.container]),
    publisher: str(p[researchKeys.publisher]),
    date: parseDate(str(p[researchKeys.year])),
    ...parseVolume(str(p[researchKeys.volume])),
    pages: str(p[researchKeys.pages]),
    url: /^https?:\/\//i.test(url) ? url : "",
    accessed: parseDate(str(p[researchKeys.accessed])),
    doi,
    isbn: identifier.isbn,
  };
}

/** Fields a complete reference of this type needs but the note doesn't have yet. */
export function missingFields(source: Source): string[] {
  const missing: string[] = [];
  if (!source.authors.length) missing.push(source.type === "film" ? "director" : "authors");
  if (!source.date) missing.push("year");
  const needs: Partial<Record<SourceType, Array<"container" | "publisher" | "url">>> = {
    book: ["publisher"],
    article: ["container"],
    chapter: ["container", "publisher"],
    website: ["url"],
    report: ["publisher"],
  };
  for (const field of needs[source.type] ?? []) {
    if (source[field]) continue;
    missing.push(field === "container" ? (source.type === "article" ? "journal" : "book title") : field === "url" ? "URL" : field);
  }
  return missing;
}

// ---- Names and dates ---------------------------------------------------------------

/** "Ngozi Adaeze" → "N. A.", "Jean-Paul" → "J.-P.", "J.R.R." → "J. R. R." */
export function initials(given: string) {
  return given
    .split(/\s+/)
    .filter(Boolean)
    .map((word) =>
      word
        .split("-")
        .filter(Boolean)
        .map((piece) => {
          // Already initials: "J.R.R." or "JRR".
          if (/^(?:\p{Lu}\.)+$/u.test(piece) || /^\p{Lu}{2,3}$/u.test(piece)) return [...piece.replace(/\./g, "")].map((l) => `${l}.`).join(" ");
          return `${[...piece][0].toUpperCase()}.`;
        })
        .join("-"),
    )
    .join(" ");
}

const inverted = (a: Author) => (a.literal || !a.given ? a.family : `${a.family}, ${a.given}`);
const natural = (a: Author) => (a.literal || !a.given ? a.family : `${a.given} ${a.family}`);
const apaName = (a: Author) => (a.literal || !a.given ? a.family : `${a.family}, ${initials(a.given)}`);

function apaAuthors(authors: Author[]) {
  const names = authors.map(apaName);
  if (names.length <= 1) return names.join("");
  // Twenty-one or more: the first nineteen, an ellipsis, then the last.
  if (names.length > 20) return `${names.slice(0, 19).join(", ")}, … ${names.at(-1)}`;
  return `${names.slice(0, -1).join(", ")}, & ${names.at(-1)}`;
}

/** First author inverted, the rest in natural order, as MLA and Chicago list them. */
function listedAuthors(authors: Author[], style: "mla" | "chicago") {
  if (!authors.length) return "";
  const first = inverted(authors[0]);
  if (authors.length === 1) return first;
  if (style === "mla") return authors.length === 2 ? `${first}, and ${natural(authors[1])}` : `${first}, et al.`;
  // Chicago lists up to ten; beyond that the first seven and "et al."
  if (authors.length > 10) return `${[first, ...authors.slice(1, 7).map(natural)].join(", ")}, et al.`;
  const rest = authors.slice(1).map(natural);
  return `${[first, ...rest.slice(0, -1)].join(", ")}, and ${rest.at(-1)}`;
}

const yearText = (date: SourceDate | null, suffix = "") => date?.label || (date?.year ? `${date.year}${suffix}` : "n.d.");

function longDate(date: SourceDate) {
  if (!date.year || date.label) return date.label ?? "";
  if (!date.month) return String(date.year);
  return date.day ? `${months[date.month - 1]} ${date.day}, ${date.year}` : `${months[date.month - 1]} ${date.year}`;
}

const monthDay = (date: SourceDate) => (date.month ? `${months[date.month - 1]}${date.day ? ` ${date.day}` : ""}` : "");

function mlaDate(date: SourceDate | null) {
  if (!date) return "";
  if (!date.year || date.label) return date.label ?? "";
  if (!date.month) return String(date.year);
  return `${date.day ? `${date.day} ` : ""}${mlaMonths[date.month - 1]} ${date.year}`;
}

/** Hyphens between page numbers become en dashes: "44-46" → "44–46". */
const pageRange = (pages: string) => pages.trim().replace(/(\d)\s*[-–—]+\s*(\d)/g, "$1–$2");
const manyPages = (pages: string) => /[-–—,]/.test(pages);
const pagesWithLabel = (pages: string) => (/^[\divxlcdm\s,–-]+$/i.test(pages) ? `${manyPages(pages) ? "pp." : "p."} ${pageRange(pages)}` : pageRange(pages));
const barePages = (pages: string) => pageRange(pages.replace(/^p(?:p|ages?)?\.?\s*/i, ""));

const linkOf = (source: Source) => (source.doi ? `https://doi.org/${source.doi}` : source.url);

// ---- Assembling a reference --------------------------------------------------------

/** A sentence of the reference; each ends with a full stop unless it's `bare` (a URL in APA). */
type Part = { runs: Run[]; bare?: boolean };

const plain = (text: string): Run => ({ text });
const italic = (text: string): Run => ({ text, italic: true });
const part = (...runs: Array<Run | string | null | undefined | false>): Part => ({
  runs: runs.filter((r): r is Run | string => Boolean(r)).map((r) => (typeof r === "string" ? plain(r) : r)),
});
const link = (url: string, bare = false): Part => ({ runs: [{ text: url, href: url }], bare });

const closed = (text: string) => /[.?!…]["”’]*$/.test(text);

/** “Title.” with the full stop inside the quotation marks, as MLA and Chicago write it. */
const quoted = (title: string) => plain(`“${title}${closed(title) ? "" : "."}”`);

function assemble(parts: Array<Part | null | false | undefined | "">): Run[] {
  const out: Run[] = [];
  for (const p of parts) {
    if (!p) continue;
    const runs = p.runs.filter((r) => r.text);
    if (!runs.length) continue;
    if (out.length) out.push(plain(" "));
    out.push(...runs);
    if (!p.bare && !closed(runs.map((r) => r.text).join(""))) out.push(plain("."));
  }
  // Neighbouring runs of the same kind read as one.
  return out.reduce<Run[]>((merged, run) => {
    const last = merged.at(-1);
    if (last && !last.href && !run.href && Boolean(last.italic) === Boolean(run.italic)) last.text += run.text;
    else merged.push({ ...run });
    return merged;
  }, []);
}

/** Joins the non-empty items of a comma list, each item one or more runs. */
function commaList(items: Array<Run | string | null | undefined | false>): Run[] {
  const out: Run[] = [];
  for (const item of items) {
    if (!item) continue;
    const run = typeof item === "string" ? plain(item) : item;
    if (!run.text) continue;
    if (out.length) out.push(plain(", "));
    out.push(run);
  }
  return out;
}

const standalone = (type: SourceType) => type !== "article" && type !== "chapter";

function apaReference(s: Source, suffix: string): Run[] {
  const fullDate = s.type === "website" || s.type === "interview" || (s.type === "article" && !s.volume);
  const year = yearText(s.date, suffix);
  const dated =
    fullDate && s.date?.year && s.date.month && !s.date.label
      ? `(${year}, ${monthDay(s.date)})`
      : `(${year})`;
  const bracket = s.type === "film" ? " [Film]" : s.type === "interview" ? " [Interview]" : "";
  const title = part(standalone(s.type) ? italic(s.title) : s.title, bracket);
  const role = s.type === "film" ? (s.authors.length > 1 ? " (Directors)" : " (Director)") : "";
  const author = s.authors.length ? part(apaAuthors(s.authors) + role) : null;
  const head = author ? [author, part(dated), title] : [title, part(dated)];
  const url = linkOf(s) ? link(linkOf(s), true) : null;

  switch (s.type) {
    case "article":
      return assemble([
        ...head,
        s.container
          ? part(italic(s.container), s.volume && ", ", s.volume && italic(s.volume), s.issue && `(${s.issue})`, s.pages && `, ${barePages(s.pages)}`)
          : null,
        url,
      ]);
    case "chapter":
      return assemble([
        ...head,
        s.container ? part("In ", italic(s.container), s.pages && ` (${pagesWithLabel(barePages(s.pages))})`) : null,
        s.publisher && part(s.publisher),
        url,
      ]);
    case "website": {
      // The site isn't repeated when it's also the author.
      const site = s.container && !s.authors.some((a) => a.family.toLowerCase() === s.container.toLowerCase()) ? s.container : "";
      return assemble([...head, site && part(site), url]);
    }
    case "interview":
      return assemble([...head, s.container && part(s.container), s.publisher && part(s.publisher), url]);
    default:
      return assemble([...head, s.publisher && part(s.publisher), url]);
  }
}

function mlaReference(s: Source): Run[] {
  const author = s.authors.length && s.type !== "film" ? part(listedAuthors(s.authors, "mla")) : null;
  const date = mlaDate(s.date);
  const pages = s.pages ? pagesWithLabel(barePages(s.pages)) : "";
  // MLA 9: the DOI or URL is the container's last element, after a comma.
  const url: Run | null = linkOf(s) ? { text: linkOf(s), href: linkOf(s) } : null;

  switch (s.type) {
    case "article":
      return assemble([
        author,
        part(quoted(s.title)),
        { runs: commaList([s.container && italic(s.container), s.volume && `vol. ${s.volume}`, s.issue && `no. ${s.issue}`, date, pages, url]) },
      ]);
    case "chapter":
      return assemble([author, part(quoted(s.title)), { runs: commaList([s.container && italic(s.container), s.publisher, date, pages, url]) }]);
    case "website":
      return assemble([
        author,
        part(quoted(s.title)),
        { runs: commaList([s.container && italic(s.container), s.publisher, date, url]) },
        s.accessed?.year ? part(`Accessed ${mlaDate(s.accessed)}`) : null,
      ]);
    case "interview":
      return assemble([author, part(quoted(s.title)), { runs: commaList([s.container ? italic(s.container) : "Interview", s.publisher, date, url]) }]);
    case "film":
      return assemble([
        part(italic(s.title)),
        s.authors.length ? part(`Directed by ${s.authors.map(natural).join(s.authors.length === 2 ? " and " : ", ")}`) : null,
        { runs: commaList([s.publisher, date, url]) },
      ]);
    default:
      return assemble([author, part(italic(s.title)), { runs: commaList([s.publisher, date, url]) }]);
  }
}

function chicagoReference(s: Source, suffix: string): Run[] {
  const year = part(yearText(s.date, suffix));
  const title = part(standalone(s.type) && s.type !== "website" && s.type !== "interview" ? italic(s.title) : quoted(s.title));
  const role = s.type === "film" ? ", dir." : "";
  const author = s.authors.length ? part(listedAuthors(s.authors, "chicago") + role) : null;
  const head = author ? [author, year, title] : [title, year];
  const url = linkOf(s) ? link(linkOf(s)) : null;
  const dayOf = (date: SourceDate | null) => (date?.year && date.month && !date.label ? longDate(date) : "");

  switch (s.type) {
    case "article": {
      const where = s.volume
        ? part(italic(s.container), s.container && " ", s.volume, s.issue && ` (${s.issue})`, s.pages && `: ${barePages(s.pages)}`)
        : { runs: commaList([s.container && italic(s.container), s.date && !s.date.label ? monthDay(s.date) : "", s.pages && barePages(s.pages)]) };
      return assemble([...head, where, url]);
    }
    case "chapter":
      return assemble([...head, s.container ? { runs: [plain("In "), ...commaList([italic(s.container), s.pages && barePages(s.pages)])] } : null, s.publisher && part(s.publisher), url]);
    case "website":
      return assemble([
        ...head,
        s.container && part(s.container),
        dayOf(s.date) ? part(dayOf(s.date)) : s.accessed?.year ? part(`Accessed ${longDate(s.accessed)}`) : null,
        url,
      ]);
    case "interview":
      return assemble([...head, part("Interview"), s.container && part(s.container), s.publisher && part(s.publisher), url]);
    default:
      return assemble([...head, s.publisher && part(s.publisher), url]);
  }
}

/**
 * The full reference, as it appears in a bibliography. `suffix` is the letter
 * that tells apart two works by the same author in the same year ("2019a").
 */
export function formatReference(source: Source, style: CitationStyle, options: { suffix?: string } = {}): Run[] {
  const s = source.title ? source : { ...source, title: "Untitled" };
  if (style === "mla") return mlaReference(s);
  return style === "chicago" ? chicagoReference(s, options.suffix ?? "") : apaReference(s, options.suffix ?? "");
}

// ---- In-text citations -------------------------------------------------------------

const surname = (a: Author) => a.family;

function shortTitle(title: string) {
  const words = title.split(/\s+/).filter(Boolean);
  const short = words.slice(0, 4).join(" ").replace(/[:;,.]+$/, "");
  return words.length > 4 ? short : title.replace(/[.]+$/, "");
}

/** The names an in-text citation uses: "Okafor", "Okafor and Lee", "Okafor et al." */
function citedNames(source: Source, style: CitationStyle): Run[] {
  const a = source.authors;
  if (!a.length) {
    const title = shortTitle(source.title || "Untitled");
    return [standalone(source.type) && source.type !== "website" && source.type !== "interview" ? italic(title) : plain(`“${title}”`)];
  }
  const and = style === "apa" ? " & " : " and ";
  if (a.length === 1) return [plain(surname(a[0]))];
  if (a.length === 2) return [plain(`${surname(a[0])}${and}${surname(a[1])}`)];
  if (a.length === 3 && style === "chicago") return [plain(`${surname(a[0])}, ${surname(a[1])}, and ${surname(a[2])}`)];
  return [plain(`${surname(a[0])} et al.`)];
}

/** Splits a locator into page numbers ("p. 44", "44-46") or anything else ("chap. 3"). */
function parseLocator(raw: string | undefined) {
  const text = (raw ?? "").trim();
  if (!text) return null;
  const pages = /^(?:pp?\.?|pages?)\s*(.+)$/i.exec(text)?.[1] ?? (/^[\divxlcdm]+(?:\s*[-–—,]\s*[\divxlcdm]+)*$/i.test(text) ? text : null);
  return pages ? { pages: pageRange(pages), other: "" } : { pages: "", other: text };
}

/**
 * The short form that goes in the text: "(Okafor, 2019, p. 44)" in APA,
 * "(Okafor 44)" in MLA, "(Okafor 2019, 44)" in Chicago.
 */
export function formatInText(source: Source, style: CitationStyle, options: { locator?: string; suffix?: string } = {}): Run[] {
  const names = citedNames(source, style);
  const locator = parseLocator(options.locator);
  const year = yearText(source.date, options.suffix ?? "");
  const out: Run[] = [plain("("), ...names];
  if (style === "apa") {
    out.push(plain(`, ${year}`));
    if (locator) out.push(plain(`, ${locator.pages ? pagesWithLabel(locator.pages) : locator.other}`));
  } else if (style === "mla") {
    if (locator) out.push(plain(locator.pages ? ` ${locator.pages}` : `, ${locator.other}`));
  } else {
    out.push(plain(` ${year}`));
    if (locator) out.push(plain(`, ${locator.pages || locator.other}`));
  }
  out.push(plain(")"));
  return out;
}

// ---- Rendering runs -----------------------------------------------------------------

export const runsToText = (runs: Run[]) => runs.map((r) => r.text).join("");

const escapeMarkdown = (text: string) => text.replace(/([\\*_`[\]<>])/g, "\\$1");

export function runsToMarkdown(runs: Run[]) {
  return runs
    .map((r) => {
      if (r.href) return `<${r.href}>`;
      if (!r.italic) return escapeMarkdown(r.text);
      // Emphasis can't start or end with a space.
      const [, lead, body, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(r.text)!;
      return body ? `${lead}*${escapeMarkdown(body)}*${trail}` : r.text;
    })
    .join("");
}

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function runsToHtml(runs: Run[]) {
  return runs
    .map((r) => {
      const text = escapeHtml(r.text);
      if (r.href && /^https?:\/\//i.test(r.href)) return `<a href="${escapeHtml(r.href)}">${text}</a>`;
      return r.italic ? `<i>${text}</i>` : text;
    })
    .join("");
}

// ---- Sorting and whole bibliographies ---------------------------------------------

const fold = (text: string) => text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();

/** Titles file under their first word that isn't an article. */
const titleKey = (title: string) => fold(title).replace(/^(?:the|an|a)\s+/, "").replace(/^[^\p{L}\p{N}]+/u, "");

const authorKey = (source: Source) =>
  source.authors.length ? source.authors.map((a) => `${fold(a.family)} ${fold(a.given)}`).join("; ") : titleKey(source.title);

export type SourceSort = "author" | "year" | "title";

/** Sorted copies: by author (the bibliography's order), by year (newest first) or by title. */
export function sortSources(sources: Source[], by: SourceSort = "author"): Source[] {
  const year = (s: Source) => s.date?.year ?? -Infinity;
  const text = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const byAuthor = (a: Source, b: Source) =>
    text(authorKey(a), authorKey(b)) || (a.date?.year ?? Infinity) - (b.date?.year ?? Infinity) || text(titleKey(a.title), titleKey(b.title));
  return [...sources].sort((a, b) => {
    if (by === "year") return year(b) - year(a) || byAuthor(a, b);
    if (by === "title") return text(titleKey(a.title), titleKey(b.title)) || byAuthor(a, b);
    return byAuthor(a, b);
  });
}

/**
 * Letters for works that would otherwise be cited identically: two by the same
 * authors in the same year become 2019a and 2019b, in title order.
 */
export function yearSuffixes(sources: Source[]): Map<string, string> {
  const groups = new Map<string, Source[]>();
  for (const s of sources) {
    if (!s.date?.year || s.date.label) continue;
    const key = `${runsToText(citedNames(s, "chicago"))}|${s.authors.map((a) => fold(a.family)).join(";")}|${s.date.year}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  const suffixes = new Map<string, string>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    sortSources(group, "title").forEach((s, i) => suffixes.set(s.id, i < 26 ? String.fromCharCode(97 + i) : `z${i - 25}`));
  }
  return suffixes;
}

export type BibliographyEntry = { source: Source; runs: Run[] };

/** Every source's reference, in bibliography order. */
export function bibliography(sources: Source[], style: CitationStyle): BibliographyEntry[] {
  // MLA has no year in its citations, so nothing needs telling apart.
  const suffixes = style === "mla" ? new Map<string, string>() : yearSuffixes(sources);
  return sortSources(sources, "author").map((source) => ({ source, runs: formatReference(source, style, { suffix: suffixes.get(source.id) }) }));
}

/** The bibliography as a Markdown or plain-text document. */
export function bibliographyText(sources: Source[], style: CitationStyle, format: "md" | "txt", heading = bibliographyTitle[style]) {
  const entries = bibliography(sources, style);
  if (format === "md") return `# ${heading}\n\n${entries.map((e) => runsToMarkdown(e.runs)).join("\n\n")}\n`;
  return `${heading}\n${"=".repeat(heading.length)}\n\n${entries.map((e) => runsToText(e.runs)).join("\n\n")}\n`;
}

// ---- BibTeX -------------------------------------------------------------------------

const bibtexTypes: Record<SourceType, string> = {
  book: "book",
  article: "article",
  chapter: "incollection",
  website: "misc",
  report: "techreport",
  interview: "misc",
  film: "misc",
  other: "misc",
};

const stopWords = new Set(["a", "an", "the", "of", "on", "in", "and", "for", "to", "with", "from", "at", "by"]);
const ascii = (text: string) => fold(text).replace(/[^a-z0-9]+/g, "");

/** A citation key like `okafor2019rivers`: first author, year, first telling word of the title. */
export function bibtexKey(source: Source) {
  const words = fold(source.title).split(/[^a-z0-9]+/).filter(Boolean);
  const word = words.find((w) => !stopWords.has(w)) ?? words[0] ?? "";
  const first = source.authors[0];
  // An organisation is known by its first word, a person by their family name.
  const name = first ? ascii(first.literal ? (first.family.split(/\s+/).find((w) => !stopWords.has(w.toLowerCase())) ?? first.family) : first.family) : "";
  return `${name}${source.date?.year ?? ""}${ascii(word)}` || "source";
}

/** Keys for a whole set, made unique with a letter when two collide. */
export function bibtexKeys(sources: Source[]): Map<string, string> {
  const taken = new Map<string, number>();
  const keys = new Map<string, string>();
  for (const s of sortSources(sources, "author")) {
    const base = bibtexKey(s);
    const n = taken.get(base) ?? 0;
    taken.set(base, n + 1);
    keys.set(s.id, n === 0 ? base : `${base}${n < 26 ? String.fromCharCode(97 + n) : n}`);
  }
  return keys;
}

const escapeBibtex = (text: string) =>
  text
    .replace(/\\/g, "\\textbackslash ")
    .replace(/([&%$#_{}])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde ")
    .replace(/\^/g, "\\textasciicircum ");

const isoDate = (date: SourceDate) =>
  `${date.year}${date.month ? `-${String(date.month).padStart(2, "0")}${date.day ? `-${String(date.day).padStart(2, "0")}` : ""}` : ""}`;

/** One BibTeX entry. Pass `key` when exporting a set (see `bibtexKeys`). */
export function bibtexEntry(source: Source, key = bibtexKey(source)) {
  const fields: Array<[string, string]> = [];
  const add = (name: string, value: string | undefined | false, raw = false) => {
    if (value) fields.push([name, raw ? value : escapeBibtex(value)]);
  };
  // An organisation's name is wrapped in a second pair of braces so BibTeX doesn't split it into first and last.
  const authors = source.authors
    .map((a) => (a.literal || !a.given ? `{${escapeBibtex(a.family)}}` : `${escapeBibtex(a.family)}, ${escapeBibtex(a.given)}`))
    .join(" and ");
  add("author", authors, true);
  add("title", source.title || "Untitled");
  if (source.type === "article") add("journal", source.container);
  else if (source.type === "chapter") add("booktitle", source.container);
  else if (source.container) add("howpublished", source.container);
  add(source.type === "report" ? "institution" : "publisher", source.publisher);
  add("year", source.date?.year ? String(source.date.year) : source.date?.label);
  if (source.date?.month) add("month", String(source.date.month), true);
  add("volume", source.volume);
  add("number", source.issue);
  add("pages", source.pages && barePages(source.pages).replace(/–/g, "--"), true);
  add("doi", source.doi, true);
  add("isbn", source.isbn, true);
  add("url", source.url, true);
  if (source.accessed?.year) add("urldate", isoDate(source.accessed), true);
  if (source.type === "film" || source.type === "interview") add("note", source.type === "film" ? "Film" : "Interview");
  const width = Math.max(...fields.map(([name]) => name.length));
  return `@${bibtexTypes[source.type]}{${key},\n${fields.map(([name, value]) => `  ${name.padEnd(width)} = {${value}}`).join(",\n")}\n}`;
}

/** A `.bib` file of every source. */
export function bibliographyBibtex(sources: Source[]) {
  const keys = bibtexKeys(sources);
  return `${sortSources(sources, "author").map((s) => bibtexEntry(s, keys.get(s.id))).join("\n\n")}\n`;
}
