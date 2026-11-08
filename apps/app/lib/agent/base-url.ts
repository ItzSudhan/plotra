import "server-only";
import type { LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { Readable } from "node:stream";
import { isPrivateAddress } from "../clip";
import { isLocalMode } from "../local-mode";

// A person can point Plotra at any OpenAI-compatible URL (plan.md 2.11 "Whose
// model"), and the server is what calls it. On the hosted version that URL
// must lead to the public internet: otherwise it is a way to make our server
// talk to its own network (cloud metadata, a database, another tenant's
// machine). The same rules as web clipping (lib/clip.ts), except that any
// port is fine: model servers rarely sit on 80 or 443.
//
// A self-hosted instance is the other case: its Ollama is on localhost or the
// LAN, and that is the point. AI_ALLOW_PRIVATE_URLS=true lifts the check.
//
// Without it, a private address isn't refused when it is saved: it is a model
// on the writer's own machine, and their browser calls it instead of this
// server (lib/agent/providers.ts `isBrowserLocal`, lib/agent/local-loop.ts).
// What is refused here is the server being sent to one, which now only
// happens when a public name turns out to resolve to a private address.

/**
 * Whether this server may call model URLs on private networks (self-hosting).
 * Always in local mode: the server is the writer's own computer, as is Ollama.
 */
export const privateUrlsAllowed = () => isLocalMode || process.env.AI_ALLOW_PRIVATE_URLS === "true";

const LOCAL_NAMES = /(^|\.)(localhost|local|localdomain|internal|intranet|lan|home|corp)$/;

const bare = (hostname: string) => hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();

/** True when a URL's host is on this machine or a private network, as far as the name alone tells. */
export function looksPrivate(url: URL): boolean {
  const host = bare(url.hostname);
  if (!host) return true;
  if (net.isIP(host)) return isPrivateAddress(host);
  return !host.includes(".") || LOCAL_NAMES.test(host);
}

export const PRIVATE_URL_MESSAGE =
  "That address leads to a private network, which this server can't call. For a model on your own machine, enter its local address in Settings → AI (like http://localhost:11434/v1): your browser calls it instead.";

/**
 * Parses a model base URL a person typed. Refuses anything but http(s), URLs
 * carrying credentials, and (unless `allowPrivate`) private or local hosts.
 * The host's addresses are checked again when it is resolved (`guardedFetch`).
 */
export function parseBaseUrl(raw: string, { allowPrivate = privateUrlsAllowed() }: { allowPrivate?: boolean } = {}): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("That doesn't look like a URL. It should start with http:// or https://.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("The URL has to start with http:// or https://.");
  if (url.username || url.password) throw new Error("Put the key in the key field, not in the URL.");
  if (!allowPrivate && looksPrivate(url)) throw new Error(PRIVATE_URL_MESSAGE);
  url.hash = "";
  return url;
}

type Lookup = (hostname: string) => Promise<LookupAddress[]>;

const systemLookup: Lookup = (hostname) => lookup(hostname, { all: true, verbatim: true });

/** The addresses a host resolves to, refusing unless every one of them is public. */
export async function resolvePublic(url: URL, resolve: Lookup = systemLookup): Promise<LookupAddress[]> {
  const host = bare(url.hostname);
  const family = net.isIP(host);
  if (family) {
    if (isPrivateAddress(host)) throw new Error(PRIVATE_URL_MESSAGE);
    return [{ address: host, family }];
  }
  let addresses: LookupAddress[];
  try {
    addresses = await resolve(host);
  } catch {
    throw new Error(`Couldn't find ${host}. Check the URL.`);
  }
  // One private address among several is enough to refuse: the connection could pick it.
  if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) throw new Error(PRIVATE_URL_MESSAGE);
  return addresses;
}

async function bodyBytes(body: BodyInit | null | undefined): Promise<Buffer | null> {
  if (body == null) return null;
  if (typeof body === "string") return Buffer.from(body, "utf8");
  return Buffer.from(await new Response(body).arrayBuffer());
}

/**
 * One request to exactly the given addresses: the name isn't resolved a second
 * time, so a DNS answer that changes between the check and the connection
 * (rebinding) can't redirect it. Redirects are returned, not followed.
 */
export async function pinnedFetch(url: URL, init: RequestInit | undefined, addresses: LookupAddress[]): Promise<Response> {
  const pinned: net.LookupFunction = (_hostname, options, callback) => {
    if (typeof options === "object" && options.all) callback(null, addresses);
    else callback(null, addresses[0].address, addresses[0].family);
  };
  const headers: Record<string, string> = {};
  new Headers(init?.headers).forEach((value, key) => (headers[key] = value));
  // The response is passed on as it arrives, so ask for it uncompressed.
  headers["accept-encoding"] = "identity";
  const body = await bodyBytes(init?.body);
  if (body) headers["content-length"] = String(body.length);

  const res = await new Promise<http.IncomingMessage>((resolve, reject) => {
    const req = (url.protocol === "https:" ? https : http).request(
      url,
      { method: init?.method ?? "GET", agent: false, lookup: pinned, signal: init?.signal ?? undefined, headers },
      resolve,
    );
    req.on("error", reject);
    req.end(body ?? undefined);
  });

  const responseHeaders = new Headers();
  for (const [key, value] of Object.entries(res.headers)) {
    if (Array.isArray(value)) for (const v of value) responseHeaders.append(key, v);
    else if (value !== undefined) responseHeaders.set(key, value);
  }
  const status = res.statusCode ?? 502;
  const empty = status === 204 || status === 205 || status === 304 || init?.method === "HEAD";
  if (empty) res.resume();
  return new Response(empty ? null : (Readable.toWeb(res) as ReadableStream<Uint8Array>), { status, statusText: res.statusMessage, headers: responseHeaders });
}

/**
 * `fetch` for model URLs a person supplied, on a server that must stay off
 * private networks: resolves the host, refuses private addresses, and connects
 * only to the addresses it checked.
 */
export const guardedFetch: typeof fetch = async (input, init) => {
  const request = input instanceof Request ? input : null;
  const url = new URL(request ? request.url : String(input));
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("The URL has to start with http:// or https://.");
  const merged: RequestInit | undefined = request
    ? { method: request.method, headers: request.headers, body: request.body ? await request.arrayBuffer() : null, signal: request.signal, ...init }
    : init;
  return pinnedFetch(url, merged, await resolvePublic(url));
};
