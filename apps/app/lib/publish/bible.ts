import "server-only";
import type { PropertyValue } from "@plotra/db/schema";
import type { PropertyDef } from "../knowledge-actions";
import { formatMeta, typeFormat } from "../modules";
import { projectTypeMeta } from "../project-types";
import type { BinderNode } from "../tree";
import { releaseKindMeta } from "../world";
import type { Collected } from "./collect";
import { baseCss, esc, fileSlug, renderBlocks, safeUrl, type RenderContext } from "./html";
import { packImages } from "./images";
import { scriptCss } from "./script-css";

// The series bible / pitch document (plan.md 2.8 "Publishing outputs"): one
// printable page with the logline, the story as an outline, the cast, the
// world and the release plan. Saved as HTML; the browser prints it to PDF.

const css = `${baseCss}
${scriptCss}
@page { size: letter; margin: 1in; }
body { max-width: 46rem; margin: 2rem auto; padding: 0 1.25rem; color: #1c1a17; }
.cover { min-height: 70vh; display: flex; flex-direction: column; justify-content: center; text-align: center; page-break-after: always; }
.cover h1 { font-size: 3rem; margin: 0; }
.cover .logline { font-size: 1.2rem; font-style: italic; margin: 1.5rem auto; max-width: 34rem; }
.cover .meta { color: #6f6a62; font-family: system-ui, sans-serif; font-size: 0.9rem; }
h2 { font-size: 1.7rem; border-bottom: 2px solid #1c1a17; padding-bottom: 0.2rem; margin-top: 2.5rem; page-break-after: avoid; }
h3 { font-size: 1.2rem; margin: 1.5rem 0 0.2rem; page-break-after: avoid; }
.facts { color: #6f6a62; font-family: system-ui, sans-serif; font-size: 0.85rem; margin: 0 0 0.4rem; }
.synopsis { font-style: italic; }
.entry { page-break-inside: avoid; }
ol.outline { padding-left: 1.2rem; }
ol.outline li { margin: 0.4rem 0; }
table.plan { width: 100%; font-family: system-ui, sans-serif; font-size: 0.9rem; }
@media print { body { margin: 0; max-width: none; } h2 { page-break-before: always; } }
`;

