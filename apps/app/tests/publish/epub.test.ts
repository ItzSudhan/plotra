import { describe, expect, test } from "bun:test";
import { unzipSync } from "fflate";
import type { DocNode } from "@/lib/doc-index";
import type { Collected } from "@/lib/publish/collect";
import { buildEpub } from "@/lib/publish/epub";
import { parseXml } from "@/lib/io/scrivener";
import { indexNodes, type BinderNode } from "@/lib/tree";

// The EPUB is ready for Kindle and other stores (beat-the-competitors.md, step 6):
// landmarks, an NCX, pages marked for what they are. Built here from a stand-in
// for what `collect` gathers, without a database.

const node = (id: string, parentId: string | null, kind: string, title: string, position: string) =>
  ({ id, parentId, kind, title, position, deletedAt: null, settings: {}, tags: [] }) as unknown as BinderNode;
const nodes = [node("c1", null, "chapter", "The Feud", "a"), node("s1", "c1", "scene", "Brawl", "a"), node("c2", null, "chapter", "The Feast", "b"), node("s2", "c2", "scene", "Masks", "a")];
const bodies = new Map<string, DocNode[]>([
  ["s1", [{ type: "p", children: [{ text: "Swords." }] }]],
  ["s2", [{ type: "p", children: [{ text: "A ball." }] }]],
]);
const collected = {
  project: { id: "11111111-1111-1111-1111-111111111111", title: "Verona", description: null, settings: {} },
  author: "W. S.",
  root: null,
  index: indexNodes(nodes),
  ordered: nodes,
  includes: () => true,
  bodies: async (ids: string[]) => new Map(ids.map((id) => [id, bodies.get(id) ?? []])),
  showBlock: () => true,
  cite: () => "",
  references: () => null,
} as unknown as Collected;

describe("the EPUB", () => {
  test("has an NCX, landmarks and marked pages, and every XML file parses", async () => {
    const { data } = await buildEpub(collected);
    const files = unzipSync(data);
    const read = (path: string) => new TextDecoder().decode(files[path]);
    expect(Object.keys(files)).toContain("OEBPS/toc.ncx");
    const opf = read("OEBPS/content.opf");
    expect(opf).toContain('<spine toc="ncx">');
    expect(opf).toContain('href="toc.ncx" media-type="application/x-dtbncx+xml"');
    const nav = read("OEBPS/nav.xhtml");
    expect(nav).toContain('epub:type="landmarks"');
    expect(nav).toContain('epub:type="bodymatter"');
    expect(read("OEBPS/toc.ncx").match(/<navPoint /g)).toHaveLength(2);
    const chapter = Object.keys(files).find((f) => /OEBPS\/c001-/.test(f))!;
    expect(read(chapter)).toContain('epub:type="bodymatter chapter"');
    for (const [path, bytes] of Object.entries(files)) {
      if (!/\.(xhtml|opf|ncx|xml)$/.test(path)) continue;
      // Well formed enough for the parser: one root element after the declaration.
      expect(parseXml(new TextDecoder().decode(bytes)).children.filter((c) => c.name !== "#root").length).toBe(1);
    }
    // No cover was asked for, so none is listed.
    expect(opf).not.toContain("cover-image");
  });
});
