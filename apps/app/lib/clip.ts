import "server-only";
import type { LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import zlib from "node:zlib";
import { formatAuthorsField, parseAuthors, parseDate, type Author } from "./citations";
import type { DocNode } from "./doc-index";

// Web clipping (plan.md 2.8 "Clip web pages into research notes"): fetch a
// page the writer points at and keep its readable text, its pictures (as links
// to where they are on the web) and bibliographic details. The server makes the request, so a URL is only followed when it
// leads to the public web: see `assertPublicUrl` and `isPrivateAddress`.

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 10_000;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_BLOCKS = 600;
const MAX_TEXT = 120_000;
const MAX_BLOCK_TEXT = 8_000;
const MAX_TAG = 4_096;
const MAX_IMAGES = 40;

/** An error whose message is safe to show the writer. */
export class ClipError extends Error {}

// ---- Which addresses may be fetched ---------------------------------------------------

function parseIPv4(text: string): number[] | null {
  const parts = text.split(".");
  if (parts.length !== 4) return null;
  const bytes = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  return bytes.every((b) => b >= 0 && b <= 255) ? bytes : null;
}

/** The 16 bytes of an IPv6 address, or null when it isn't one. */
function parseIPv6(input: string): number[] | null {
  // Scoped addresses (fe80::1%eth0) are never public.
  if (!/^[0-9a-f:.]+$/i.test(input)) return null;
  let text = input;
  // A dotted quad may stand in for the last 32 bits (::ffff:10.0.0.1): rewrite it as two groups.
  if (text.includes(".")) {
    const colon = text.lastIndexOf(":");
    const v4 = parseIPv4(text.slice(colon + 1));
    if (colon < 0 || !v4) return null;
    text = `${text.slice(0, colon + 1)}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const groups = (part: string) => (part === "" ? [] : part.split(":"));
  const left = groups(halves[0]);
  const right = halves.length === 2 ? groups(halves[1]) : [];
  if ([...left, ...right].some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) return null;
  const missing = 8 - left.length - right.length;
  // "::" stands for at least one group of zeros; without it all eight must be there.
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  return [...left, ...Array<string>(missing).fill("0"), ...right].flatMap((g) => {
    const n = parseInt(g, 16);
    return [n >> 8, n & 0xff];
  });
}

function privateIPv4([a, b, c]: number[]) {
  return (
    a === 0 || // "this network"
    a === 10 || // private
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    a === 127 || // loopback
    (a === 169 && b === 254) || // link-local, cloud metadata (169.254.169.254)
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 0 && c === 0) || // IETF protocol assignments
    (a === 192 && b === 0 && c === 2) || // documentation
    (a === 192 && b === 88 && c === 99) || // 6to4 relays
    (a === 192 && b === 168) || // private
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    (a === 198 && b === 51 && c === 100) || // documentation
    (a === 203 && b === 0 && c === 113) || // documentation
    a >= 224 // multicast, reserved, broadcast
  );
}

function privateIPv6(bytes: number[]) {
  const zero = (from: number, to: number) => bytes.slice(from, to).every((b) => b === 0);
  const v4 = bytes.slice(12);
  // ::, ::1 and the deprecated IPv4-compatible ::a.b.c.d.
  if (zero(0, 12)) return true;
  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-translated (::ffff:0:a.b.c.d): judge the IPv4 address inside.
  if (zero(0, 10) && bytes[10] === 0xff && bytes[11] === 0xff) return privateIPv4(v4);
  if (zero(0, 8) && bytes[8] === 0xff && bytes[9] === 0xff && bytes[10] === 0 && bytes[11] === 0) return privateIPv4(v4);
  // NAT64 (64:ff9b::/96) reaches the IPv4 address inside; its local-use range (64:ff9b:1::/48) is private.
  if (bytes[0] === 0 && bytes[1] === 0x64 && bytes[2] === 0xff && bytes[3] === 0x9b) return zero(4, 12) ? privateIPv4(v4) : true;
  // 6to4 (2002::/16) tunnels to the IPv4 address in the next 32 bits.
  if (bytes[0] === 0x20 && bytes[1] === 0x02) return privateIPv4(bytes.slice(2, 6));
  // 2001::/23 holds Teredo and other protocol assignments; 2001:db8::/32 is documentation.
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && (bytes[2] < 0x02 || (bytes[2] === 0x0d && bytes[3] === 0xb8))) return true;
  // Discard-only (100::/64).
  if (bytes[0] === 0x01 && bytes[1] === 0 && zero(2, 8)) return true;
  // Unique local (fc00::/7), link-local (fe80::/10), site-local (fec0::/10), multicast (ff00::/8).
  if ((bytes[0] & 0xfe) === 0xfc || (bytes[0] === 0xfe && (bytes[1] & 0x80) === 0x80) || bytes[0] === 0xff) return true;
  // Only global unicast (2000::/3) is public.
  return (bytes[0] & 0xe0) !== 0x20;
}

/**
 * True for any address a clip must not reach: loopback, private networks,
 * link-local (cloud metadata), carrier-grade NAT, multicast, reserved ranges,
 * and IPv6 forms that wrap such an IPv4 address. Anything unparseable counts
 * as private.
 */
export function isPrivateAddress(address: string): boolean {
  const text = address.trim().replace(/^\[|\]$/g, "");
  const v4 = parseIPv4(text);
  if (v4) return privateIPv4(v4);
  const v6 = parseIPv6(text);
  return v6 ? privateIPv6(v6) : true;
}

const refused = () => new ClipError("That address isn't on the public web, so it can't be clipped.");

/**
 * Parses a URL and refuses everything but plain http(s) to a public host on
 * the default port. The host's addresses are checked separately, once resolved.
 */
export function assertPublicUrl(raw: string, base?: URL): URL {
  let url: URL;
  try {
    url = new URL(raw.trim(), base);
  } catch {
    throw new ClipError("That doesn't look like a web address.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new ClipError("Only http and https pages can be clipped.");
  if (url.username || url.password) throw new ClipError("Addresses with a username or password can't be clipped.");
  if (url.port) throw new ClipError("Only pages on the standard web ports can be clipped.");
  // WHATWG URLs normalise odd IPv4 spellings (0x7f.1, 2130706433) to dotted quads, so one check covers them.
  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (!host) throw refused();
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw refused();
    return url;
  }
  // Names that only resolve inside a network.
  if (!host.includes(".") || /(^|\.)(localhost|local|localdomain|internal|intranet|lan|home|corp|test|example|invalid|onion)$/.test(host)) {
    throw refused();
  }
  return url;
}

/** Resolves a host and returns its addresses, refusing unless every one of them is public. */
async function resolvePublic(url: URL): Promise<LookupAddress[]> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const family = net.isIP(host);
  if (family) return [{ address: host, family }];
  let addresses: LookupAddress[];
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new ClipError("That site couldn't be found.");
  }
  // One private address among several is enough to refuse: the connection could pick it.
  if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) throw refused();
  return addresses;
}

// ---- Fetching ------------------------------------------------------------------------

type Fetched = { url: URL; contentType: string; charset: string; body: Buffer; truncated: boolean };

function requestOnce(url: URL, addresses: LookupAddress[], signal: AbortSignal, accept: string): Promise<http.IncomingMessage> {
  // The connection uses exactly the addresses that were checked: resolving the
  // name a second time could give a different answer (DNS rebinding).
  const pinned: net.LookupFunction = (_hostname, options, callback) => {
    if (typeof options === "object" && options.all) callback(null, addresses);
    else callback(null, addresses[0].address, addresses[0].family);
  };
  return new Promise((resolve, reject) => {
    const req = (url.protocol === "https:" ? https : http).request(
      url,
      {
        method: "GET",
        agent: false,
        lookup: pinned,
        signal,
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; PlotraClipper/1.0)",
          accept,
          "accept-language": "en",
          "accept-encoding": "gzip, deflate, br",
        },
      },
      resolve,
    );
    req.on("error", reject);
    req.end();
  });
}

function decoded(res: http.IncomingMessage): NodeJS.ReadableStream {
  const encoding = String(res.headers["content-encoding"] ?? "").toLowerCase().trim();
  const through = encoding === "gzip" || encoding === "x-gzip" ? zlib.createGunzip() : encoding === "deflate" ? zlib.createInflate() : encoding === "br" ? zlib.createBrotliDecompress() : null;
  if (!through) return res;
  res.on("error", (error) => through.destroy(error));
  return res.pipe(through);
}

/** Reads at most `max` bytes of the (decompressed) body, then hangs up. */
function readCapped(res: http.IncomingMessage, max: number): Promise<{ body: Buffer; truncated: boolean }> {
  return new Promise((resolve, reject) => {
    const stream = decoded(res);
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    const finish = (truncated: boolean) => {
      if (done) return;
      done = true;
      res.destroy();
      resolve({ body: Buffer.concat(chunks, Math.min(size, max)), truncated });
    };
    stream.on("data", (chunk: Buffer) => {
      if (done) return;
      chunks.push(chunk);
      size += chunk.length;
      if (size >= max) finish(true);
    });
    stream.on("end", () => finish(false));
    // A body cut off mid-stream (or a truncated gzip) still has readable text in what arrived.
    stream.on("error", (error) => (size > 0 ? finish(true) : done ? undefined : reject(error)));
  });
}

type Wanted = { accept: string; types: string[]; maxBytes: number; wrongType: string };

/** Follows a public URL to a 2xx answer of one of the wanted types: every hop of a redirect re-checked, ten seconds in all. */
async function fetchPublic(raw: string, wanted: Wanted): Promise<Fetched> {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let url = assertPublicUrl(raw);
  try {
    for (let hop = 0; ; hop++) {
      const res = await requestOnce(url, await resolvePublic(url), signal, wanted.accept);
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.destroy();
        if (hop >= MAX_REDIRECTS) throw new ClipError("That link redirects too many times.");
        url = assertPublicUrl(res.headers.location, url);
        continue;
      }
      if (status < 200 || status >= 300) {
        res.destroy();
        throw new ClipError(status === 401 || status === 403 ? "That page needs a sign-in, so it can't be clipped." : `That page couldn't be loaded (the site answered ${status}).`);
      }
      const header = String(res.headers["content-type"] ?? "").toLowerCase();
      const contentType = header.split(";")[0].trim();
      if (!wanted.types.includes(contentType)) {
        res.destroy();
        throw new ClipError(wanted.wrongType);
      }
      const { body, truncated } = await readCapped(res, wanted.maxBytes);
      return { url, contentType, charset: /charset\s*=\s*["']?([\w-]+)/.exec(header)?.[1] ?? "", body, truncated };
    }
  } catch (error) {
    if (error instanceof ClipError) throw error;
    if (signal.aborted) throw new ClipError("That page took too long to answer.");
    throw new ClipError("That page couldn't be reached.");
  }
}

/**
 * Fetches a page from the public web: http(s) only, every hop of a redirect
 * re-checked, ten seconds in all, two megabytes at most, HTML or plain text only.
 */
export const fetchPage = (raw: string) =>
  fetchPublic(raw, {
    accept: "text/html,application/xhtml+xml,text/plain;q=0.8",
    types: ["text/html", "application/xhtml+xml", "text/plain"],
    maxBytes: MAX_BYTES,
    wrongType: "That link isn't a web page. Download the file and attach it to a source instead.",
  });

/** Picture types every reader shows: EPUB's core media types, less SVG (which can carry script). */
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

/**
 * Fetches a picture from the public web under the same rules as a page, whole
 * or not at all: one cut off at `maxBytes` is refused.
 */
export async function fetchImage(raw: string, maxBytes = 5 * 1024 * 1024): Promise<{ contentType: string; bytes: Uint8Array }> {
  const fetched = await fetchPublic(raw, { accept: IMAGE_TYPES.join(","), types: IMAGE_TYPES, maxBytes, wrongType: "That link isn't a picture." });
  if (fetched.truncated) throw new ClipError("That picture is too large.");
  return { contentType: fetched.contentType, bytes: new Uint8Array(fetched.body) };
}

function decodeBody({ body, charset }: Pick<Fetched, "body" | "charset">) {
  // A page may only say what it's written in inside its own <head>.
  const declared = charset || /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(body.subarray(0, 4096).toString("latin1"))?.[1] || "utf-8";
  try {
    return new TextDecoder(declared).decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
}

// ---- Reading a page --------------------------------------------------------------------

const entities: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ensp: " ", emsp: " ", thinsp: " ", shy: "", zwnj: "", zwj: "",
  ndash: "–", mdash: "—", hellip: "…", lsquo: "‘", rsquo: "’", sbquo: "‚", ldquo: "“", rdquo: "”", bdquo: "„", laquo: "«", raquo: "»",
  copy: "©", reg: "®", trade: "™", deg: "°", middot: "·", bull: "•", para: "¶", sect: "§", times: "×", divide: "÷", plusmn: "±",
  frac12: "½", frac14: "¼", frac34: "¾", euro: "€", pound: "£", yen: "¥", cent: "¢", prime: "′", Prime: "″", minus: "−", rarr: "→", larr: "←",
  aacute: "á", agrave: "à", acirc: "â", auml: "ä", atilde: "ã", aring: "å", aelig: "æ", ccedil: "ç", eacute: "é", egrave: "è", ecirc: "ê",
  euml: "ë", iacute: "í", igrave: "ì", icirc: "î", iuml: "ï", ntilde: "ñ", oacute: "ó", ograve: "ò", ocirc: "ô", ouml: "ö", otilde: "õ",
  oslash: "ø", uacute: "ú", ugrave: "ù", ucirc: "û", uuml: "ü", yacute: "ý", szlig: "ß", Aacute: "Á", Agrave: "À", Auml: "Ä", Aring: "Å",
  Ccedil: "Ç", Eacute: "É", Egrave: "È", Ntilde: "Ñ", Oacute: "Ó", Ouml: "Ö", Oslash: "Ø", Uacute: "Ú", Uuml: "Ü",
};

export function decodeEntities(text: string) {
  return text.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-zA-Z][a-zA-Z0-9]{1,10});/gi, (whole, body: string) => {
    if (body[0] !== "#") return entities[body] ?? entities[body.toLowerCase()] ?? whole;
    const code = body[1].toLowerCase() === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    // Control characters and anything outside Unicode are dropped rather than passed through.
    if (!Number.isFinite(code) || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return "";
    return code < 32 && code !== 9 && code !== 10 ? " " : String.fromCodePoint(code);
  });
}

