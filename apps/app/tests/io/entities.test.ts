import { expect, test } from "bun:test";
import { decodeEntity, markdownToValue } from "@/lib/io/markdown";

// Named and numeric HTML entities in Markdown and Word import (decodeEntity in lib/io/markdown.ts).

test("typographic names", () => {
  const cases: Record<string, string> = { lsquo: "‘", rsquo: "’", sbquo: "‚", ldquo: "“", rdquo: "”", bdquo: "„", laquo: "«", raquo: "»", lsaquo: "‹", rsaquo: "›", bull: "•", middot: "·", copy: "©", reg: "®", trade: "™", deg: "°", times: "×", divide: "÷", sect: "§", para: "¶", shy: "­", thinsp: " ", ensp: " ", emsp: " ", hellip: "…", mdash: "—", nbsp: " " };
  for (const [name, char] of Object.entries(cases)) expect(decodeEntity(`&${name};`)).toBe(char);
});

test("Latin-1 accented letters, case-sensitive", () => {
  const cases: Record<string, string> = { eacute: "é", Eacute: "É", egrave: "è", ecirc: "ê", auml: "ä", Auml: "Ä", ouml: "ö", Ouml: "Ö", uuml: "ü", Uuml: "Ü", szlig: "ß", ntilde: "ñ", Ntilde: "Ñ", ccedil: "ç", Ccedil: "Ç", Agrave: "À", yuml: "ÿ", iexcl: "¡", aring: "å", AElig: "Æ", thorn: "þ", THORN: "Þ" };
  for (const [name, char] of Object.entries(cases)) expect(decodeEntity(`&${name};`)).toBe(char);
  expect(decodeEntity("&EACUTE;")).toBeNull();
});

test("numeric entities still work; unknown names are left alone", () => {
  expect(decodeEntity("&#233;")).toBe("é");
  expect(decodeEntity("&#x2019;")).toBe("’");
  expect(decodeEntity("&notathing;")).toBeNull();
  expect(decodeEntity("&constructor;")).toBeNull();
  expect(decodeEntity("&toString;")).toBeNull();
});

test("Markdown reads named entities as the characters they name", () => {
  expect(markdownToValue("It&rsquo;s a caf&eacute; &notathing;")).toEqual([{ type: "p", children: [{ text: "It’s a café &notathing;" }] }]);
});
