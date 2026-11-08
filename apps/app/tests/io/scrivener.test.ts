import { describe, expect, test } from "bun:test";
import type { DocNode } from "@/lib/doc-index";
import type { ImportOptions } from "@/lib/io/outline";
import { rtfToValue } from "@/lib/io/rtf";
import { parseXml } from "@/lib/io/scrivener";
import { isScrivenerProject, scrivenerKeep } from "@/lib/io/scrivener-files";
import { gzipSync } from "fflate";
import { gunzipCapped, planUpload, type UploadedFile } from "@/lib/io/upload";

// Bringing a Scrivener project in (beat-the-competitors.md, step 3).

const options: ImportOptions = { split: "headings", breaks: false, kind: "scene", lines: "wrap" };
const text = (n: DocNode): string => (typeof n.text === "string" ? n.text : (n.children ?? []).map(text).join(""));
const file = (path: string, body: string): UploadedFile => {
  const parts = path.split("/");
  return { name: parts.at(-1)!, folder: parts.slice(0, -1), bytes: new TextEncoder().encode(body) };
};

// What Scrivener 3 writes for a short scene: a header of tables, then the text.
const rtf = (body: string) =>
  `{\\rtf1\\ansi\\ansicpg1252\\cocoartf2709\n{\\fonttbl\\f0\\fnil\\fcharset0 Palatino-Roman;}\n{\\colortbl;\\red255\\green255\\blue255;}\n{\\*\\expandedcolortbl;;}\n\\pard\\tx360\\fi360\\sl264\\slmult1\\pardirnatural\\partightenfactor0\n\n\\f0\\fs26 \\cf0 ${body}}`;

describe("RTF", () => {
  test("paragraphs and marks come across; fonts and colours don't", () => {
    const value = rtfToValue(rtf("Two households, both {\\i alike} in {\\b dignity},\\\nIn fair Verona.\\par\nWhere {\\ul civil} blood makes {\\strike civil} hands unclean."));
    expect(value.map(text)).toEqual(["Two households, both alike in dignity,", "In fair Verona.", "Where civil blood makes civil hands unclean."]);
    expect(value[0].children).toContainEqual({ text: "alike", italic: true });
    expect(value[0].children).toContainEqual({ text: "dignity", bold: true });
    expect(value[2].children).toContainEqual({ text: "civil", underline: true });
    expect(value[2].children).toContainEqual({ text: "civil", strikethrough: true });
    expect(JSON.stringify(value)).not.toContain("Palatino");
  });

  test("bold switched on and off with \\b and \\b0", () => {
    const [p] = rtfToValue(rtf("A \\b bold\\b0  word\\par"));
    expect(p.children).toEqual([{ text: "A " }, { text: "bold", bold: true }, { text: " word" }]);
  });

  test("Unicode and Windows-1252 escapes, with \\u's fallback dropped", () => {
    const [p] = rtfToValue(rtf("Juliet\\'92s \\u8220?nurse\\u8221? \\emdash  caf\\'e9\\par"));
    expect(text(p)).toBe("Juliet’s “nurse” — café");
  });

  test("a scene-break paragraph is a rule, and empty paragraphs go", () => {
    const value = rtfToValue(rtf("One.\\par\n\\par\n#\\par\nTwo.\\par"));
    expect(value.map((b) => b.type)).toEqual(["p", "hr", "p"]);
  });

  test("starred destinations, footnotes and field instructions are skipped; a field's result is kept", () => {
    const value = rtfToValue(rtf("See {\\*\\Scrv_annot secret} {\\field{\\*\\fldinst HYPERLINK \"https://x\"}{\\fldrslt the page}}{\\footnote a note}.\\par"));
    expect(text(value[0])).toBe("See  the page.");
  });
});

describe("what real Scrivener projects hold", () => {
  // Each of these turned up in sample projects from Scrivener 2 and 3 (digital-preservation/PRONOM_Research).
  const one = (scrivx: string, body: string) =>
    planUpload([file("P.scriv/P.scrivx", scrivx), file("P.scriv/Files/Data/A1/content.rtf", body)], options);
  const draft = (extra = "") =>
    `<ScrivenerProject><Binder><BinderItem UUID="D" Type="DraftFolder"><Title>Draft</Title><Children><BinderItem UUID="A1" Type="Text"><Title>Scene</Title></BinderItem></Children></BinderItem>${extra}</Binder></ScrivenerProject>`;

  test("styles kept as marks in the text lose their marks", async () => {
    const { outline } = await one(draft(), rtf("<$Scr_Ps::0>BBC RADIO<!$Scr_Ps::0>\\par\nCompile ({\\b <$Scr_Cs::2>File{\\i  > }Compile<!$Scr_Cs::2>}).\\par"));
    expect(outline[0].value.map(text)).toEqual(["BBC RADIO", "Compile (File > Compile)."]);
  });

  test("an inline annotation, written as escaped text, goes whole", async () => {
    const body = "skinless\\f1 \\{\\\\Scrv_annot \\\\color=\\{\\\\R=1.0\\} \\\\text=\n\\f0  {\\i really}, keep the skin\n\\f1 \\\\end_Scrv_annot\\}\\f0 , and herbs.\\par";
    const { outline } = await one(draft(), rtf(body));
    expect(outline[0].value.map(text)).toEqual(["skinless, and herbs."]);
  });

  test("table cells are paragraphs of their own", async () => {
    const { outline } = await one(draft(), rtf("\\intbl Your e-mail address\\cell \\intbl Agent\\cell\\row"));
    expect(outline[0].value.map(text)).toEqual(["Your e-mail address", "Agent"]);
  });

  test("the templates folder named in the project's settings is left out, whatever it's called", async () => {
    const scrivx = draft('<BinderItem UUID="T9" Type="Folder"><Title>Templates</Title></BinderItem>').replace("</Binder>", "</Binder><TemplateFolderUUID>T9</TemplateFolderUUID>");
    const { outline } = await one(scrivx, rtf("Text.\\par"));
    expect(outline.map((e) => e.title)).toEqual(["Scene"]);
  });
});

