import type { ProjectSettings } from "@plotra/db/schema";

// Front matter (beat-the-competitors.md, step 6): the pages between the title
// page and the text. A copyright page, a dedication and an epigraph, written
// once for the book and kept with the project (`settings.frontMatter`); a
// compile layout says whether a manuscript carries them (./compile.ts), and an
// EPUB always does. Pure: the export dialog, the server and the tests share it.

export type FrontMatter = NonNullable<ProjectSettings["frontMatter"]>;

/** The longest any one page may be. */
export const FRONT_LIMIT = 3000;
const SOURCE_LIMIT = 200;

const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, max) : "";

/** What the form sent, each field trimmed and capped; empty fields left out. */
export function cleanFrontMatter(input: unknown): FrontMatter {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const out: FrontMatter = {};
  const copyright = text(raw.copyright, FRONT_LIMIT);
  const dedication = text(raw.dedication, FRONT_LIMIT);
  const epigraph = text(raw.epigraph, FRONT_LIMIT);
  const epigraphSource = text(raw.epigraphSource, SOURCE_LIMIT).replace(/\n+/g, " ");
  if (copyright) out.copyright = copyright;
  if (dedication) out.dedication = dedication;
  if (epigraph) {
    out.epigraph = epigraph;
    if (epigraphSource) out.epigraphSource = epigraphSource;
  }
  return out;
}

export type FrontPage = {
  role: "copyright" | "dedication" | "epigraph";
  /** Paragraphs in order; a line break inside one is kept as `\n`. */
  paragraphs: string[];
  /** Who an epigraph is by, or where it's from. */
  source?: string;
};

const paragraphsOf = (value: string) =>
  value
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

/** The front matter as pages, in the order a book prints them: copyright, dedication, epigraph. */
export function frontPages(front: FrontMatter | undefined): FrontPage[] {
  if (!front) return [];
  const clean = cleanFrontMatter(front);
  const pages: FrontPage[] = [];
  if (clean.copyright) pages.push({ role: "copyright", paragraphs: paragraphsOf(clean.copyright) });
  if (clean.dedication) pages.push({ role: "dedication", paragraphs: paragraphsOf(clean.dedication) });
  if (clean.epigraph) pages.push({ role: "epigraph", paragraphs: paragraphsOf(clean.epigraph), ...(clean.epigraphSource && { source: clean.epigraphSource }) });
  return pages;
}

/** A starting point for the copyright page, for the writer to change. */
export function standardCopyright(author: string, year = new Date().getFullYear()): string {
  const name = author.trim() || "The author";
  return [
    `Copyright © ${year} ${name}`,
    "All rights reserved. No part of this book may be reproduced in any form without written permission from the author, except for brief quotations in a review.",
    "This is a work of fiction. Names, characters, places and incidents are the products of the author's imagination or are used fictitiously. Any resemblance to actual persons, living or dead, is coincidental.",
  ].join("\n\n");
}

/** What a page is called, in a contents list or a file name. */
export const frontPageTitle: Record<FrontPage["role"], string> = { copyright: "Copyright", dedication: "Dedication", epigraph: "Epigraph" };
