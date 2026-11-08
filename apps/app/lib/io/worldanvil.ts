// A World Anvil world in (beat-the-competitors.md, step 3). World Anvil's
// export (Settings → Export World, on every plan) is a zip with, for each
// world, a `metadata.json` and an `articles/` folder whose folders are the
// world's categories, holding a `.json` (and a rendered `.html`) per article.
// The JSON is read; the HTML is a whole page of World Anvil's layout and is
// left behind.
//
// - Categories become folders; articles keep their place in them.
// - A Person is a character; a Location, Settlement, Landmark and the like, a
//   place; anything else (an Organization, a Myth, a Species…) a note tagged
//   with what it was.
// - The text is World Anvil's BBCode: bold, italic, strikethrough, headings,
//   quotes, lists, rules and web links come across, and `@[Name](type:id)`
//   mentions become [[links]]. The fields of an article's template (Job,
//   Population, Height…) become lines under the text, and its related
//   articles (locations, organizations, family…) links at the end.
// - Left out: pictures, maps, timelines, statblocks, secrets, and the
//   category articles' own text. Pure.

import type { DocNode } from "../doc-index";
import { markdownToValue } from "./markdown";
import { MAX_TITLE, type OutlineEntry, type OutlineKind } from "./outline";
import { linksParagraph, tagFrom } from "./plottr";
import { isWorldAnvilArticle, worldAnvilPlace } from "./worldanvil-files";

export type WorldAnvilFile = { name: string; bytes: Uint8Array; folder?: string[] };
export type WorldAnvilPlan = { outline: OutlineEntry[]; leftOut: number };

type Json = Record<string, unknown>;
const obj = (value: unknown): Json => (value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {});
const str = (value: unknown) => (typeof value === "string" ? value : typeof value === "number" ? String(value) : "");
const cleanTitle = (title: string, fallback: string) => title.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE) || fallback;

// ---- BBCode -----------------------------------------------------------------------------------

