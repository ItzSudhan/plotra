// Checks every link to a docs page: from the docs themselves (`/docs/...` and
// same-page `#anchor` links) and from the website. A link is broken when its
// page doesn't exist, or when it names a `#heading` that isn't on that page.
//
//   bun scripts/check-links.ts
//
// Prints each broken link and exits with 1 when there is any. Needs no
// dependency: page addresses and heading ids are worked out the way Fumadocs
// does it (folders in brackets and `index` leave no trace; ids are made by
// github-slugger, unless a heading sets its own with `[#id]`).

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const docsDir = join(dirname(fileURLToPath(import.meta.url)), '..');
export const contentDir = join(docsDir, 'content', 'docs');
export const webDir = join(docsDir, '..', 'web');
/** Old addresses that redirect to new ones, if the docs keep any. A link to one counts as fine. */
const movedFile = join(docsDir, 'lib', 'moved.json');

export function walk(dir: string, ext: string[]): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    if (name === 'node_modules' || name.startsWith('.')) return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path, ext);
    return ext.some((e) => name.endsWith(e)) ? [path] : [];
  });
}

/** The address a content file is served at: groups like "(guides)" and "index" leave no trace. */
export function urlOf(file: string) {
  const parts = relative(contentDir, file)
    .replace(/\.mdx$/, '')
    .split(sep)
    .filter((p) => !/^\(.+\)$/.test(p));
  if (parts.at(-1) === 'index') parts.pop();
  return ['/docs', ...parts].join('/');
}

/** github-slugger, as Fumadocs uses it for heading ids: a repeated heading gets -1, -2, ... */
export function slugger() {
  const seen = new Map<string, number>();
  return (text: string) => {
    let slug = text
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
      .replace(/ /g, '-');
    const base = slug;
    let n = seen.get(base) ?? 0;
    while (seen.has(slug)) slug = `${base}-${++n}`;
    seen.set(base, n);
    seen.set(slug, 0);
    return slug;
  };
}

/** A heading's plain text, as the slugger sees it: links, tags, code and emphasis marks removed, their words kept. */
export function headingText(raw: string) {
  return raw
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/`([^`]*)`/g, (_, code: string) => code.replace(/[*_]/g, (c) => `\u0000${c}`))
    .replace(/\*+/g, '')
    .replace(/(^|[^\p{L}\p{N}\u0000])_+|_+(?=[^\p{L}\p{N}]|$)/gu, '$1')
    .replace(/\u0000/g, '')
    .trim();
}

/** The source without front matter and fenced code, where nothing is a link or a heading. */
export function stripCode(source: string) {
  return source.replace(/^---\n[\s\S]*?\n---\n/, '').replace(/^(`{3,}|~{3,})[\s\S]*?^\1/gm, '');
}

export type Page = { file: string; ids: Set<string>; source: string };

/** Every docs page by address, with the ids of its headings. */
export function collectPages() {
  const pages = new Map<string, Page>();
  for (const file of walk(contentDir, ['.mdx'])) {
    const source = readFileSync(file, 'utf8');
    const slug = slugger();
    const ids = new Set<string>();
    for (const m of stripCode(source).matchAll(/^#{1,6} (.+?)(?:\s+#+)?\s*$/gm)) {
      // A heading can set its own id, as in `## Links [#backlinks]`, to keep an old address working.
      const custom = m[1].match(/\s*\[#([\w-]+)\]\s*$/);
      ids.add(custom ? custom[1] : slug(headingText(m[1])));
    }
    pages.set(urlOf(file), { file, ids, source });
  }
  return pages;
}

/** Old address → new address, from lib/moved.json when there is one. */
function collectMoved(): Map<string, string> {
  if (!existsSync(movedFile)) return new Map();
  const data: unknown = JSON.parse(readFileSync(movedFile, 'utf8'));
  const entries = Array.isArray(data)
    ? data.map((e: { from?: string; source?: string; to?: string; destination?: string }) => [e.from ?? e.source, e.to ?? e.destination])
    : Object.entries(data as Record<string, string>);
  return new Map(entries.filter((e): e is [string, string] => typeof e[0] === 'string' && typeof e[1] === 'string'));
}

const trim = (path: string) => path.replace(/\/$/, '') || '/docs';

/** Why a link is broken, or nothing when it works. */
export function problem(pages: Map<string, Page>, link: string, moved = new Map<string, string>()): string | undefined {
  const [path, hash] = link.split('#');
  let page = pages.get(trim(path));
  if (!page) {
    const target = moved.get(trim(path)) ?? moved.get(link);
    if (target === undefined) return 'no such page';
    // A redirect: fine as it is, unless it names a heading its new page doesn't have.
    const [newPath, newHash] = target.split('#');
    page = pages.get(trim(newPath));
    if (!page || !hash || newHash) return undefined;
  }
  if (hash && !page.ids.has(hash)) return `no heading #${hash}`;
}

/** The `/docs/...` links in a file: Markdown links, `href`s and quoted strings. */
export function linksIn(source: string) {
  const found = new Set<string>();
  for (const m of stripCode(source).matchAll(/(?:\]\(|href=["'{`]+|["'`])(\/docs(?:\/[\w\-./%]*)?(?:#[\w-]+)?)/g)) {
    found.add(m[1]);
  }
  return [...found].filter((l) => !l.endsWith('.md') && !l.startsWith('/docs/images'));
}

/** The same-page `#anchor` links in a docs page. */
export function anchorsIn(source: string) {
  const found = new Set<string>();
  for (const m of stripCode(source).matchAll(/(?:\]\(|href=["'{`]+)#([^\s)"'`}]+)/g)) found.add(m[1]);
  return [...found];
}

/** Every broken link, as "where → link (why)". */
export function brokenLinks() {
  const pages = collectPages();
  const moved = collectMoved();
  const broken: string[] = [];
  for (const [url, { source, ids }] of pages) {
    for (const link of linksIn(source)) {
      const why = problem(pages, link, moved);
      if (why) broken.push(`${url} → ${link} (${why})`);
    }
    for (const anchor of anchorsIn(source)) {
      if (!ids.has(anchor)) broken.push(`${url} → #${anchor} (no heading on this page)`);
    }
  }
  const webFiles = [
    ...walk(join(webDir, 'content'), ['.mdx', '.ts']),
    ...walk(join(webDir, 'app'), ['.tsx', '.ts']),
    ...walk(join(webDir, 'lib'), ['.ts']),
  ];
  for (const file of webFiles) {
    for (const link of linksIn(readFileSync(file, 'utf8'))) {
      const why = problem(pages, link, moved);
      if (why) broken.push(`apps/web/${relative(webDir, file)} → ${link} (${why})`);
    }
  }
  return { pages, broken };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { pages, broken } = brokenLinks();
  if (broken.length) {
    console.error(`${broken.length} broken docs link${broken.length === 1 ? '' : 's'}:`);
    for (const line of broken) console.error(`  ${line}`);
    process.exit(1);
  }
  console.log(`Checked the links in ${pages.size} docs pages and the website: none broken.`);
}
