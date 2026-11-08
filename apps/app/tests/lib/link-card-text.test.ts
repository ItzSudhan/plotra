import { describe, expect, test } from "bun:test";
import { excerpt, plainText } from "@/lib/public-link";

// The text on a read-only link's cards (lib/public-card.ts): what's written,
// as plain lines, and its opening cut at a word.

describe("plainText", () => {
  test("one line per block, links and lists included, pictures left out", () => {
    const value = [
      { type: "h1", children: [{ text: "The Feast" }] },
      { type: "p", children: [{ text: "Romeo meets " }, { type: "a", url: "/p/x/n/y", children: [{ text: "Juliet" }] }, { text: "." }] },
      { type: "img", url: "/p/x/f/z", children: [{ text: "" }] },
      { type: "ul", children: [{ type: "li", children: [{ text: "masks" }] }, { type: "li", children: [{ text: "  a   dance " }] }] },
      { type: "p", children: [{ text: "" }] },
    ];
    expect(plainText(value)).toBe("The Feast\nRomeo meets Juliet.\nmasks\na dance");
  });
});

describe("excerpt", () => {
  test("short text is kept whole", () => {
    expect(excerpt("Two households,\nboth alike.")).toBe("Two households, both alike.");
  });

  test("long text is cut at a word, without trailing punctuation", () => {
    const cut = excerpt("Nobody on the harbour wall saw the water rise, and nobody rang the bell.", 40);
    expect(cut).toBe("Nobody on the harbour wall saw the water…");
    expect(cut.length).toBeLessThanOrEqual(41);
  });
});
