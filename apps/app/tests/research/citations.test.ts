import { describe, expect, test } from "bun:test";
import {
  bibtexEntry,
  bibtexKey,
  bibtexKeys,
  formatAuthorsField,
  formatInText,
  formatReference,
  initials,
  parseAuthors,
  parseDate,
  type Run,
  runsToHtml,
  runsToMarkdown,
  runsToText,
  type Source,
  yearSuffixes,
} from "@/lib/citations";

// Citations and BibTeX (lib/citations.ts), for the Research module: APA 7,
// MLA 9 and Chicago 17 author-date.

const source = (fields: Partial<Source> & Pick<Source, "id" | "title" | "type">): Source => ({
  authors: [],
  container: "",
  publisher: "",
  date: null,
  volume: "",
  issue: "",
  pages: "",
  url: "",
  accessed: null,
  doi: "",
  isbn: "",
  ...fields,
});

const book = source({
  id: "rivers",
  title: "Rivers of the delta",
  type: "book",
  authors: parseAuthors("Okafor, Ngozi Adaeze"),
  publisher: "Lagos University Press",
  date: { year: 2019 },
});

const article = source({
  id: "tides",
  title: "Tidal memory in coastal towns",
  type: "article",
  authors: parseAuthors("Lee, Min-jun; García Márquez, Ana; Smith, John Ronald Reuel"),
  container: "Journal of Coastal Studies",
  date: { year: 2021 },
  volume: "12",
  issue: "3",
  pages: "44-61",
  doi: "10.1234/jcs.2021.003",
});

const website = source({
  id: "drowning",
  title: "Drowning",
  type: "website",
  authors: parseAuthors("World Health Organization"),
  container: "WHO",
  url: "https://www.who.int/news-room/fact-sheets/detail/drowning",
  accessed: { year: 2024, month: 7, day: 25 },
});

// A second book by Okafor in 2019; it files under "Season", after "Rivers".
const salt = source({ ...book, id: "salt", title: "A season of salt" });

/** References with italics shown as *…*, so a test can see them. */
const shown = (runs: Run[]) => runs.map((r) => (r.italic ? `*${r.text}*` : r.text)).join("");

describe("reading dates", () => {
  test("as precise as written", () => {
    expect(parseDate("2019")).toEqual({ year: 2019 });
    expect(parseDate("2019-03")).toEqual({ year: 2019, month: 3 });
    expect(parseDate("2019-03-04")).toEqual({ year: 2019, month: 3, day: 4 });
    expect(parseDate("2019-03-04T10:00:00Z")).toEqual({ year: 2019, month: 3, day: 4 });
    expect(parseDate("March 4, 2019")).toEqual({ year: 2019, month: 3, day: 4 });
    expect(parseDate("4 March 2019")).toEqual({ year: 2019, month: 3, day: 4 });
    expect(parseDate("Sept. 2019")).toEqual({ year: 2019, month: 9 });
  });

  test("what isn't a plain date is kept as written", () => {
    expect(parseDate("forthcoming")).toEqual({ label: "forthcoming" });
    expect(parseDate("c. 1850")).toEqual({ year: 1850, label: "c. 1850" });
    expect(parseDate("  ")).toBeNull();
  });

  test("a month or day out of range is dropped", () => {
    expect(parseDate("2019-13")).toEqual({ year: 2019 });
    expect(parseDate("2019-02-45")).toEqual({ year: 2019, month: 2 });
  });
});

describe("reading authors", () => {
  test("Last, First; Last, First", () => {
    expect(parseAuthors("Okafor, Ngozi; Lee, Min-jun")).toEqual([
      { family: "Okafor", given: "Ngozi" },
      { family: "Lee", given: "Min-jun" },
    ]);
  });

  test("First Last, joined by and or &", () => {
    expect(parseAuthors("Ngozi Okafor and Min-jun Lee & Ana Ruiz")).toEqual([
      { family: "Okafor", given: "Ngozi" },
      { family: "Lee", given: "Min-jun" },
      { family: "Ruiz", given: "Ana" },
    ]);
  });

  test("particles belong to the family name", () => {
    expect(parseAuthors("Ludwig van Beethoven")).toEqual([{ family: "van Beethoven", given: "Ludwig" }]);
  });

  test("organisations, single names and braces are printed as written", () => {
    expect(parseAuthors("World Health Organization")).toEqual([{ family: "World Health Organization", given: "", literal: true }]);
    expect(parseAuthors("Plato")).toEqual([{ family: "Plato", given: "", literal: true }]);
    expect(parseAuthors("{Smith, Jones & Co}")).toEqual([{ family: "Smith, Jones & Co", given: "", literal: true }]);
    expect(parseAuthors("")).toEqual([]);
  });

  test("formatAuthorsField is the reverse", () => {
    for (const field of ["Okafor, Ngozi; Lee, Min-jun", "World Health Organization", "{Smith, Jones & Co}; Plato"]) {
      expect(formatAuthorsField(parseAuthors(field))).toBe(field);
    }
  });

  test("initials", () => {
    expect(initials("Ngozi Adaeze")).toBe("N. A.");
    expect(initials("Jean-Paul")).toBe("J.-P.");
    expect(initials("J.R.R.")).toBe("J. R. R.");
    expect(initials("JRR")).toBe("J. R. R.");
    expect(initials("élodie")).toBe("É.");
    expect(initials("")).toBe("");
  });
});