type Token = { kind: "text"; text: string } | { kind: "open" | "close"; name: string; attrs: string };

/** Elements whose content is text, whatever it looks like. */
const rawText = new Set(["script", "style", "textarea", "title", "noscript", "template"]);

/**
 * Splits HTML into tags and text in one pass. Forgiving and linear: anything
 * that doesn't parse as a tag is text, and nothing is ever scanned twice.
 */
function* tokenize(html: string): Generator<Token> {
  let at = 0;
  while (at < html.length) {
    const lt = html.indexOf("<", at);
    if (lt < 0) {
      yield { kind: "text", text: html.slice(at) };
      return;
    }
    if (lt > at) yield { kind: "text", text: html.slice(at, lt) };
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      at = end < 0 ? html.length : end + 3;
      continue;
    }
    const next = html.charCodeAt(lt + 1);
    if (next === 33 /* ! */ || next === 63 /* ? */) {
      const end = html.indexOf(">", lt);
      at = end < 0 ? html.length : end + 1;
      continue;
    }
    const closing = next === 47; /* / */
    const nameStart = lt + (closing ? 2 : 1);
    const name = /^[a-zA-Z][a-zA-Z0-9:-]*/.exec(html.slice(nameStart, nameStart + 40))?.[0];
    if (!name) {
      yield { kind: "text", text: "<" };
      at = lt + 1;
      continue;
    }
    // The tag ends at the first ">" outside a quoted attribute value.
    let end = -1;
    let quote = 0;
    const limit = Math.min(html.length, nameStart + MAX_TAG);
    for (let i = nameStart + name.length; i < limit; i++) {
      const c = html.charCodeAt(i);
      if (quote) {
        if (c === quote) quote = 0;
      } else if (c === 34 || c === 39) quote = c;
      else if (c === 62) {
        end = i;
        break;
      }
    }
    if (end < 0) {
      // Not a tag after all (or an absurdly long one): skip what was scanned.
      at = limit;
      continue;
    }
    const tag = name.toLowerCase();
    yield { kind: closing ? "close" : "open", name: tag, attrs: html.slice(nameStart + name.length, end) };
    at = end + 1;
    if (!closing && rawText.has(tag)) {
      const close = new RegExp(`</${tag}\\s*>`, "gi");
      close.lastIndex = at;
      const found = close.exec(html);
      const stop = found ? found.index : html.length;
      yield { kind: "text", text: html.slice(at, stop) };
      yield { kind: "close", name: tag, attrs: "" };
      at = found ? stop + found[0].length : html.length;
    }
  }
}

