import { expect, test } from "bun:test";
import { outlineToOpml } from "@/lib/io/opml";

// The binder as an outline for Scrivener and other outliners (lib/io/opml.ts).

test("an outline nests as the binder does, with synopses as notes, escaped", () => {
  const opml = outlineToOpml("Verona & Mantua", [
    { title: "Act 1", synopsis: null, kind: "folder", children: [{ title: "The <brawl>", synopsis: 'Swords "drawn".\nThe prince', kind: "scene", children: [] }] },
    { title: "", synopsis: "  ", kind: "note", children: [] },
  ]);
  expect(opml).toStartWith('<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">');
  expect(opml).toContain("<title>Verona &amp; Mantua</title>");
  expect(opml).toContain('<outline text="Act 1" type="folder">\n      <outline text="The &lt;brawl&gt;" _note="Swords &quot;drawn&quot;.&#10;The prince" type="scene"/>\n    </outline>');
  expect(opml).toContain('<outline text="Untitled" type="note"/>');
});
