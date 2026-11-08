import type { StaticImageData } from "next/image";
import type { Shot } from "@/lib/audiences";
import type { Cell } from "@/lib/compare-cells";
import { campfire } from "@/content/compare/campfire";
import { ellipsus } from "@/content/compare/ellipsus";
import { googleDocs } from "@/content/compare/google-docs";
import { legendKeeper } from "@/content/compare/legendkeeper";
import { obsidian } from "@/content/compare/obsidian";
import { plottr } from "@/content/compare/plottr";
import { scrivener } from "@/content/compare/scrivener";
import { worldAnvil } from "@/content/compare/world-anvil";

// The comparison pages, at /compare/<slug>: Plotra beside one tool a writer may
// use now (gtm-plan.md, "How we compare"). One file in content/compare per page.
//
// The rules for what goes on them:
// - Say what the other tool does well first, and mean it. Never run anyone down.
// - Every fact about the other tool is on its own site or in its users' own
//   words, with the link in `sources`, and `checked` says when we looked.
// - Every claim about Plotra is one the docs make.
// Adding one here adds it to /compare, the footer and the sitemap.

export type { Cell };

export type Comparison = {
  /** Its address: /compare/<slug>. */
  slug: string;
  /** The other tool, as its makers write it: "World Anvil". */
  name: string;
  /** The tab title and the headline in search results. 60 characters or fewer; " · Plotra" is added. */
  title: string;
  /** For search results and link cards. 140 to 160 characters. */
  description: string;
  /** The page's headline: the plain part, then the part set like a [[link]]. */
  headline: [string, string];
  /** The paragraph under the headline. */
  intro: string;
  /** One sentence for /compare and for the links between these pages. */
  summary: string;
  /** The illustration at the top of the page. */
  art: { src: StaticImageData; alt: string };
  /** The answer, for someone who reads nothing else. */
  verdict: { them: string[]; plotra: string[] };
  /** What the other tool is good at, said generously. */
  strengths: { title: string; body: string }[];
  /** The tool's row in the grid on /compare, one cell for each of `glanceRows`. */
  glance: Record<GlanceKey, Cell>;
  /** The side-by-side, in groups. */
  table: { group: string; rows: { feature: string; plotra: Cell; them: Cell }[] }[];
  /** What Plotra adds, each shown in the app. */
  features: { title: string; body: string; points: string[]; shot: Shot }[];
  /** What each costs, row by row. */
  pricing: { rows: [string, string, string][]; note?: string };
  /** What people who use it say, in their own words, with the link. */
  voices?: { quote: string; who: string; url: string }[];
  /** Moving over, or using the two side by side. */
  switching: { title: string; intro: string; steps: { title: string; body: string }[] };
  /** Plain text, so it can also be given to search engines as structured data. */
  faq: { q: string; a: string }[];
  /** Where each fact about the other tool comes from. */
  sources: { label: string; url: string }[];
  /** The day we last checked the other tool's site, as YYYY-MM-DD. */
  checked: string;
  /** The /for pages for the people who make this comparison, by slug. */
  audiences: string[];
  /** Blog posts to read next, by slug. */
  guides: string[];
};

/** The questions the grid on /compare asks of every tool, and Plotra's answers. */
export const glanceRows = [
  { key: "cowrite", label: "Write together, live" },
  { key: "manuscript", label: "Draft the manuscript" },
  { key: "bible", label: "Linked story bible" },
  { key: "timeline", label: "Timeline" },
  { key: "anyOs", label: "Any OS, in a browser" },
  { key: "free", label: "Free plan" },
  { key: "open", label: "Open source, self-hostable" },
] as const;

export type GlanceKey = (typeof glanceRows)[number]["key"];

export const plotraGlance: Record<GlanceKey, Cell> = {
  cowrite: { mark: "yes" },
  manuscript: { mark: "yes" },
  bible: { mark: "yes" },
  timeline: { mark: "yes" },
  anyOs: { mark: "yes" },
  free: { mark: "yes", text: "Every feature" },
  open: { mark: "yes", text: "AGPL-3.0" },
};

/** In the order /compare and the footer list them: the most searched first. */
export const comparisons: Comparison[] = [
  scrivener,
  worldAnvil,
  campfire,
  obsidian,
  googleDocs,
  plottr,
  legendKeeper,
  ellipsus,
];

export const comparePath = (c: Pick<Comparison, "slug">) => `/compare/${c.slug}`;

/** The path of a page's link card. */
export const compareCard = (c: Pick<Comparison, "slug">) => `/og/compare/${c.slug}/image.png`;

export const getComparison = (slug: string) => comparisons.find((c) => c.slug === slug);

export const compareTitle = "Plotra compared";
export const compareDescription =
  "How Plotra compares with Scrivener, World Anvil, Campfire, Obsidian, Google Docs, Plottr, LegendKeeper and Ellipsus: what each does well, and what Plotra adds.";