describe("APA", () => {
  test("a book with one author", () => {
    expect(shown(formatReference(book, "apa"))).toBe("Okafor, N. A. (2019). *Rivers of the delta*. Lagos University Press.");
  });

  test("an article with three authors", () => {
    expect(shown(formatReference(article, "apa"))).toBe(
      "Lee, M.-J., García Márquez, A., & Smith, J. R. R. (2021). Tidal memory in coastal towns. *Journal of Coastal Studies*, *12*(3), 44–61. https://doi.org/10.1234/jcs.2021.003",
    );
  });

  test("a website with no date", () => {
    expect(shown(formatReference(website, "apa"))).toBe(
      "World Health Organization. (n.d.). *Drowning*. WHO. https://www.who.int/news-room/fact-sheets/detail/drowning",
    );
  });

  test("two works by one author in one year", () => {
    const suffixes = yearSuffixes([book, salt, article]);
    // In title order, skipping "A": Rivers, then Season.
    expect(suffixes.get("rivers")).toBe("a");
    expect(suffixes.get("salt")).toBe("b");
    expect(suffixes.has("tides")).toBe(false);
    expect(runsToText(formatReference(book, "apa", { suffix: "a" }))).toStartWith("Okafor, N. A. (2019a).");
    expect(runsToText(formatInText(salt, "apa", { suffix: "b" }))).toBe("(Okafor, 2019b)");
  });

  test("in the text", () => {
    expect(runsToText(formatInText(book, "apa", { locator: "44" }))).toBe("(Okafor, 2019, p. 44)");
    expect(runsToText(formatInText(book, "apa", { locator: "pp. 44-46" }))).toBe("(Okafor, 2019, pp. 44–46)");
    expect(runsToText(formatInText(article, "apa"))).toBe("(Lee et al., 2021)");
    expect(runsToText(formatInText(website, "apa"))).toBe("(World Health Organization, n.d.)");
    expect(runsToText(formatInText(source({ ...book, authors: parseAuthors("Okafor, Ngozi; Lee, Min-jun") }), "apa"))).toBe("(Okafor & Lee, 2019)");
  });
});

describe("MLA", () => {
  test("a book with one author", () => {
    expect(shown(formatReference(book, "mla"))).toBe("Okafor, Ngozi Adaeze. *Rivers of the delta*. Lagos University Press, 2019.");
  });

  test("an article with three authors", () => {
    expect(shown(formatReference(article, "mla"))).toBe(
      "Lee, Min-jun, et al. “Tidal memory in coastal towns.” *Journal of Coastal Studies*, vol. 12, no. 3, 2021, pp. 44–61, https://doi.org/10.1234/jcs.2021.003.",
    );
  });

  test("a website with no date", () => {
    expect(shown(formatReference(website, "mla"))).toBe(
      "World Health Organization. “Drowning.” *WHO*, https://www.who.int/news-room/fact-sheets/detail/drowning. Accessed 25 July 2024.",
    );
  });

  test("in the text: no year", () => {
    expect(runsToText(formatInText(book, "mla", { locator: "44" }))).toBe("(Okafor 44)");
    expect(runsToText(formatInText(article, "mla", { locator: "50-52" }))).toBe("(Lee et al. 50–52)");
    expect(runsToText(formatInText(book, "mla", { locator: "chap. 3" }))).toBe("(Okafor, chap. 3)");
    expect(runsToText(formatInText(website, "mla"))).toBe("(World Health Organization)");
  });
});

