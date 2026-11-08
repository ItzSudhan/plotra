import "server-only";
import type { NodeKind, PropertyValue } from "@plotra/db/schema";
import type { PropertyDef } from "../knowledge-actions";
import { nodeKindMeta, type BinderNode } from "../tree";
import type { Collected } from "./collect";
import { baseCss, esc, fileSlug, plainText, renderBlocks, safeUrl, type RenderContext } from "./html";
import { packImages } from "./images";
import { zip } from "./zip";

// The public wiki / companion site (plan.md 2.8 "Publishing outputs"): static
// pages for the world's characters, places and entities, with only what the
// audience has been told (the spoiler horizon) and, if asked, only what's
// canon. A folder of plain HTML, free to host anywhere.
//
// Everything that isn't published leaves no trace: no page, no link to it, not
// even its name in a property or a "mentioned in" list.

const wikiKinds = new Set<NodeKind>(["character", "location", "entity"]);

type Section = { key: string; label: string; pages: BinderNode[] };

const css = `${baseCss}
:root { color-scheme: light dark; --fg: #1c1a17; --muted: #6f6a62; --line: #e2ddd3; --bg: #fbfaf7; --card: #fff; --accent: #c2491d; }
@media (prefers-color-scheme: dark) { :root { --fg: #ece8e1; --muted: #a39d93; --line: #35312b; --bg: #171512; --card: #1f1c18; --accent: #f08a5d; } }
* { box-sizing: border-box; }
body { margin: 0; color: var(--fg); background: var(--bg); }
a { color: var(--accent); text-decoration-thickness: 1px; text-underline-offset: 3px; }
.wrap { max-width: 52rem; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
header.site { border-bottom: 1px solid var(--line); margin-bottom: 2rem; padding-bottom: 1rem; }
header.site a { color: inherit; text-decoration: none; font-size: 1.1rem; font-weight: bold; }
header.site p { margin: 0.25rem 0 0; color: var(--muted); font-size: 0.9rem; }
h1 { font-size: 2.2rem; margin: 0 0 0.25rem; }
.kind { color: var(--muted); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.08em; }
.lede { color: var(--muted); font-style: italic; font-size: 1.1rem; }
dl.props { display: grid; grid-template-columns: max-content 1fr; gap: 0.35rem 1rem; padding: 1rem; margin: 1.5rem 0; background: var(--card); border: 1px solid var(--line); border-radius: 8px; font-family: system-ui, sans-serif; font-size: 0.9rem; }
dl.props dt { color: var(--muted); }
dl.props dd { margin: 0; }
ul.list { list-style: none; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr)); gap: 0.5rem; }
ul.list li a { display: block; padding: 0.6rem 0.8rem; background: var(--card); border: 1px solid var(--line); border-radius: 8px; text-decoration: none; color: inherit; }
ul.list li a:hover { border-color: var(--accent); }
ul.list small { display: block; color: var(--muted); font-family: system-ui, sans-serif; margin-top: 0.15rem; }
input.filter { width: 100%; padding: 0.55rem 0.8rem; font: inherit; color: inherit; background: var(--card); border: 1px solid var(--line); border-radius: 8px; margin-bottom: 1rem; }
section.mentions { margin-top: 2.5rem; padding-top: 1rem; border-top: 1px solid var(--line); font-family: system-ui, sans-serif; font-size: 0.9rem; }
footer { margin-top: 3rem; color: var(--muted); font-family: system-ui, sans-serif; font-size: 0.8rem; }
`;

const filterScript = `
const input = document.querySelector("input.filter");
if (input) input.addEventListener("input", () => {
  const q = input.value.trim().toLowerCase();
  for (const item of document.querySelectorAll("ul.list li")) item.hidden = q !== "" && !item.textContent.toLowerCase().includes(q);
  for (const section of document.querySelectorAll("section.group")) section.hidden = !section.querySelector("li:not([hidden])");
});
`;

