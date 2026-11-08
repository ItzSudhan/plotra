import "server-only";
import { frontPages, frontPageTitle } from "../io/front-matter";
import type { BinderNode } from "../tree";
import type { Collected } from "./collect";
import { baseCss, esc, fileSlug, renderBlocks, type RenderContext } from "./html";
import { loadAttachedImage, packImages } from "./images";
import { scriptCss } from "./script-css";
import { zip } from "./zip";

// EPUB 3 (plan.md 2.8 "Publishing outputs"). The manuscript is the binder's
// folders, chapters and scenes in order: a folder at the top is a part, a
// chapter starts a new file, and scenes run on inside it with a break between
// them. Built entirely here: no service, no dependency.
//
// Ready for Kindle (Send to Kindle, and Kindle Direct Publishing's EPUB
// upload) and other stores (beat-the-competitors.md step 6): an optional
// cover picture, landmarks (cover, contents, where the text starts), an NCX
// contents file for older readers, and every page marked for what it is.

/** Kinds that make up the manuscript; a chosen root may bring other documents with it. */
const manuscriptKinds = new Set<BinderNode["kind"]>(["folder", "chapter", "scene"]);

type Chapter = { file: string; title: string; html: string[]; part: boolean };

const page = (title: string, lang: string, body: string) => `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${esc(lang)}" xml:lang="${esc(lang)}">
<head><meta charset="utf-8"/><title>${esc(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
${body}
</body>
</html>`;

const css = `${baseCss}
body { margin: 5%; }
h1 { text-align: center; margin: 30% 0 1em; font-size: 1.8em; }
h2.chapter { text-align: center; margin: 15% 0 2em; font-size: 1.4em; page-break-before: always; }
p { margin: 0; text-indent: 1.4em; }
h2 + p, h3 + p, h4 + p, .break + p, p.first { text-indent: 0; }
p.break { text-align: center; text-indent: 0; margin: 1.2em 0; }
p.byline { text-align: center; text-indent: 0; }
p.copyright { text-indent: 0; font-size: 0.8em; margin: 0 0 1em; }
p.dedication, p.epigraph { text-align: center; text-indent: 0; font-style: italic; margin: 0 0 1em; }
section.dedication, section.epigraph { margin-top: 30%; }
p.source { text-align: center; text-indent: 0; }
p.figure { text-indent: 0; text-align: center; }
p.reference { text-indent: -1.4em; margin: 0 0 0.6em 1.4em; }
.cover { text-align: center; margin: 0; padding: 0; }
.cover img { max-width: 100%; max-height: 100%; }
${scriptCss}
`;

