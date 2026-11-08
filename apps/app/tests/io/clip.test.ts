import { describe, expect, test } from "bun:test";
import { extractPage } from "@/lib/clip";

// Web clipping keeps the pictures of an article as image blocks that point at
// the page's own copies, made absolute, and leaves out what isn't a picture.

const page = (body: string) => `<!doctype html><html><head><title>The Bell Foundry</title></head><body><article>
<p>${"The foundry stood at the edge of the town, and its fires were never let out. ".repeat(8)}</p>
${body}
<p>${"Every bell was cast in sand, and every mould was broken to free it. ".repeat(8)}</p>
</article></body></html>`;

const images = (html: string) => extractPage(html, "https://example.org/history/foundry").blocks.filter((b) => b.type === "img");

describe("clipping pictures", () => {
  test("a picture in a figure is kept, made absolute, with its alt text", () => {
    const found = images(page(`<figure><img src="/img/mould.jpg" alt="A broken mould" width="800"><figcaption>The mould, after casting.</figcaption></figure>`));
    expect(found).toEqual([{ type: "img", url: "https://example.org/img/mould.jpg", alt: "A broken mould", children: [{ text: "" }] }]);
  });

  test("a lazy-loaded picture uses its real address", () => {
    expect(images(page(`<img src="data:image/gif;base64,R0lGOD" data-src="https://cdn.example.org/bell.png">`))[0]?.url).toBe("https://cdn.example.org/bell.png");
  });

  test("inline data, tracking pixels and other schemes are left out", () => {
    expect(images(page(`<img src="data:image/png;base64,AAAA"><img src="https://t.example.org/p.gif" width="1" height="1"><img src="javascript:alert(1)">`))).toEqual([]);
  });

  test("the text is still there around the picture", () => {
    const blocks = extractPage(page(`<img src="https://example.org/a.png">`), "https://example.org/x").blocks;
    expect(blocks.map((b) => b.type)).toEqual(["p", "img", "p"]);
  });
});