describe("Chicago author-date", () => {
  test("a book with one author", () => {
    expect(shown(formatReference(book, "chicago"))).toBe("Okafor, Ngozi Adaeze. 2019. *Rivers of the delta*. Lagos University Press.");
  });

  test("an article with three authors", () => {
    expect(shown(formatReference(article, "chicago"))).toBe(
      "Lee, Min-jun, Ana García Márquez, and John Ronald Reuel Smith. 2021. “Tidal memory in coastal towns.” *Journal of Coastal Studies* 12 (3): 44–61. https://doi.org/10.1234/jcs.2021.003.",
    );
  });

  test("a website with no date", () => {
    expect(shown(formatReference(website, "chicago"))).toBe(
      "World Health Organization. n.d. “Drowning.” WHO. Accessed July 25, 2024. https://www.who.int/news-room/fact-sheets/detail/drowning.",
    );
  });

  test("in the text", () => {
    expect(runsToText(formatInText(book, "chicago", { locator: "44" }))).toBe("(Okafor 2019, 44)");
    expect(runsToText(formatInText(article, "chicago"))).toBe("(Lee, García Márquez, and Smith 2021)");
    expect(runsToText(formatInText(salt, "chicago", { suffix: "a" }))).toBe("(Okafor 2019a)");
  });

  test("a work with no author is cited by its title", () => {
    const anonymous = source({ id: "beowulf", title: "Beowulf: A New Verse Translation for Readers", type: "book", date: { year: 2000 } });
    expect(shown(formatInText(anonymous, "chicago"))).toBe("(*Beowulf: A New Verse* 2000)");
  });
});

describe("BibTeX", () => {
  test("keys: first author, year, first telling word of the title", () => {
    expect(bibtexKey(book)).toBe("okafor2019rivers");
    expect(bibtexKey(salt)).toBe("okafor2019season");
    expect(bibtexKey(article)).toBe("lee2021tidal");
    expect(bibtexKey(website)).toBe("worlddrowning");
    expect(bibtexKey(source({ id: "x", title: "", type: "other" }))).toBe("source");
  });

  test("keys in a set are unique", () => {
    const again = source({ ...book, id: "rivers-2", title: "Rivers, again" });
    const keys = bibtexKeys([book, again, salt, article]);
    expect(new Set(keys.values()).size).toBe(4);
    expect([keys.get("rivers"), keys.get("rivers-2")].sort()).toEqual(["okafor2019rivers", "okafor2019riversb"]);
  });

  test("an article entry", () => {
    expect(bibtexEntry(article)).toBe(
      [
        "@article{lee2021tidal,",
        "  author  = {Lee, Min-jun and García Márquez, Ana and Smith, John Ronald Reuel},",
        "  title   = {Tidal memory in coastal towns},",
        "  journal = {Journal of Coastal Studies},",
        "  year    = {2021},",
        "  volume  = {12},",
        "  number  = {3},",
        "  pages   = {44--61},",
        "  doi     = {10.1234/jcs.2021.003}",
        "}",
      ].join("\n"),
    );
  });

  test("an organisation stays one name and special characters are escaped", () => {
    const entry = bibtexEntry(source({ ...website, title: "Drowning: 50% & rising_fast" }), "who");
    expect(entry).toStartWith("@misc{who,\n");
    expect(entry).toContain("author       = {{World Health Organization}}");
    expect(entry).toContain("title        = {Drowning: 50\\% \\& rising\\_fast}");
    expect(entry).toContain("howpublished = {WHO}");
    expect(entry).toContain("urldate      = {2024-07-25}");
    expect(entry).not.toContain("year");
  });
});

describe("rendering runs", () => {
  const runs: Run[] = [
    { text: "Okafor <b>& \"Lee\"</b>. " },
    { text: "Rivers *of* the delta", italic: true },
    { text: ". " },
    { text: "https://example.com/?a=1&b=2", href: "https://example.com/?a=1&b=2" },
  ];

  test("as text", () => {
    expect(runsToText(runs)).toBe('Okafor <b>& "Lee"</b>. Rivers *of* the delta. https://example.com/?a=1&b=2');
  });

  test("as HTML, escaped", () => {
    expect(runsToHtml(runs)).toBe(
      'Okafor &lt;b&gt;&amp; &quot;Lee&quot;&lt;/b&gt;. <i>Rivers *of* the delta</i>. <a href="https://example.com/?a=1&amp;b=2">https://example.com/?a=1&amp;b=2</a>',
    );
  });

  test("HTML links only to web addresses", () => {
    expect(runsToHtml([{ text: "click", href: "javascript:alert(1)" }])).toBe("click");
  });

  test("as Markdown, escaped, with emphasis that doesn't start or end with a space", () => {
    expect(runsToMarkdown(runs)).toBe("Okafor \\<b\\>& \"Lee\"\\</b\\>. *Rivers \\*of\\* the delta*. <https://example.com/?a=1&b=2>");
    expect(runsToMarkdown([{ text: " Rivers ", italic: true }])).toBe(" *Rivers* ");
    expect(runsToMarkdown([{ text: "  ", italic: true }])).toBe("  ");
  });
});