export async function buildEpub(c: Collected, options: { coverFileId?: string | null } = {}): Promise<{ name: string; data: Uint8Array }> {
  const lang = c.project.settings.sourceLocale || "en";
  const title = c.root?.title ?? c.project.title;
  const nodes = c.ordered.filter((n) => (manuscriptKinds.has(n.kind) || (c.root && n.kind !== "canvas" && n.kind !== "timeline" && n.kind !== "dialogue")) && c.includes(n));
  const bodies = await c.bodies(nodes.map((n) => n.id));
  const rootDepth = c.root ? depthOf(c, c.root.id) + 1 : 0;
  // Pictures travel inside the book: a reader may be offline, and can't sign in to the app.
  const images = await packImages(bodies.values(), c.showBlock);

  const ctx: RenderContext = {
    titleOf: (id) => c.index.byId.get(id)?.title,
    showBlock: c.showBlock,
    cite: c.cite,
    imageSrc: images.src,
  };

  const chapters: Chapter[] = [];
  let current: Chapter | undefined;
  let lastWasScene = false;
  const start = (n: BinderNode, part: boolean) => {
    const chapter: Chapter = { file: `c${String(chapters.length + 1).padStart(3, "0")}-${fileSlug(n.title, "chapter")}.xhtml`, title: n.title, html: [], part };
    chapters.push(chapter);
    lastWasScene = false;
    return chapter;
  };

  for (const n of nodes) {
    if (n.id === c.root?.id && n.kind === "folder") continue;
    const body = renderBlocks(bodies.get(n.id) ?? [], ctx);
    const depth = depthOf(c, n.id) - rootDepth;
    if (n.kind === "folder" || n.kind === "chapter") {
      current = start(n, n.kind === "folder");
      current.html.push(n.kind === "folder" ? `<h1>${esc(n.title)}</h1>` : `<h2 class="chapter">${esc(n.title)}</h2>`);
      if (body) current.html.push(body);
      continue;
    }
    // A scene that isn't inside a chapter is its own chapter, under its own title.
    if (!current || depth === 0) {
      current = start(n, false);
      current.html.push(`<h2 class="chapter">${esc(n.title)}</h2>`);
    } else if (lastWasScene && body) {
      current.html.push(`<p class="break">* * *</p>`);
    }
    if (body) {
      current.html.push(body);
      lastWasScene = true;
    }
  }

  // Whatever the text cites gets a reference list at the back.
  const references = c.references();
  if (references) {
    chapters.push({ file: "references.xhtml", title: references.heading, html: [`<h2 class="chapter">${esc(references.heading)}</h2>`, references.html], part: false });
  }

  // Chapters with no text are left out, and so is a part that ends up with nothing under it.
  const written = chapters.filter((ch) => ch.part || ch.html.length > 1);
  const files = written.filter((ch, i) => !ch.part || ch.html.length > 1 || (written[i + 1] !== undefined && !written[i + 1].part));
  if (files.length === 0) throw new Error("There's nothing to export here yet: no chapters or scenes with text.");

  // A cover picture attached in the project, if one was chosen and can be read.
  const coverImage = options.coverFileId ? await loadAttachedImage(options.coverFileId) : null;
  const coverExt = coverImage ? ({ "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" } as Record<string, string>)[coverImage.contentType] : undefined;
  const cover = coverImage && coverExt ? { ...coverImage, path: `images/cover.${coverExt}` } : null;

  const id = `urn:uuid:${c.project.id}`;
  const modified = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const titlePage = page(title, lang, `<section epub:type="titlepage"><h1>${esc(title)}</h1>\n<p class="byline">${esc(c.author)}</p></section>`);
  // The project's copyright page, dedication and epigraph, each a page of its own after the title page.
  const front = frontPages(c.project.settings.frontMatter).map((p) => {
    const lines = (text: string) => text.split("\n").map(esc).join("<br/>");
    const body =
      p.role === "copyright"
        ? p.paragraphs.map((text) => `<p class="copyright">${lines(text)}</p>`).join("\n")
        : `${p.paragraphs.map((text) => `<p class="${p.role}">${lines(text)}</p>`).join("\n")}${p.source ? `\n<p class="source">— ${esc(p.source)}</p>` : ""}`;
    const type = p.role === "copyright" ? "copyright-page" : p.role;
    return { file: `${p.role}.xhtml`, title: frontPageTitle[p.role], data: page(frontPageTitle[p.role], lang, `<section epub:type="frontmatter ${type}" class="${p.role}">\n${body}\n</section>`) };
  });
  const coverPage = cover
    ? page("Cover", lang, `<section epub:type="cover" class="cover"><img src="${cover.path}" alt="${esc(title)}"/></section>`)
    : null;
  const nav = page(
    "Contents",
    lang,
    `<nav epub:type="toc" id="toc"><h2>Contents</h2><ol>${files.map((f) => `<li><a href="${f.file}">${esc(f.title)}</a></li>`).join("")}</ol></nav>
<nav epub:type="landmarks" id="landmarks" hidden="hidden"><ol>${cover ? `<li><a epub:type="cover" href="cover.xhtml">Cover</a></li>` : ""}<li><a epub:type="toc" href="nav.xhtml">Contents</a></li><li><a epub:type="bodymatter" href="${files[0].file}">Start</a></li></ol></nav>`,
  );
  // The NCX: the contents for readers from before EPUB 3, which some stores still check for.
  const ncx = `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="${esc(lang)}">
  <head><meta name="dtb:uid" content="${esc(id)}"/><meta name="dtb:depth" content="1"/><meta name="dtb:totalPageCount" content="0"/><meta name="dtb:maxPageNumber" content="0"/></head>
  <docTitle><text>${esc(title)}</text></docTitle>
  <navMap>
${files.map((f, i) => `    <navPoint id="np${i + 1}" playOrder="${i + 1}"><navLabel><text>${esc(f.title)}</text></navLabel><content src="${f.file}"/></navPoint>`).join("\n")}
  </navMap>
</ncx>`;
  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="${esc(lang)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">${esc(id)}</dc:identifier>
    <dc:title>${esc(title)}</dc:title>
    <dc:language>${esc(lang)}</dc:language>
    <dc:creator>${esc(c.author)}</dc:creator>${c.project.description ? `\n    <dc:description>${esc(c.project.description)}</dc:description>` : ""}
    <meta property="dcterms:modified">${modified}</meta>${cover ? `\n    <meta name="cover" content="cover-image"/>` : ""}
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="css" href="style.css" media-type="text/css"/>
    <item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>${front.map((f) => `\n    <item id="front-${f.file.replace(".xhtml", "")}" href="${f.file}" media-type="application/xhtml+xml"/>`).join("")}${
      cover
        ? `\n    <item id="cover-image" href="${cover.path}" media-type="${cover.contentType}" properties="cover-image"/>\n    <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>`
        : ""
    }
${files.map((f, i) => `    <item id="c${i + 1}" href="${f.file}" media-type="application/xhtml+xml"/>`).join("\n")}
${images.files.map((f, i) => `    <item id="img${i + 1}" href="${f.path}" media-type="${f.contentType}"/>`).join("\n")}
  </manifest>
  <spine toc="ncx">${cover ? `\n    <itemref idref="cover" linear="yes"/>` : ""}
    <itemref idref="title"/>${front.map((f) => `\n    <itemref idref="front-${f.file.replace(".xhtml", "")}"/>`).join("")}
    <itemref idref="nav"/>
${files.map((_, i) => `    <itemref idref="c${i + 1}"/>`).join("\n")}
  </spine>
</package>`;

  const data = zip([
    // The mimetype comes first and uncompressed: that's how readers recognise an EPUB.
    { path: "mimetype", data: "application/epub+zip", store: true },
    {
      path: "META-INF/container.xml",
      data: `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`,
    },
    { path: "OEBPS/content.opf", data: opf },
    { path: "OEBPS/nav.xhtml", data: nav },
    { path: "OEBPS/toc.ncx", data: ncx },
    ...(cover && coverPage ? [{ path: "OEBPS/cover.xhtml", data: coverPage }, { path: `OEBPS/${cover.path}`, data: cover.bytes, store: true }] : []),
    { path: "OEBPS/style.css", data: css },
    { path: "OEBPS/title.xhtml", data: titlePage },
    ...front.map((f) => ({ path: `OEBPS/${f.file}`, data: f.data })),
    // Each chapter is marked as part of the book's body (or the back matter, for the references).
    ...files.map((f) => ({
      path: `OEBPS/${f.file}`,
      data: page(f.title, lang, `<section epub:type="${f.file === "references.xhtml" ? "backmatter bibliography" : f.part ? "bodymatter part" : "bodymatter chapter"}">\n${f.html.join("\n")}\n</section>`),
    })),
    // Pictures are compressed already.
    ...images.files.map((f) => ({ path: `OEBPS/${f.path}`, data: f.bytes, store: true })),
  ]);
  return { name: `${fileSlug(title, "book")}.epub`, data };
}

function depthOf(c: Collected, id: string) {
  let depth = 0;
  for (let n = c.index.byId.get(id); n?.parentId; n = c.index.byId.get(n.parentId)) depth++;
  return depth;
}
