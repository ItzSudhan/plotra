// Compile settings (beat-the-competitors.md step 6): how a manuscript is set
// when it goes out as Word, RTF or plain text. Font and size, spacing and
// indents, what separates scenes, what chapter headings say, and whether
// there's a title page, a running header and a new page per chapter. A few
// presets cover the usual cases; people save their own (ShellPrefs.compile).
// Pure: the export dialog, the API and the writers share it.

export const compileFonts = {
  serif: { label: "Times New Roman", family: "Times New Roman" },
  garamond: { label: "Garamond", family: "Garamond" },
  sans: { label: "Arial", family: "Arial" },
  mono: { label: "Courier New", family: "Courier New" },
} as const;
export type CompileFont = keyof typeof compileFonts;

export const compileSpacings = { single: "Single", onehalf: "1.5 lines", double: "Double" } as const;
export type CompileSpacing = keyof typeof compileSpacings;

export const compileSeparators = { "#": "#", "* * *": "* * *", "⁂": "⁂", blank: "A blank line" } as const;
export type CompileSeparator = keyof typeof compileSeparators;

export const chapterStyles = {
  title: "The chapter's title",
  number: "Chapter 1, Chapter 2…",
  "number-title": "Chapter 1: its title",
  none: "Nothing (just a new page)",
} as const;
export type ChapterStyle = keyof typeof chapterStyles;

export const compilePapers = { letter: "US Letter", a4: "A4" } as const;
export type CompilePaper = keyof typeof compilePapers;

/** A sheet's size in inches. */
export const paperInches: Record<CompilePaper, { width: number; height: number }> = { letter: { width: 8.5, height: 11 }, a4: { width: 8.27, height: 11.69 } };

export type CompileOptions = {
  font: CompileFont;
  /** Points, 10 to 16. */
  size: number;
  spacing: CompileSpacing;
  /** First-line indent on body paragraphs. */
  indent: boolean;
  separator: CompileSeparator;
  chapters: ChapterStyle;
  /** Each scene under its own title, instead of a separator between scenes. */
  sceneTitles: boolean;
  /** Parts and chapters start on a new page. */
  pageBreaks: boolean;
  titlePage: boolean;
  /** "Surname / TITLE / page" at the top of each page. */
  header: boolean;
  /** The project's copyright page, dedication and epigraph after the title page (./front-matter.ts). */
  frontMatter: boolean;
  /** The sheet the pages are set on. */
  paper: CompilePaper;
};

/** Standard manuscript format: what Word and RTF exports have always been. */
export const standardManuscript: CompileOptions = {
  font: "serif",
  size: 12,
  spacing: "double",
  indent: true,
  separator: "#",
  chapters: "title",
  sceneTitles: false,
  pageBreaks: true,
  titlePage: true,
  header: true,
  // Agents and editors want the text, not the dedication.
  frontMatter: false,
  paper: "letter",
};

export type CompilePreset = { id: string; title: string; description: string; options: CompileOptions };

export const compilePresets: CompilePreset[] = [
  { id: "standard", title: "Standard manuscript", description: "For agents and editors: 12 pt Times, double-spaced, # between scenes.", options: standardManuscript },
  {
    id: "courier",
    title: "Courier manuscript",
    description: "The classic typewriter look some editors still ask for.",
    options: { ...standardManuscript, font: "mono" },
  },
  {
    id: "reading",
    title: "Reading copy",
    description: "For beta readers: Garamond, 1.5 lines, Chapter 1: title, front matter, no running header.",
    options: { ...standardManuscript, font: "garamond", size: 12, spacing: "onehalf", separator: "* * *", chapters: "number-title", header: false, frontMatter: true },
  },
  {
    id: "draft",
    title: "Working draft",
    description: "Compact, with scene titles: for reading your own draft.",
    options: { ...standardManuscript, font: "sans", size: 11, spacing: "single", indent: false, sceneTitles: true, pageBreaks: false, titlePage: false, header: false },
  },
];

export const getCompilePreset = (id: string | undefined) => compilePresets.find((p) => p.id === id);

const pick = <T extends string>(value: unknown, allowed: Record<T, unknown>, fallback: T): T =>
  typeof value === "string" && Object.hasOwn(allowed, value) ? (value as T) : fallback;
const flag = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);

/** Settings as they arrive from the browser, each one valid or its standard value. */
export function cleanCompile(input: unknown): CompileOptions {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const s = standardManuscript;
  const size = typeof raw.size === "number" && Number.isFinite(raw.size) ? Math.min(16, Math.max(10, Math.round(raw.size))) : s.size;
  return {
    font: pick(raw.font, compileFonts, s.font),
    size,
    spacing: pick(raw.spacing, compileSpacings, s.spacing),
    indent: flag(raw.indent, s.indent),
    separator: pick(raw.separator, compileSeparators, s.separator),
    chapters: pick(raw.chapters, chapterStyles, s.chapters),
    sceneTitles: flag(raw.sceneTitles, s.sceneTitles),
    pageBreaks: flag(raw.pageBreaks, s.pageBreaks),
    titlePage: flag(raw.titlePage, s.titlePage),
    header: flag(raw.header, s.header),
    frontMatter: flag(raw.frontMatter, s.frontMatter),
    paper: pick(raw.paper, compilePapers, s.paper),
  };
}

/** What a chapter heading says: "Chapter 3", "Chapter 3: The Ball", the title, or nothing. */
export function chapterHeading(style: ChapterStyle, title: string, n: number): string {
  if (style === "number") return `Chapter ${n}`;
  if (style === "number-title") return title.trim() ? `Chapter ${n}: ${title}` : `Chapter ${n}`;
  if (style === "none") return "";
  return title;
}

/** What goes between scenes, as text; empty for a blank line. */
export const separatorText = (separator: CompileSeparator) => (separator === "blank" ? "" : separator);

// ---- Presets of your own ---------------------------------------------------------------------

export const MAX_OWN_PRESETS = 12;

export function cleanOwnPresets(input: unknown): CompilePreset[] {
  const out: CompilePreset[] = [];
  for (const item of Array.isArray(input) ? input : []) {
    const raw = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const title = typeof raw.title === "string" ? raw.title.replace(/\s+/g, " ").trim().slice(0, 60) : "";
    if (!title) continue;
    const id = typeof raw.id === "string" && /^own-[a-z0-9-]{1,40}$/.test(raw.id) ? raw.id : `own-${crypto.randomUUID().slice(0, 8)}`;
    out.push({ id, title, description: "", options: cleanCompile(raw.options) });
    if (out.length >= MAX_OWN_PRESETS) break;
  }
  return out;
}
