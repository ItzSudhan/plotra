// What this browser keeps and knows about a model it calls itself (plan.md
// 2.11 "Local model"): the key, if the endpoint wants one, and whether a
// browser would let this page call that address at all. Apart from
// lib/agent/browser-model.ts so the settings page can use it without loading
// the AI SDK.

// ---- The key ------------------------------------------------------------------------
//
// It is kept in this browser's localStorage and nowhere else: never sent to
// Plotra, never stored there. It is remembered together with the URL it is
// for, and only ever sent to that URL.

const KEY_STORE = "plotra:ai-browser-key";

/** One spelling per address: the form's text and the saved setting are the same URL written two ways. */
const normal = (url: string) => {
  try {
    return new URL(url.trim()).toString().replace(/\/+$/, "");
  } catch {
    return url.trim().replace(/\/+$/, "");
  }
};
const sameUrl = (a: string, b: string) => normal(a) === normal(b);

/** The key saved in this browser for the model at `baseUrl`, or null. */
export function readBrowserKey(baseUrl: string): string | null {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY_STORE) ?? "null") as { url?: unknown; key?: unknown } | null;
    return saved && typeof saved.url === "string" && typeof saved.key === "string" && saved.key && sameUrl(saved.url, baseUrl) ? saved.key : null;
  } catch {
    return null;
  }
}

/** Remembers the key for the model at `baseUrl` in this browser. An empty key forgets it. */
export function writeBrowserKey(baseUrl: string, key: string | null): void {
  try {
    if (key?.trim()) localStorage.setItem(KEY_STORE, JSON.stringify({ url: baseUrl.trim(), key: key.trim() }));
    else localStorage.removeItem(KEY_STORE);
  } catch {
    // Private browsing with storage off: the key lasts as long as the form does.
  }
}

// ---- Whether the page may call it ----------------------------------------------------

/**
 * Why a browser would refuse to call this address from this page, if it
 * would: a page served over https may not call plain http, except on the
 * machine itself.
 */
export function blockedFromPage(baseUrl: string, pageProtocol: string): string | null {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const thisMachine = host === "localhost" || host.endsWith(".localhost") || host === "::1" || /^127\./.test(host);
  if (pageProtocol !== "https:" || url.protocol !== "http:" || thisMachine) return null;
  return "Browsers don't let a page served over https call an http address on your network. Use a model on this machine (localhost), or put https in front of that one.";
}