export async function buildBible(c: Collected): Promise<{ name: string; data: string }> {
  const live = c.ordered.filter((n) => c.includes(n));
  const characters = live.filter((n) => n.kind === "character");
  const locations = live.filter((n) => n.kind === "location");
  const entities = live.filter((n) => n.kind === "entity");
  const bodies = await c.bodies([...characters, ...locations, ...entities].map((n) => n.id));

  // The bible is one file, so pictures attached in the app go inside it; a picture on the web stays a link if it can't be fetched.
  const images = await packImages(bodies.values(), c.showBlock);
  const packed = new Map(images.files.map((f) => [f.path, `data:${f.contentType};base64,${Buffer.from(f.bytes).toString("base64")}`]));
  const imageSrc = (url: unknown) => {
    const path = images.src(url);
    return path ? (packed.get(path) ?? null) : safeUrl(url);
  };
  const ctx: RenderContext = { titleOf: (id) => c.index.byId.get(id)?.title, showBlock: c.showBlock, cite: c.cite, imageSrc };
  const typeOf = (n: BinderNode) => c.entityTypes.find((t) => t.id === n.entityTypeId);
  const defsOf = (n: BinderNode): Array<Pick<PropertyDef, "key" | "label" | "type">> =>
    n.kind === "entity" ? (typeOf(n)?.schema ?? []) : c.propertyDefs.filter((d) => d.nodeKind === n.kind).sort((a, b) => (a.position < b.position ? -1 : 1));

  const text = (def: Pick<PropertyDef, "type">, v: PropertyValue | undefined): string | null => {
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length)) return null;
    if (def.type === "checkbox") return v ? "yes" : null;
    if (def.type === "node") {
      const titles = (Array.isArray(v) ? v : [String(v)]).map((id) => c.index.byId.get(id)?.title).filter(Boolean);
      return titles.length ? titles.join(", ") : null;
    }
    return Array.isArray(v) ? v.join(", ") : String(v);
  };

  const entry = (n: BinderNode) => {
    const facts = defsOf(n)
      .map((def) => ({ label: def.label, value: text(def, n.properties[def.key]) }))
      .filter((f) => f.value)
      .map((f) => `${esc(f.label)}: ${esc(f.value!)}`);
    const body = bodies.get(n.id) ?? [];
    return `<div class="entry">
<h3>${esc(n.title)}${n.aliases.length ? ` <small>(${esc(n.aliases.join(", "))})</small>` : ""}</h3>
${facts.length ? `<p class="facts">${facts.join(" · ")}</p>` : ""}
${n.synopsis ? `<p class="synopsis">${esc(n.synopsis)}</p>` : ""}
${renderBlocks(body, ctx)}
</div>`;
  };

  // Leads first: protagonists, then antagonists, then everyone else by name.
  const roleRank = (n: BinderNode) => {
    const role = String(n.properties.role ?? "").toLowerCase();
    return role.startsWith("protag") ? 0 : role.startsWith("antag") ? 1 : role.startsWith("support") ? 2 : 3;
  };
  characters.sort((a, b) => roleRank(a) - roleRank(b) || a.title.localeCompare(b.title));

  // The story as an outline: parts and chapters with their synopses, scenes one level down.
  const outline = (parentId: string | null, depth: number): string => {
    const children = (c.index.children.get(parentId) ?? []).filter((n) => !n.deletedAt && c.includes(n) && ["folder", "chapter", "scene"].includes(n.kind));
    if (!children.length || depth > 2) return "";
    return `<ol class="outline">${children
      .map((n) => `<li><strong>${esc(n.title)}</strong>${n.synopsis ? `: ${esc(n.synopsis)}` : ""}${outline(n.id, depth + 1)}</li>`)
      .join("")}</ol>`;
  };
  const story = outline(c.root?.id ?? null, 0);
  const words = live.filter((n) => ["chapter", "scene"].includes(n.kind)).reduce((sum, n) => sum + n.wordCount, 0);
  const format = c.project.settings.format ?? typeFormat[c.project.type];

  const sections = [
    story && `<h2>The story</h2>${story}`,
    c.story.threads.length > 0 && `<h2>Plot threads</h2><ul>${c.story.threads.map((t) => `<li>${esc(t.name)}</li>`).join("")}</ul>`,
    characters.length > 0 && `<h2>Characters</h2>${characters.map(entry).join("\n")}`,
    locations.length > 0 && `<h2>Places</h2>${locations.map(entry).join("\n")}`,
    ...c.entityTypes.map((t) => {
      const list = entities.filter((n) => n.entityTypeId === t.id);
      return list.length > 0 && `<h2>${esc(t.plural)}</h2>${list.map(entry).join("\n")}`;
    }),
    c.releases.length > 0 &&
      `<h2>Release plan</h2><table class="plan"><tr><th>Release</th><th>Kind</th><th>Date</th><th>Notes</th></tr>${c.releases
        .map((r) => `<tr><td>${esc(r.title)}</td><td>${esc(releaseKindMeta[r.kind].label)}</td><td>${esc(r.date ?? "—")}</td><td>${esc(r.notes ?? "")}</td></tr>`)
        .join("")}</table>`,
  ].filter(Boolean);
  const references = c.references();
  if (references) sections.push(`<h2>${esc(references.heading)}</h2>${references.html}`);

  const title = c.project.title;
  const html = `<!doctype html>
<html lang="${esc(c.project.settings.sourceLocale || "en")}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}: series bible</title>
<style>${css}</style>
</head>
<body>
<section class="cover">
<h1>${esc(title)}</h1>
${c.project.description ? `<p class="logline">${esc(c.project.description)}</p>` : ""}
<p class="meta">${esc(projectTypeMeta[c.project.type].label)} · ${esc(formatMeta[format].label)}${words ? ` · ${words.toLocaleString("en")} words so far` : ""}</p>
<p class="meta">${esc(c.author)} · ${new Date().toLocaleDateString("en", { year: "numeric", month: "long", day: "numeric" })}${c.asOf ? ` · as of ${esc(c.asOf.title)}` : ""}</p>
</section>
${sections.join("\n")}
${sections.length === 0 ? "<p>Nothing to show yet: add characters, places and chapters.</p>" : ""}
</body>
</html>`;
  return { name: `${fileSlug(title, "project")}-bible.html`, data: html };
}
