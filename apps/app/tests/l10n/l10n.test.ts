import { describe, expect, test } from "bun:test";
import { documentUnits, glossaryHits, hashText, parseCsv, parseCsvCells, parseXliff, subtitleTime, textDirection, toCsv, toSrt, toVtt, toXliff, type ExchangeRow, type Term } from "@/lib/l10n";

// The localization module's pure parts: the units a document is cut into, the
// glossary check, and the files that go to a translator and come back.

const row = (over: Partial<ExchangeRow> = {}): ExchangeRow => ({ key: "str:menu.start", source: "Start game", target: "", status: "draft", context: "", ...over });

describe("CSV", () => {
  test("starts with a byte-order mark, uses CRLF, and quotes what needs it", () => {
    const csv = toCsv([row({ source: 'He said "no", then left;\nfor good', target: "Il a dit « non »" })]);
    expect(csv.startsWith("﻿key,source,target,status,context\r\n")).toBe(true);
    expect(csv).toContain('"He said ""no"", then left;\nfor good"');
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  test("round-trips quotes, separators, line breaks and accents", () => {
    const rows = [
      row({ key: "a1:b1", source: "x", target: 'Line one\r\nline "two", with; separators\tand tabs' }),
      row({ key: "str:k", target: "Éàü — ünïcødé 漢字 🙂", status: "approved" }),
    ];
    expect(parseCsv(toCsv(rows))).toEqual([
      { key: "a1:b1", target: 'Line one\r\nline "two", with; separators\tand tabs', status: "draft" },
      { key: "str:k", target: "Éàü — ünïcødé 漢字 🙂", status: "approved" },
    ]);
  });

  test("cells that look like formulas are defused, and restored on import", () => {
    const csv = toCsv([row({ source: "=HYPERLINK(1)", target: "- Bonjour" }), row({ key: "str:b", target: "+33 1 23", source: "@home" })]);
    expect(csv).toContain("'=HYPERLINK(1)");
    expect(csv).toContain("'- Bonjour");
    expect(csv).toContain("'@home");
    expect(parseCsv(csv).map((r) => r.target)).toEqual(["- Bonjour", "+33 1 23"]);
  });

  test("an apostrophe the translator typed is kept", () => {
    expect(parseCsv("key,target\nstr:a,'tis true\n")[0].target).toBe("'tis true");
  });

  test("reads semicolon and tab files, reordered columns and LF or CR line ends", () => {
    expect(parseCsv("target;KEY;status\r\nBonjour;str:hi;Reviewed\r\n")).toEqual([{ key: "str:hi", target: "Bonjour", status: "reviewed" }]);
    expect(parseCsv("key\ttarget\nstr:a\tA\nstr:b\tB")).toEqual([
      { key: "str:a", target: "A" },
      { key: "str:b", target: "B" },
    ]);
    expect(parseCsvCells("a,b\rc,d\r")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  test("skips blank lines and rows without a key; needs key and target columns", () => {
    expect(parseCsv("key,target\n\n,orphan\nstr:a,A\n\n")).toEqual([{ key: "str:a", target: "A" }]);
    expect(() => parseCsv("id,translation\nx,y")).toThrow("key");
    expect(parseCsv("")).toEqual([]);
  });
});

describe("XLIFF", () => {
  const file = toXliff({
    original: "the-gate-strings-fr",
    sourceLocale: "en",
    targetLocale: "fr",
    rows: [
      row({ target: "Commencer", status: "translated", context: "Main menu" }),
      row({ key: "n1:b1", source: 'Tom & Jerry <say> "hi"', target: "Tom & Jerry <disent> « salut »", status: "approved" }),
      row({ key: "n1:b2", source: "Bell\u0007 rings\nagain", target: "", status: "draft" }),
    ],
  });

  test("is XLIFF 1.2 with languages, escaped text and states", () => {
    expect(file).toContain('<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">');
    expect(file).toContain('source-language="en" target-language="fr"');
    expect(file).toContain("<source>Tom &amp; Jerry &lt;say&gt; &quot;hi&quot;</source>");
    expect(file).toContain('<target state="final">');
    expect(file).toContain('<target state="needs-translation"></target>');
    expect(file).toContain("<note>Main menu</note>");
    // A control character would make the file unreadable XML.
    expect(file).not.toContain("\u0007");
    expect(file).toContain("<source>Bell rings\nagain</source>");
  });

  test("round-trips text, ids and statuses", () => {
    expect(parseXliff(file)).toEqual([
      { key: "str:menu.start", target: "Commencer", status: "translated" },
      { key: "n1:b1", target: "Tom & Jerry <disent> « salut »", status: "approved" },
      { key: "n1:b2", target: "", status: "draft" },
    ]);
  });

  test("reads what tools write: single quotes, CDATA, inline tags, comments, alt-trans, groups", () => {
    const tool = `<?xml version='1.0'?><xliff version='1.2'><file><body><group id='g'>
      <trans-unit id='str:a' resname='x'><source>A</source><alt-trans><target>Wrong</target></alt-trans><target state='signed-off'>Un <g id="1">gras</g><x id="2"/> &#233;t&#xE9;<!-- note --></target></trans-unit>
      <trans-unit xml:id="ignored" id="str:b"><source>B</source><target state="needs-review-l10n"><![CDATA[<b> & </b>]]></target></trans-unit>
      <trans-unit id="str:c"><source>C</source></trans-unit>
      <trans-unit id="str:d"><source>D</source><target state="custom">Dé</target></trans-unit>
    </group></body></file></xliff>`;
    expect(parseXliff(tool)).toEqual([
      { key: "str:a", target: "Un gras été", status: "approved" },
      { key: "str:b", target: "<b> & </b>", status: "reviewed" },
      { key: "str:d", target: "Dé" },
    ]);
  });

  test("reads XLIFF 2.0, joining segments, at the state of the least finished one", () => {
    const v2 = `<xliff xmlns="urn:oasis:names:tc:xliff:document:2.0" version="2.0" srcLang="en" trgLang="fr"><file id="f">
      <unit id="str:a"><segment state="final"><source>One.</source><target>Un.</target></segment><ignorable><source> </source></ignorable><segment state="translated"><source>Two.</source><target>Deux.</target></segment></unit>
      <unit id="str:b"><segment><source>Untouched</source></segment></unit>
      <unit id="str:c"><segment state="reviewed"><source>C</source><target>Cé &amp; co</target></segment></unit>
    </file></xliff>`;
    expect(parseXliff(v2)).toEqual([
      { key: "str:a", target: "Un. Deux.", status: "translated" },
      { key: "str:c", target: "Cé & co", status: "reviewed" },
    ]);
  });
});

describe("subtitles", () => {
  test("times are hh:mm:ss,mmm for SRT and hh:mm:ss.mmm for WebVTT", () => {
    expect(subtitleTime(1)).toBe("00:00:01,000");
    expect(subtitleTime(3723.456, ".")).toBe("01:02:03.456");
  });

  test("SRT cues are numbered, wrapped at 42 characters, two lines a cue, and never overlap", () => {
    const long = "This is a rather long speech that will certainly need more than two lines of subtitles to fit on the screen";
    const srt = toSrt([{ text: "Hello." }, { text: "   " }, { text: long }]);
    const blocks = srt.trimEnd().split("\n\n");
    expect(blocks[0]).toBe("1\n00:00:01,000 --> 00:00:02,200\nHello.");
    expect(blocks.length).toBe(3);
    for (const block of blocks) {
      const [, , ...lines] = block.split("\n");
      expect(lines.length).toBeLessThanOrEqual(2);
      for (const line of lines) expect(line.length).toBeLessThanOrEqual(42);
    }
    const times = blocks.map((b) => b.split("\n")[1].split(" --> "));
    for (let i = 1; i < times.length; i++) expect(times[i][0] > times[i - 1][1]).toBe(true);
    expect(srt.endsWith("\n")).toBe(true);
  });

  test("cue length follows reading speed, at least 1.2 seconds", () => {
    const sixteen = Array.from({ length: 16 }, () => "word").join(" ");
    expect(toSrt([{ text: sixteen }]).split("\n")[1]).toBe("00:00:01,000 --> 00:00:07,800");
    expect(toSrt([{ text: "Hi." }]).split("\n")[1]).toBe("00:00:01,000 --> 00:00:02,200");
  });

  test("WebVTT has its header, dotted times and escaped cue text", () => {
    const vtt = toVtt([{ text: "Tom & Jerry <run> --> away" }]);
    expect(vtt).toBe("WEBVTT\n\n00:00:01.000 --> 00:00:03.800\nTom &amp; Jerry &lt;run&gt; --&gt; away\n");
  });
});

describe("glossary", () => {
  const term = (over: Partial<Term>): Term => ({ id: crypto.randomUUID(), term: "Greywater", locale: null, translation: null, rule: "translate", note: null, ...over });

  test("finds whole words in any case, and flags a translation without the expected form", () => {
    const terms = [term({ locale: "fr", translation: "Eaugrise" }), term({ term: "Grey", rule: "keep" })];
    expect(glossaryHits("They reached greywater.", "", terms, "fr")).toEqual([{ term: "Greywater", expected: "Eaugrise", rule: "translate", note: null, missing: false }]);
    expect(glossaryHits("Greywater!", "Ils ont atteint Greywater.", terms, "fr")[0].missing).toBe(true);
    expect(glossaryHits("Greywater!", "Les Eaugrises.", terms, "FR")[0].missing).toBe(false);
    expect(glossaryHits("Greywater", "x", terms, "de")).toEqual([]);
  });

  test("a term for the language wins over the same term for every language", () => {
    const terms = [term({ rule: "keep" }), term({ term: "greywater", locale: "fr", translation: "Eaugrise" })];
    const hits = glossaryHits("Greywater", "", terms, "fr");
    expect(hits).toHaveLength(1);
    expect(hits[0].expected).toBe("Eaugrise");
    expect(glossaryHits("Greywater", "", terms, "de")[0].rule).toBe("keep");
  });

  test("terms with regex characters are matched literally", () => {
    expect(glossaryHits("Ask Dr. (Who)?", "", [term({ term: "Dr. (Who)?", rule: "keep" })], "fr")).toHaveLength(1);
  });
});

describe("units and direction", () => {
  test("blocks with text and an id become units; dialogue keeps its speaker", () => {
    const units = documentUnits("n1", "Scene", [
      { type: "character", id: "c", children: [{ text: "MARA (V.O.)" }] },
      { type: "dialogue", id: "d", children: [{ text: " Run. " }] },
      { type: "p", id: "e", children: [{ text: "" }] },
      { type: "p", children: [{ text: "No id" }] },
    ]);
    expect(units.map((u) => [u.key, u.source, u.speaker])).toEqual([
      ["n1:c", "MARA (V.O.)", undefined],
      ["n1:d", "Run.", "MARA"],
    ]);
  });

  test("a note link reads as its alias, or the linked note's title", () => {
    const titles = new Map([["juliet", "Juliet Capulet"]]);
    const units = documentUnits(
      "n1",
      "Scene",
      [
        {
          type: "p",
          id: "a",
          children: [
            { text: "Then " },
            { type: "wikilink", nodeId: "juliet", alias: "Juliet", children: [{ text: "" }] },
            { text: " met " },
            { type: "wikilink", nodeId: "juliet", children: [{ text: "" }] },
            { text: " and " },
            { type: "wikilink", nodeId: "gone", children: [{ text: "" }] },
            { text: "." },
          ],
        },
      ],
      (id) => titles.get(id),
    );
    expect(units[0].source).toBe("Then Juliet met Juliet Capulet and .");
  });

  test("the hash changes with the text", () => {
    expect(hashText("a")).not.toBe(hashText("b"));
    expect(hashText("same")).toBe(hashText("same"));
  });

  test("right-to-left languages and scripts", () => {
    expect(textDirection("ar")).toBe("rtl");
    expect(textDirection("he-IL")).toBe("rtl");
    expect(textDirection("fa")).toBe("rtl");
    expect(textDirection("ku-Latn")).toBe("ltr");
    expect(textDirection("pa-Arab")).toBe("rtl");
    expect(textDirection("pt-BR")).toBe("ltr");
  });
});