function attributes(raw: string) {
  const out: Record<string, string> = {};
  for (const m of raw.matchAll(/([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
    const key = m[1].toLowerCase();
    if (!(key in out)) out[key] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return out;
}

const clean = (text: string) => text.replace(/\s+/g, " ").trim();

/** Never shown: scripts, styles, page furniture and embedded media. */
const dropped = new Set(["script", "style", "noscript", "template", "textarea", "title", "svg", "iframe", "canvas", "object", "select", "button", "dialog", "head", "math"]);
/** Page furniture around the article, kept only when there's nothing else. */
const furniture = new Set(["nav", "header", "footer", "aside", "form", "menu"]);
const headingTags: Record<string, "h2" | "h3"> = { h1: "h2", h2: "h2", h3: "h3", h4: "h3", h5: "h3", h6: "h3" };
const breaking = new Set([
  "p", "div", "section", "article", "main", "body", "li", "ul", "ol", "dl", "dt", "dd", "table", "tr", "td", "th", "thead", "tbody", "caption",
  "blockquote", "pre", "hr", "address", "details", "summary", "figcaption", "fieldset", "h1", "h2", "h3", "h4", "h5", "h6",
]);

type Piece = { type: "p" | "h2" | "h3" | "img"; text: string; url?: string; list?: "disc" | "decimal"; indent?: number; quote?: boolean; article: boolean; main: boolean };

/**
 * A picture's address, made absolute: `src`, or what a lazy loader keeps in
 * `data-src`. Only http(s) pictures of some size are kept: no inline data,
 * no tracking pixels, no spacers.
 */
function imageUrl(attrs: Record<string, string>, pageUrl: string): string | null {
  const raw = attrs["data-src"] || attrs["data-original"] || attrs.src || "";
  if (!raw || /^data:/i.test(raw.trim())) return null;
  const tiny = (value: string | undefined) => value !== undefined && /^\d+$/.test(value.trim()) && Number(value) <= 4;
  if (tiny(attrs.width) || tiny(attrs.height)) return null;
  try {
    const url = new URL(raw.trim(), pageUrl);
    return /^https?:$/.test(url.protocol) && url.href.length <= 2048 ? url.href : null;
  } catch {
    return null;
  }
}

function readBlocks(html: string, keepFurniture: boolean, pageUrl: string): Piece[] {
  const pieces: Piece[] = [];
  const skip = keepFurniture ? dropped : new Set([...dropped, ...furniture]);
  let skipping: { name: string; depth: number } | null = null;
  let text = "";
  let heading: "h2" | "h3" | null = null;
  let item = false;
  const lists: Array<"disc" | "decimal"> = [];
  let quote = 0;
  let article = 0;
  let main = 0;
  let total = 0;
  let images = 0;

  const flush = () => {
    const raw = text;
    text = "";
    // Two line breaks in a row separate paragraphs; one is just a line break.
    for (const paragraph of raw.split(/\n\s*\n/)) {
      const body = clean(paragraph).slice(0, MAX_BLOCK_TEXT);
      if (!body || pieces.length >= MAX_BLOCKS || total >= MAX_TEXT) continue;
      total += body.length;
      pieces.push({
        type: heading ?? "p",
        text: body,
        ...(item && !heading && lists.length && { list: lists.at(-1), indent: Math.min(lists.length, 4) }),
        ...(quote > 0 && !heading && { quote: true }),
        article: article > 0,
        main: main > 0,
      });
    }
  };

  for (const token of tokenize(html)) {
    if (skipping) {
      // </head> may be left out: the body starting ends it too.
      if (skipping.name === "head" && token.kind === "open" && token.name === "body") skipping = null;
      else if (token.kind !== "text" && token.name === skipping.name) {
        skipping.depth += token.kind === "open" ? 1 : -1;
        if (skipping.depth === 0) skipping = null;
      }
      continue;
    }
    if (token.kind === "text") {
      text += decodeEntities(token.text.replace(/\s+/g, " "));
      continue;
    }
    const { name } = token;
    const open = token.kind === "open";
    if (skip.has(name)) {
      if (open && !/\/\s*$/.test(token.attrs)) {
        flush();
        skipping = { name, depth: 1 };
      }
      continue;
    }
    if (name === "br") {
      text += "\n";
      continue;
    }
    if (name === "img") {
      const a = attributes(token.attrs);
      const url = open && images < MAX_IMAGES ? imageUrl(a, pageUrl) : null;
      if (url) {
        flush();
        images++;
        pieces.push({ type: "img", text: clean(a.alt ?? "").slice(0, 300), url, article: article > 0, main: main > 0 });
      }
      continue;
    }
    if (!breaking.has(name)) {
      // Inline: its text simply joins the block around it.
      continue;
    }
    flush();
    if (headingTags[name]) heading = open ? headingTags[name] : null;
    else if (name === "ul" || name === "ol") {
      if (open) lists.push(name === "ol" ? "decimal" : "disc");
      else lists.pop();
      item = false;
    } else if (name === "li") item = open;
    else if (name === "blockquote") quote = Math.max(0, quote + (open ? 1 : -1));
    else if (name === "article") article = Math.max(0, article + (open ? 1 : -1));
    else if (name === "main") main = Math.max(0, main + (open ? 1 : -1));
  }
  flush();
  return pieces;
}

const lengthOf = (pieces: Piece[]) => pieces.reduce((n, p) => n + p.text.length, 0);

function toBlocks(pieces: Piece[], title: string): DocNode[] {
  const out: DocNode[] = [];
  let previous = "";
  for (const piece of pieces) {
    // The note already has the title, and repeated lines are page furniture.
    if (piece.type === "img") {
      out.push({ type: "img", url: piece.url, alt: piece.text, children: [{ text: "" }] });
      continue;
    }
    if (piece.text === previous || (piece.type !== "p" && clean(piece.text).toLowerCase() === title.toLowerCase())) continue;
    previous = piece.text;
    const leaf = [{ text: piece.text }];
    if (piece.quote) out.push({ type: "blockquote", children: [{ type: "p", children: leaf }] });
    else if (piece.list) out.push({ type: "p", indent: piece.indent ?? 1, listStyleType: piece.list, children: leaf });
    else out.push({ type: piece.type, children: leaf });
  }
  return out;
}

export type ClippedPage = {
  title: string;
  url: string;
  /** The site's name, else its host. */
  site: string;
  description: string;
  authors: Author[];
  /** ISO date (2019-03-04) or a year, when the page says. */
  published: string;
  journal: string;
  publisher: string;
  doi: string;
  volume: string;
  pages: string;
  blocks: DocNode[];
};

const hostName = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

function isoDate(raw: string) {
  const text = raw.trim().replace(/\//g, "-");
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const date = parseDate(raw);
  if (!date?.year) return "";
  return `${date.year}${date.month ? `-${String(date.month).padStart(2, "0")}${date.day ? `-${String(date.day).padStart(2, "0")}` : ""}` : ""}`;
}

/** Names from a page's author tags; links to profiles and absurd values are left out. */
function readAuthors(scholarly: string[], general: string[], site: string): Author[] {
  const usable = (name: string) => name.length > 1 && name.length <= 80 && !/^https?:|^@|[<>{}]/i.test(name);
  // Scholarly tags name one author each, as "Last, First" or "First Last".
  if (scholarly.some(usable)) return scholarly.filter(usable).flatMap((name) => parseAuthors(name)).slice(0, 50);
  const names = general
    .filter(usable)
    .flatMap((value) => value.replace(/^by\s+/i, "").split(/\s*(?:,|;|\band\b|&)\s*/i))
    .map(clean)
    .filter(usable);
  return [...new Set(names)].slice(0, 20).flatMap((name) => (name.toLowerCase() === site.toLowerCase() ? [{ family: name, given: "", literal: true }] : parseAuthors(name)));
}

/** Pulls the title, bibliographic details and readable text out of a page's HTML. */
export function extractPage(html: string, pageUrl: string): ClippedPage {
  const meta = new Map<string, string[]>();
  let titleTag = "";
  let canonical = "";
  let inTitle = false;
  let seen = 0;
  // Everything worth knowing is in the <head>; stop looking once the body is well under way.
  for (const token of tokenize(html)) {
    if (++seen > 20_000) break;
    if (token.kind === "text") {
      if (inTitle && !titleTag) titleTag = clean(decodeEntities(token.text));
      continue;
    }
    if (token.name === "title") inTitle = token.kind === "open";
    if (token.kind !== "open") continue;
    if (token.name === "meta") {
      const a = attributes(token.attrs);
      const key = (a.name || a.property || a.itemprop || "").toLowerCase();
      const value = clean(a.content ?? "");
      if (key && value) meta.set(key, [...(meta.get(key) ?? []), value]);
    } else if (token.name === "link") {
      const a = attributes(token.attrs);
      if (a.rel?.toLowerCase().split(/\s+/).includes("canonical") && a.href && !canonical) canonical = a.href;
    }
  }
  const first = (...keys: string[]) => {
    for (const key of keys) {
      const value = meta.get(key)?.[0];
      if (value) return value.slice(0, 500);
    }
    return "";
  };

  // The canonical address, when it's a plain web address on the same site.
  let url = pageUrl;
  try {
    const resolved = new URL(canonical || first("og:url"), pageUrl);
    if (/^https?:$/.test(resolved.protocol) && resolved.hostname === new URL(pageUrl).hostname) url = resolved.href;
  } catch {}

  let site = first("og:site_name", "application-name");
  let title = first("citation_title", "og:title", "twitter:title", "dc.title") || titleTag;
  // "Headline | Site name": the site isn't part of the title. Without a declared
  // name, a last segment that matches the host ("… - Wikipedia") is the site.
  const segments = title.split(/\s+[|–—-]\s+/);
  const last = segments.at(-1) ?? "";
  const squashed = last.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (segments.length > 1 && (site ? last.toLowerCase() === site.toLowerCase() : squashed.length >= 4 && hostName(url).replace(/[^a-z0-9]/g, "").includes(squashed))) {
    site ||= clean(last);
    title = segments.slice(0, -1).join(" – ");
  }
  site ||= hostName(url);
  title = clean(title).slice(0, 200) || hostName(url) || "Clipped page";

  const journal = first("citation_journal_title", "citation_conference_title");
  const firstPage = first("citation_firstpage");
  const lastPage = first("citation_lastpage");
  const volume = first("citation_volume");
  const issue = first("citation_issue");

  let pieces = readBlocks(html, false, pageUrl);
  // A page that wraps its whole text in <header> or <form> would come out empty: read it again, furniture and all.
  if (lengthOf(pieces) < 200) {
    const everything = readBlocks(html, true, pageUrl);
    if (lengthOf(everything) > lengthOf(pieces)) pieces = everything;
  }
  // The article itself, when the page marks it.
  for (const region of ["article", "main"] as const) {
    const inside = pieces.filter((p) => p[region]);
    if (lengthOf(inside) >= 400 && lengthOf(inside) >= lengthOf(pieces) * 0.25) {
      pieces = inside;
      break;
    }
  }

  return {
    title,
    url,
    site,
    description: first("og:description", "description", "twitter:description", "dc.description").slice(0, 500),
    authors: readAuthors(meta.get("citation_author") ?? [], [...(meta.get("author") ?? []), ...(meta.get("article:author") ?? []), ...(meta.get("dc.creator") ?? [])], site),
    published: isoDate(first("citation_publication_date", "citation_date", "citation_online_date", "article:published_time", "dc.date", "date", "datepublished", "pubdate")),
    journal,
    publisher: first("citation_publisher", "dc.publisher", "article:publisher").replace(/^https?:\/\/\S+$/i, ""),
    doi: first("citation_doi", "dc.identifier").replace(/^(?:doi:|https?:\/\/(?:dx\.)?doi\.org\/)/i, "").replace(/^(?!10\.).*$/, ""),
    volume: volume ? `${volume}${issue ? `(${issue})` : ""}` : "",
    pages: firstPage ? `${firstPage}${lastPage && lastPage !== firstPage ? `-${lastPage}` : ""}` : "",
    blocks: toBlocks(pieces, title),
  };
}

/** A plain-text file as a page: paragraphs are separated by blank lines. */
export function extractText(text: string, pageUrl: string): ClippedPage {
  const blocks: DocNode[] = [];
  let total = 0;
  for (const paragraph of text.split(/\r?\n\s*\r?\n/)) {
    const body = clean(paragraph).slice(0, MAX_BLOCK_TEXT);
    if (!body || blocks.length >= MAX_BLOCKS || total >= MAX_TEXT) continue;
    total += body.length;
    blocks.push({ type: "p", children: [{ text: body }] });
  }
  const name = decodeURIComponentSafe(new URL(pageUrl).pathname.split("/").filter(Boolean).at(-1) ?? "");
  return {
    title: clean(name).slice(0, 200) || hostName(pageUrl) || "Clipped page",
    url: pageUrl,
    site: hostName(pageUrl),
    description: "",
    authors: [],
    published: "",
    journal: "",
    publisher: "",
    doi: "",
    volume: "",
    pages: "",
    blocks,
  };
}

function decodeURIComponentSafe(text: string) {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/** Fetches a web page and reads it. Throws `ClipError` with a message for the writer. */
export async function clipPage(raw: string): Promise<ClippedPage & { truncated: boolean }> {
  const fetched = await fetchPage(raw);
  const body = decodeBody(fetched);
  const page = fetched.contentType === "text/plain" ? extractText(body, fetched.url.href) : extractPage(body, fetched.url.href);
  return { ...page, truncated: fetched.truncated };
}

/** The Authors field of a research note for a clipped page. */
export const clippedAuthors = (page: ClippedPage) => formatAuthorsField(page.authors);
