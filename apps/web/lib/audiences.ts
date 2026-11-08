import type { StaticImageData } from "next/image";
import type { IconName } from "@plotra/icons";
import { coWriters } from "@/content/for/co-writers";
import { gameMasters } from "@/content/for/game-masters";
import { novelists } from "@/content/for/novelists";
import { obsidianUsers } from "@/content/for/obsidian-users";
import { selfHosters } from "@/content/for/self-hosters";
import { webSerialWriters } from "@/content/for/web-serial-writers";
import { worldbuilders } from "@/content/for/worldbuilders";

// The pages for each kind of writer, at /for/<slug>: the landing page that
// go-to-market sends each audience to (gtm-plan.md, "What we say to each
// audience"). One file in content/for per page. Every claim on them is one the
// docs make; the docs' own route for the same reader is linked from each.
// Adding one here adds it to /for, the footer and the sitemap.

/** A screenshot of the app, said in words for anyone who can't see it. */
export type Shot = { src: StaticImageData; alt: string; caption?: string };

export type Audience = {
  /** Its address: /for/<slug>. */
  slug: string;
  /** Who the page is for, as the footer and /for name them: "Novelists". */
  name: string;
  icon: IconName;
  /** The tab title and the headline in search results. 60 characters or fewer; " · Plotra" is added. */
  title: string;
  /** For search results and link cards. 140 to 160 characters. */
  description: string;
  /** The page's headline: the plain part, then the part set like a [[link]]. */
  headline: [string, string];
  /** The paragraph under the headline. */
  intro: string;
  /** One sentence for /for and for the links between these pages. */
  summary: string;
  hero: Shot;
  /** What goes wrong for them today. Three. */
  pains: { title: string; body: string }[];
  /** What Plotra does about it, each shown in the app or, for the server, in a terminal. */
  features: { title: string; body: string; points: string[]; shot?: Shot; code?: string }[];
  /** A table laid out on the page, where a side-by-side says it better than prose. */
  table?: { title: string; head: string[]; rows: string[][]; note?: string };
  /** A route from the first project to the finished thing. */
  steps: { title: string; body: string }[];
  /** What they may use now: what it is good at, then what Plotra adds. Never run anyone down. */
  tools: { name: string; good: string; adds: string }[];
  /** Plain text, so it can also be given to search engines as structured data. */
  faq: { q: string; a: string }[];
  /** Blog posts to read next, by slug. */
  guides: string[];
  /** The docs page that goes further, as a path on the docs site. */
  docs: { label: string; path: string };
};

/** In the order the footer and /for list them: ring 1 of the plan first. */
export const audiences: Audience[] = [
  novelists,
  worldbuilders,
  coWriters,
  gameMasters,
  webSerialWriters,
  obsidianUsers,
  selfHosters,
];

export const audiencePath = (a: Pick<Audience, "slug">) => `/for/${a.slug}`;

/** The path of a page's link card, the image a link to it unfurls into. */
export const audienceCard = (a: Pick<Audience, "slug">) => `/og/for/${a.slug}/image.png`;

export const getAudience = (slug: string) => audiences.find((a) => a.slug === slug);

export const forTitle = "Who Plotra is for";
export const forDescription =
  "Plotra for novelists, worldbuilders, co-writers, game masters, web-serial writers, Obsidian users and self-hosters: what it does for each, and how to start.";
