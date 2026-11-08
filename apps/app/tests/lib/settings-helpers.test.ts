import { describe, expect, test } from "bun:test";
import { colourName, deliveryText, languageName, languageOption, parseLanguage, statusIn } from "@/components/workspace/settings-helpers";

describe("language picker words", () => {
  test("codes are shown by name, and unknown ones as themselves", () => {
    expect(languageName("fr")).toBe("French");
    expect(languageOption("fr")).toBe("French (fr)");
    expect(languageName("pt-BR")).toContain("Portuguese");
    expect(languageOption("zz-not-a-thing!")).toBe("zz-not-a-thing!");
  });

  test("a picked option, a name or a code all give the code", () => {
    expect(parseLanguage("French (fr)")).toBe("fr");
    expect(parseLanguage("japanese")).toBe("ja");
    expect(parseLanguage("pt-br")).toBe("pt-BR");
    expect(parseLanguage("de")).toBe("de");
  });

  test("anything else isn't a language", () => {
    expect(parseLanguage("")).toBeNull();
    expect(parseLanguage("Klingon please")).toBeNull();
    expect(parseLanguage("12")).toBeNull();
  });
});

describe("settings colours and deliveries", () => {
  test("palette colours have names", () => {
    expect(colourName("#C2255C")).toBe("Rose");
    expect(colourName("#123456")).toBe("Custom colour");
  });

  test("delivery results are said in words", () => {
    expect(deliveryText(200, null)).toBe("Delivered.");
    expect(deliveryText(404, "The receiver answered 404.")).toBe("The other service didn't accept it: page not found (404).");
    expect(deliveryText(null, "No answer within 10 seconds.")).toBe("The other service didn't answer within 10 seconds.");
    expect(deliveryText(null, "getaddrinfo ENOTFOUND")).toBe("Couldn't reach the other service. Check the address.");
    expect(deliveryText(301, null)).toContain("Check the address");
    expect(statusIn("The receiver answered 503.")).toBe(503);
    expect(statusIn(null)).toBeNull();
  });
});
