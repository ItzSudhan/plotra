import { describe, expect, test } from "bun:test";
import { checkImageLink } from "@/lib/image-link";

// A link pasted into the image picker (components/views/image-picker.tsx).
describe("checkImageLink", () => {
  test("takes web links", () => {
    expect(checkImageLink("  https://example.com/a.png ")).toEqual({ url: "https://example.com/a.png" });
    expect(checkImageLink("http://example.com/b.jpg")).toEqual({ url: "http://example.com/b.jpg" });
  });
  test("explains what's wrong with anything else", () => {
    expect(checkImageLink("")).toHaveProperty("error");
    expect(checkImageLink("cat.png")).toHaveProperty("error");
    expect(checkImageLink("javascript:alert(1)")).toHaveProperty("error");
    expect(checkImageLink("data:image/png;base64,AAAA")).toHaveProperty("error");
    expect(checkImageLink(`https://example.com/${"a".repeat(2100)}`)).toHaveProperty("error");
  });
});