describe("the .scrivx reader", () => {
  test("reads elements, attributes, entities and CDATA", () => {
    const doc = parseXml('<?xml version="1.0"?><!-- c --><A x="1 &amp; 2"><B>R&amp;J &#8217;s</B><C/><D><![CDATA[<raw>]]></D></A>');
    const a = doc.children[0];
    expect(a.attrs.x).toBe("1 & 2");
    expect(a.children.map((c) => c.name)).toEqual(["B", "C", "D"]);
    expect(a.children[0].text).toBe("R&J ’s");
    expect(a.children[2].text).toBe("<raw>");
  });
});

// A small Scrivener 3 project: Draft > Part One > Chapter 1 > two scenes; Characters; Research with a PDF; Trash.
const scrivx3 = `<?xml version="1.0" encoding="UTF-8"?>
<ScrivenerProject Identifier="X" Version="2.0" Creator="SCRMAC-3.3">
  <Binder>
    <BinderItem UUID="D0" Type="DraftFolder"><Title>Manuscript</Title><Children>
      <BinderItem UUID="P1" Type="Folder"><Title>Part One</Title><Children>
        <BinderItem UUID="C1" Type="Folder"><Title>Chapter 1</Title><Children>
          <BinderItem UUID="S1" Type="Text"><Title>The Brawl</Title><Keywords><KeywordID>0</KeywordID></Keywords></BinderItem>
          <BinderItem UUID="S2" Type="Text"><Title>The Feast</Title></BinderItem>
        </Children></BinderItem>
      </Children></BinderItem>
    </Children></BinderItem>
    <BinderItem UUID="R0" Type="ResearchFolder"><Title>Research</Title><Children>
      <BinderItem UUID="R1" Type="PDF"><Title>Verona map</Title></BinderItem>
      <BinderItem UUID="R2" Type="Text"><Title>Fencing notes</Title></BinderItem>
    </Children></BinderItem>
    <BinderItem UUID="K0" Type="Folder"><Title>Characters</Title><Children>
      <BinderItem UUID="K1" Type="Text"><Title>Romeo</Title></BinderItem>
    </Children></BinderItem>
    <BinderItem UUID="L0" Type="Folder"><Title>Places</Title><Children>
      <BinderItem UUID="L1" Type="Text"><Title>Verona</Title></BinderItem>
    </Children></BinderItem>
    <BinderItem UUID="T0" Type="Folder"><Title>Template Sheets</Title></BinderItem>
    <BinderItem UUID="X0" Type="TrashFolder"><Title>Trash</Title><Children>
      <BinderItem UUID="X1" Type="Text"><Title>Cut scene</Title></BinderItem>
    </Children></BinderItem>
  </Binder>
  <Keywords><Keyword ID="0"><Title>Swordplay</Title></Keyword></Keywords>
</ScrivenerProject>`;

const project3 = [
  file("Novel.scriv/Novel.scrivx", scrivx3),
  file("Novel.scriv/Files/Data/S1/content.rtf", rtf("Do you bite your thumb at us, sir?\\par")),
  file("Novel.scriv/Files/Data/S1/synopsis.txt", "Servants of both houses   fight in the square."),
  file("Novel.scriv/Files/Data/S2/content.rtf", rtf("A masked ball.\\par")),
  file("Novel.scriv/Files/Data/R2/content.rtf", rtf("Rapier and dagger.\\par")),
  file("Novel.scriv/Files/Data/K1/content.rtf", rtf("A Montague.\\par")),
  file("Novel.scriv/Files/Data/L1/content.rtf", rtf("Fair.\\par")),
  file("Novel.scriv/Files/Data/X1/content.rtf", rtf("Gone.\\par")),
];

