// Small pure helpers for project settings: language names, colour names and
// webhook delivery results said in words.

/** Languages most projects are written or translated in, offered first in the picker. */
export const commonLanguages = [
  "en",
  "en-GB",
  "en-US",
  "fr",
  "de",
  "es",
  "es-419",
  "it",
  "pt",
  "pt-BR",
  "nl",
  "sv",
  "da",
  "nb",
  "fi",
  "pl",
  "cs",
  "hu",
  "ro",
  "el",
  "tr",
  "uk",
  "ru",
  "ar",
  "he",
  "fa",
  "hi",
  "bn",
  "id",
  "ms",
  "th",
  "vi",
  "zh-Hans",
  "zh-Hant",
  "ja",
  "ko",
  "ca",
  "ga",
  "cy",
] as const;

let names: Intl.DisplayNames | null | undefined;

/** "French", "Portuguese (Brazil)"; the code itself when the browser doesn't know it. */
export function languageName(code: string): string {
  if (names === undefined) {
    try {
      names = new Intl.DisplayNames(["en"], { type: "language" });
    } catch {
      names = null;
    }
  }
  try {
    const name = names?.of(code);
    return name && name !== code ? name : code;
  } catch {
    return code;
  }
}

/** How a language reads in the picker's list: "French (fr)". */
export const languageOption = (code: string) => {
  const name = languageName(code);
  return name === code ? code : `${name} (${code})`;
};

/** A well-formed language code in its usual spelling ("pt-br" → "pt-BR"), or null. */
function canonical(code: string): string | null {
  if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(code)) return null;
  try {
    return Intl.getCanonicalLocales(code)[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * The code for what someone typed or picked: "French (fr)", "french", "fr" and
 * "pt-br" all work. Null when it isn't a language.
 */
export function parseLanguage(text: string): string | null {
  const typed = text.trim();
  if (!typed) return null;
  const picked = /\(([^()]+)\)\s*$/.exec(typed);
  if (picked) return canonical(picked[1].trim());
  const byName = commonLanguages.find((code) => languageName(code).toLowerCase() === typed.toLowerCase());
  if (byName) return byName;
  return canonical(typed);
}

const colourNames: Record<string, string> = {
  "#e2602a": "Orange",
  "#b98021": "Ochre",
  "#2b8a3e": "Green",
  "#109a82": "Teal",
  "#1971c2": "Blue",
  "#5f3dc4": "Indigo",
  "#7048e8": "Violet",
  "#9c36b5": "Purple",
  "#c2255c": "Rose",
  "#868e96": "Grey",
};

/** A palette colour's name, for screen readers and tooltips. */
export const colourName = (hex: string) => colourNames[hex.toLowerCase()] ?? "Custom colour";

const statusWords: Record<number, string> = {
  400: "it didn't understand the message",
  401: "it wants a password or key",
  403: "it refused",
  404: "page not found",
  405: "that address doesn't take messages",
  408: "it took too long",
  410: "that address is gone",
  413: "the message was too large for it",
  429: "it's getting too many messages",
  500: "it had a problem of its own",
  502: "it's down or unreachable",
  503: "it's down for now",
  504: "it took too long",
};

/** What happened to a webhook delivery, in words: "The other service didn't accept it: page not found (404)." */
export function deliveryText(status: number | null, error: string | null): string {
  if (status !== null && status >= 200 && status < 300) return "Delivered.";
  if (status !== null && status >= 300 && status < 400) return `The other service sent it somewhere else, which Plotra doesn't follow (${status}). Check the address.`;
  if (status !== null) {
    const words = statusWords[status] ?? (status >= 500 ? "it had a problem of its own" : "it refused");
    return `The other service didn't accept it: ${words} (${status}).`;
  }
  if (error && /10 seconds|timed? ?out/i.test(error)) return "The other service didn't answer within 10 seconds.";
  return "Couldn't reach the other service. Check the address.";
}

/** The receiver's status from a stored error like "The receiver answered 404.", when it has one. */
export function statusIn(error: string | null): number | null {
  const found = error ? /answered (\d{3})/.exec(error) : null;
  return found ? Number(found[1]) : null;
}