export async function buildWiki(c: Collected): Promise<{ name: string; data: Uint8Array; pages: number }> {
  const published = c.ordered.filter((n) => wikiKinds.has(n.kind) && c.revealed(n) && c.includes(n));
  const bodies = await c.bodies(published.map((n) => n.id));

  // One file per page; two pages with the same title get a number.
  const files = new Map<string, string>();
  const used = new Set<string>(["index"]);
  for (const n of published) {
    const base = fileSlug(n.title, "page");
    let name = base;
    for (let i = 2; used.has(name); i++) name = `${base}-${i}`;
    used.add(name);
    files.set(n.id, `${name}.html`);
  }

  const images = await packImages(bodies.values(), c.showBlock);

  const typeOf = (n: BinderNode) => (n.kind === "entity" ? c.entityTypes.find((t) => t.id === n.entityTypeId) : undefined);
  const kindLabel = (n: BinderNode) => typeOf(n)?.name ?? nodeKindMeta[n.kind].label;
  const defsOf = (n: BinderNode): Array<Pick<PropertyDef, "key" | "label" | "type">> =>
    n.kind === "entity" ? (typeOf(n)?.schema ?? []) : c.propertyDefs.filter((d) => d.nodeKind === n.kind).sort((a, b) => (a.position < b.position ? -1 : 1));

  const ctx: RenderContext = {
    titleOf: (id) => (files.has(id) ? c.index.byId.get(id)?.title : undefined),
    linkFor: (id) => files.get(id) ?? null,
    showBlock: c.showBlock,
    cite: c.cite,
    // The wiki is meant to be hosted anywhere, so its pictures go in the zip; one on the web that couldn't be fetched stays a link.
    imageSrc: (url) => images.src(url) ?? safeUrl(url),
  };

  /** A property's value as HTML, or null when there's nothing publishable in it. */
  const value = (def: Pick<PropertyDef, "type">, v: PropertyValue | undefined): string | null => {
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length)) return null;
    if (def.type === "checkbox") return v ? "Yes" : "No";
    if (def.type === "node") {
      const links = (Array.isArray(v) ? v : [String(v)]).filter((id) => files.has(id)).map((id) => `<a href="${files.get(id)}">${esc(c.index.byId.get(id)!.title)}</a>`);
      return links.length ? links.join(", ") : null;
    }
    if (def.type === "url") {
      const href = safeUrl(v);
      return href ? `<a href="${esc(href)}">${esc(href)}</a>` : null;
    }
    return esc(Array.isArray(v) ? v.join(", ") : String(v));
  };

  const siteTitle = c.project.title;
  const asOf = c.asOf ? `As of ${c.asOf.title}.` : "";
  const shell = (title: string, body: string, description?: string) => `<!doctype html>
<html lang="${esc(c.project.settings.sourceLocale || "en")}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title === siteTitle ? title : `${title} · ${siteTitle}`)}</title>${description ? `\n<meta name="description" content="${esc(description)}">` : ""}
<link rel="stylesheet" href="style.css">
</head>
<body>
<div class="wrap">
<header class="site"><a href="index.html">${esc(siteTitle)}</a>${c.project.description ? `<p>${esc(c.project.description)}</p>` : ""}</header>
${body}
<footer>${esc(asOf)} Made with <a href="https://plotra.ink/?utm_source=plotra&amp;utm_medium=wiki-export&amp;utm_campaign=made-with-plotra">Plotra</a>.</footer>
</div>
</body>
</html>`;

  const mentions = new Map<string, Set<string>>();
  for (const l of c.links) {
    if (l.source === l.target || !files.has(l.source) || !files.has(l.target)) continue;
    const set = mentions.get(l.target);
    if (set) set.add(l.source);
    else mentions.set(l.target, new Set([l.source]));
  }

  const entries = [...files.entries()].map(([id, file]) => {
    const n = c.index.byId.get(id)!;
    const body = renderBlocks(bodies.get(id) ?? [], ctx);
    const props = defsOf(n)
      .map((def) => ({ label: def.label, html: value(def, n.properties[def.key]) }))
      .filter((p) => p.html !== null);
    const sources = [...(mentions.get(id) ?? [])].map((source) => c.index.byId.get(source)!).sort((a, b) => a.title.localeCompare(b.title));
    const html = shell(
      n.title,
      `<article>
<p class="kind">${esc(kindLabel(n))}${n.aliases.length ? ` · also ${esc(n.aliases.join(", "))}` : ""}</p>
<h1>${esc(n.title)}</h1>
${n.synopsis ? `<p class="lede">${esc(n.synopsis)}</p>` : ""}
${props.length ? `<dl class="props">${props.map((p) => `<dt>${esc(p.label)}</dt><dd>${p.html}</dd>`).join("")}</dl>` : ""}
${body}
${sources.length ? `<section class="mentions"><strong>Mentioned in</strong>: ${sources.map((s) => `<a href="${files.get(s.id)}">${esc(s.title)}</a>`).join(", ")}</section>` : ""}
</article>`,
      n.synopsis ?? plainText(bodies.get(id) ?? [], 160),
    );
    return { path: file, data: html };
  });

  // The front page: every published page, grouped by what it is.
  const sections: Section[] = [
    { key: "character", label: "Characters", pages: published.filter((n) => n.kind === "character") },
    { key: "location", label: "Places", pages: published.filter((n) => n.kind === "location") },
    ...c.entityTypes.map((t) => ({ key: t.id, label: t.plural, pages: published.filter((n) => n.kind === "entity" && n.entityTypeId === t.id) })),
  ].filter((s) => s.pages.length);
  const index = shell(
    siteTitle,
    `<h1>${esc(siteTitle)}</h1>
${published.length > 8 ? `<input class="filter" type="search" placeholder="Find a page…" aria-label="Find a page">` : ""}
${sections
  .map(
    (s) => `<section class="group"><h2>${esc(s.label)}</h2><ul class="list">${[...s.pages]
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((n) => `<li><a href="${files.get(n.id)}">${esc(n.title)}${n.synopsis ? `<small>${esc(n.synopsis.slice(0, 110))}</small>` : ""}</a></li>`)
      .join("")}</ul></section>`,
  )
  .join("\n")}
${published.length === 0 ? "<p>Nothing has been revealed yet.</p>" : ""}
<script>${filterScript}</script>`,
    c.project.description ?? undefined,
  );

  const data = zip([
    { path: "index.html", data: index },
    { path: "style.css", data: css },
    ...entries,
    ...images.files.map((f) => ({ path: f.path, data: f.bytes, store: true })),
  ]);
  return { name: `${fileSlug(siteTitle, "wiki")}-wiki.zip`, data, pages: published.length };
}

/** How many pages the wiki would have with these options, for the Publish view. */
export function countWikiPages(c: Collected) {
  const candidates = c.ordered.filter((n) => wikiKinds.has(n.kind));
  return { total: candidates.length, published: candidates.filter((n) => c.revealed(n) && c.includes(n)).length };
}