describe("a Scrivener 3 project", () => {
  test("keeps its binder: parts, chapters and scenes; characters and places; research as notes", async () => {
    const { outline, leftOut, format } = await planUpload(project3, options);
    expect(format).toBe("scrivener");
    expect(outline.map((e) => [e.title, e.kind, e.parent === null ? null : outline[e.parent].title])).toEqual([
      ["Part One", "folder", null],
      ["Chapter 1", "chapter", "Part One"],
      ["The Brawl", "scene", "Chapter 1"],
      ["The Feast", "scene", "Chapter 1"],
      ["Research", "folder", null],
      ["Fencing notes", "note", "Research"],
      ["Characters", "folder", null],
      ["Romeo", "character", "Characters"],
      ["Places", "folder", null],
      ["Verona", "location", "Places"],
    ]);
    // The PDF is counted, not imported; the trash and the template sheets are left alone.
    expect(leftOut).toBe(1);
    const brawl = outline.find((e) => e.title === "The Brawl")!;
    expect(brawl.value.map(text)).toEqual(["Do you bite your thumb at us, sir?"]);
    expect(brawl.synopsis).toBe("Servants of both houses fight in the square.");
    expect(brawl.tags).toEqual(["swordplay"]);
  });

  test("a document with documents under it is a chapter with its own text", async () => {
    const scrivx = scrivx3.replace('<BinderItem UUID="S2" Type="Text"><Title>The Feast</Title></BinderItem>', '<BinderItem UUID="S2" Type="Text"><Title>The Feast</Title><Children><BinderItem UUID="S3" Type="Text"><Title>The Dance</Title></BinderItem></Children></BinderItem>');
    const { outline } = await planUpload([file("Novel.scriv/Novel.scrivx", scrivx), ...project3.slice(1)], options);
    const feast = outline.find((e) => e.title === "The Feast")!;
    expect(feast.kind).toBe("chapter");
    expect(feast.value.map(text)).toEqual(["A masked ball."]);
    expect(outline.find((e) => e.title === "The Dance")!.parent).toBe(outline.indexOf(feast));
  });
});

describe("a Scrivener 2 project", () => {
  test("reads Files/Docs/<ID>.rtf and its synopsis", async () => {
    const scrivx = `<?xml version="1.0"?><ScrivenerProject Version="1.0"><Binder>
      <BinderItem ID="0" Type="DraftFolder"><Title>Draft</Title><Children>
        <BinderItem ID="3" Type="Text"><Title>Prologue</Title><Keywords>Chorus; Opening</Keywords></BinderItem>
      </Children></BinderItem></Binder></ScrivenerProject>`;
    const { outline } = await planUpload(
      [file("Old.scriv/project.scrivx", scrivx), file("Old.scriv/Files/Docs/3.rtf", rtf("Two households.\\par")), file("Old.scriv/Files/Docs/3_synopsis.txt", "The chorus sets the scene.")],
      options,
    );
    expect(outline).toHaveLength(1);
    expect(outline[0]).toMatchObject({ title: "Prologue", kind: "scene", synopsis: "The chorus sets the scene.", tags: ["chorus", "opening"] });
    expect(outline[0].value.map(text)).toEqual(["Two households."]);
  });
});

describe("which files are sent", () => {
  test("the binder and the text, not settings, snapshots, backups or research files", () => {
    const paths = [
      "Novel.scriv/Novel.scrivx",
      "Novel.scriv/Files/Data/S1/content.rtf",
      "Novel.scriv/Files/Data/S1/synopsis.txt",
      "Novel.scriv/Files/Data/S1/notes.rtf",
      "Novel.scriv/Files/Data/R1/content.pdf",
      "Novel.scriv/Files/search.indexes",
      "Novel.scriv/Settings/ui-common.xml",
      "Novel.scriv/Snapshots/S1.snapshots/2024.rtf",
      "Old.scriv/Files/Docs/3.rtf",
      "Old.scriv/Files/Docs/3_synopsis.txt",
      "Old.scriv/Files/Docs/3_notes.rtf",
      "Backups/Novel.scrivx",
    ];
    expect(paths.filter(scrivenerKeep)).toEqual([
      "Novel.scriv/Novel.scrivx",
      "Novel.scriv/Files/Data/S1/content.rtf",
      "Novel.scriv/Files/Data/S1/synopsis.txt",
      "Old.scriv/Files/Docs/3.rtf",
      "Old.scriv/Files/Docs/3_synopsis.txt",
    ]);
    expect(isScrivenerProject(["Backups/Novel.scrivx"])).toBe(false);
    expect(isScrivenerProject(paths)).toBe(true);
  });
});

describe("gzipped text, as a Scrivener project is sent", () => {
  test("unpacks to what was packed", () => {
    const original = new TextEncoder().encode(rtf("A masked ball.\\par").repeat(200));
    expect(gunzipCapped(gzipSync(original), 10 * 1024 * 1024)).toEqual(original);
  });

  test("stops at the cap, whatever the gzip holds", () => {
    // 50 MB of zeros packs into about 50 KB.
    const bomb = gzipSync(new Uint8Array(50 * 1024 * 1024));
    expect(bomb.length).toBeLessThan(200_000);
    expect(() => gunzipCapped(bomb, 1024 * 1024)).toThrow("too large");
  });
});