// Tags whose look the editor doesn't have: the text inside them stays, the tags go.
const unwrapped = new Set(
  "u section container row col center left right justify small sup sub color size font spoiler aloud redacted tooltip verse chorus note citation ins del mark indent sidebar pullquote large xsmall xxsmall code".split(" "),
);
const MARKDOWN_SPECIAL = /[\\`*_~[\]<>#=|]/g;

/** World Anvil's BBCode as Markdown, so the Markdown reader can make it Plate blocks (and [[links]]). */
export function bbcodeToMarkdown(source: string): string {
  let out = "";
  let quote = 0;
  let skip = 0;
  const lists: Array<"ul" | "ol"> = [];
  const urls: string[] = [];
  const text = (piece: string) => {
    if (skip) return;
    const escaped = piece.replace(MARKDOWN_SPECIAL, (c) => `\\${c}`);
    out += quote ? escaped.replace(/\n/g, `\n${"> ".repeat(quote)}`) : escaped;
  };
  const raw = (piece: string) => {
    if (!skip) out += piece;
  };
  const newline = () => raw(`\n${"> ".repeat(quote)}`);
  const pattern = /\[(\/?)([a-zA-Z][a-zA-Z0-9]*)(?:=([^\]]*))?\]|@\[([^\]]+)\]\(([^)]*)\)|\[[a-z]+:[^\]\s]+\]/gi;
  const source2 = source.replace(/\r\n?/g, "\n");
  let at = 0;
  for (const match of source2.matchAll(pattern)) {
    text(source2.slice(at, match.index));
    at = match.index + match[0].length;
    const [whole, closing, rawName, value, mention] = match;
    if (mention) {
      raw(`[[${mention.replace(/[[\]|#]/g, " ").trim()}]]`);
      continue;
    }
    // An embedded article, map or statblock by id: nothing to show here.
    if (!rawName) continue;
    const name = rawName.toLowerCase();
    const close = closing === "/";
    switch (name) {
      case "b":
      case "strong":
        raw("**");
        break;
      case "i":
      case "em":
        raw("*");
        break;
      case "s":
      case "strike":
        raw("~~");
        break;
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6":
        raw(close ? "\n\n" : `\n\n${"#".repeat(Math.min(3, Number(name[1])))} `);
        break;
      case "quote":
      case "blockquote":
        if (close) quote = Math.max(0, quote - 1);
        else quote++;
        raw(close ? "\n\n" : `\n\n${"> ".repeat(quote)}`);
        break;
      case "ul":
      case "ol":
        if (close) lists.pop();
        else lists.push(name);
        raw("\n\n");
        break;
      case "li":
      case "*":
        if (!close) {
          newline();
          raw(`${"  ".repeat(Math.max(0, lists.length - 1))}${lists.at(-1) === "ol" ? "1." : "-"} `);
        }
        break;
      case "br":
        newline();
        break;
      case "hr":
        raw("\n\n---\n\n");
        break;
      case "p":
        raw("\n\n");
        break;
      case "url":
        if (close) {
          const url = urls.pop();
          if (url) raw(`](${url.replace(/[()\s]/g, encodeURIComponent)})`);
        }
        // `[url=…]words[/url]` is a link; `[url]https://…[/url]` is already its own address.
        else if (value && /^https?:\/\//i.test(value.trim())) {
          urls.push(value.trim());
          raw("[");
        } else urls.push("");
        break;
      case "img":
        skip += close ? -1 : 1;
        if (skip < 0) skip = 0;
        break;
      default:
        if (!unwrapped.has(name)) text(whole);
    }
  }
  text(source2.slice(at));
  return out;
}

/** World Anvil's BBCode as Plate blocks. */
export const bbcodeToValue = (source: string): DocNode[] => (source.trim() ? markdownToValue(bbcodeToMarkdown(source), { lines: "keep" }) : []);

// ---- The export ---------------------------------------------------------------------------

const PLACES = new Set(["location", "settlement", "landmark", "building", "formation", "geography", "region", "country", "planet", "district"]);
const NOT_ARTICLES = new Set(["map", "timeline", "image", "chronicle", "history", "block", "statblock", "secret", "manuscript", "canvas"]);
// Template sections that are settings, not writing.
const settings = /^(display|folderId$|icon$|seeded$|dob$|cover|css|is[A-Z])/;

/** "alternativeNames" is "Alternative names"; World Anvil's generic-character fields drop their "ggm". */
const label = (key: string) => {
  const words = key
    .replace(/^ggm/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : key;
};

/** True when the files include World Anvil articles. */
export const hasWorldAnvilArticles = (files: WorldAnvilFile[]) => files.some((file) => isWorldAnvilArticle([...(file.folder ?? []), file.name].join("/")));

export function planWorldAnvil(files: WorldAnvilFile[]): WorldAnvilPlan {
  const decoder = new TextDecoder("utf-8");
  const articles: Array<{ world: string; categories: string[]; data: Json }> = [];
  let leftOut = 0;
  for (const file of files) {
    const path = [...(file.folder ?? []), file.name].join("/");
    const place = worldAnvilPlace(path);
    if (!place) continue;
    let data: Json;
    try {
      data = obj(JSON.parse(decoder.decode(file.bytes)));
    } catch {
      leftOut++;
      continue;
    }
    // A category's own page; its folder is made from the paths.
    if (str(data.entityClass) === "Category" || /^category-metadata\.json$/i.test(file.name)) continue;
    if (!str(data.title)) {
      leftOut++;
      continue;
    }
    articles.push({ world: place.world, categories: place.categories, data });
  }
  if (!articles.length) throw new Error("That export has no World Anvil articles in it.");

  const outline: OutlineEntry[] = [];
  const folders = new Map<string, number>();
  const worlds = new Set(articles.map((a) => a.world));
  const folderFor = (world: string, categories: string[]): number | null => {
    let parent: number | null = null;
    // Two worlds in one export get a folder each.
    const path = worlds.size > 1 ? [world, ...categories] : categories;
    path.forEach((name, i) => {
      const id = path.slice(0, i + 1).join("\u0000");
      let at = folders.get(id);
      if (at === undefined) {
        outline.push({ parent, kind: "folder", title: cleanTitle(name, "Category"), tags: [], value: [] });
        at = outline.length - 1;
        folders.set(id, at);
      }
      parent = at;
    });
    return parent;
  };

  // In World Anvil's order within a category, then by title.
  articles.sort((a, b) => a.categories.join("/").localeCompare(b.categories.join("/")) || Number(a.data.position ?? 1e9) - Number(b.data.position ?? 1e9) || str(a.data.title).localeCompare(str(b.data.title)));

  for (const { world, categories, data } of articles) {
    const type = str(data.entityClass);
    const kind: OutlineKind = type === "Person" ? "character" : PLACES.has(type.toLowerCase()) ? "location" : "note";
    const fields: DocNode[] = [];
    for (const [key, section] of Object.entries(obj(data.sections))) {
      const content = obj(section).content;
      if (settings.test(key) || typeof content !== "string" || !content.trim()) continue;
      const blocks = bbcodeToValue(content);
      if (!blocks.length) continue;
      const name = str(obj(section).title).trim() || label(key);
      const [first, ...rest] = blocks;
      fields.push(first.type === "p" ? { ...first, children: [{ text: `${name}: `, bold: true }, ...(first.children ?? [])] } : { type: "p", children: [{ text: name, bold: true }] }, ...(first.type === "p" ? [] : [first]), ...rest);
    }
    const related = Object.entries(obj(data.relations)).flatMap(([key, relation]) => {
      const items = obj(relation).items;
      // A relation holds a list of articles ("Locations"), or one ("Current location", "Leader").
      const list = Array.isArray(items) ? items.map(obj) : str(obj(items).title) ? [obj(items)] : [];
      // Articles are linked. A taxonomy value ("Type: Magical") is written out; maps, timelines and
      // pictures aren't imported, so they're left out rather than linked to nowhere.
      const articles = list.filter((item) => str(item.relationshipType) === "article").map((item) => str(item.title)).filter(Boolean);
      const values = list.filter((item) => !str(item.relationshipType) && !NOT_ARTICLES.has(str(item.type).toLowerCase())).map((item) => str(item.title).trim()).filter(Boolean);
      const link = linksParagraph(label(key), articles);
      return [...(link ? [link] : []), ...(values.length ? [{ type: "p", children: [{ text: `${label(key)}: `, bold: true }, { text: values.join(", ") }] }] : [])];
    });
    const tags = [
      ...str(data.tags)
        .split(",")
        .map((tag) => tagFrom(tag))
        .filter(Boolean),
      ...(kind === "note" && type && type !== "Article" ? [tagFrom(type)] : []),
    ];
    const excerpt = str(data.excerpt).replace(/\s+/g, " ").trim();
    outline.push({
      parent: folderFor(world, categories),
      kind,
      title: cleanTitle(str(data.title), "Untitled"),
      tags: [...new Set(tags)],
      value: [...bbcodeToValue(str(data.content)), ...fields, ...related],
      ...(excerpt && { synopsis: excerpt.slice(0, 2000) }),
    });
  }
  return { outline, leftOut };
}
