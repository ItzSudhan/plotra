// Plotra's service worker (beat-the-competitors.md, step 2): it lets the app
// start and move between pages without a connection. The notes themselves are
// kept by the editor in IndexedDB (components/collab); this keeps the rest:
//
// - The app's own files (/_next/static, hashed, so they never change): kept
//   once fetched, and served from here.
// - The pages of workspaces and projects you've opened: fetched from the
//   network as usual, with a copy kept for when the network fails. Never
//   sign-in, the API, or anything that isn't a GET.
//
// The page copies hold what the server rendered for you, so signing out (or
// signing in, in case someone else used this browser) deletes them
// (components/offline/service-worker.tsx).

const STATIC = "plotra-static-v1";
const PAGES = "plotra-pages-v1";
const OURS = new Set([STATIC, PAGES]);
const MAX_STATIC = 800;
const MAX_PAGES = 80;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Caches of an older version of this worker.
      for (const key of await caches.keys()) if (key.startsWith("plotra-") && !OURS.has(key)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

/** Pages worth a copy: the workspace home, projects and settings. */
const pageable = (path) => path === "/" || path.startsWith("/w/") || path === "/settings" || path === "/workspaces";
/** A page is kept once, whatever is after the "?": `?open=` only says which note to open. */
const pageKey = (url) => new URL(url).origin + new URL(url).pathname;

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/_next/static/")) return event.respondWith(kept(request));
  if (url.pathname.startsWith("/icons/") || url.pathname === "/manifest.webmanifest") return event.respondWith(kept(request));
  if (!pageable(url.pathname)) return;
  if (request.mode === "navigate") return event.respondWith(page(request));
  // Next.js fetching a page's data for an in-app move to it.
  if (request.headers.get("RSC") === "1") return event.respondWith(pageData(request));
});

/** From the cache when it's there; otherwise from the network, keeping a copy. */
async function kept(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    void trim(STATIC, MAX_STATIC);
  }
  return response;
}

/** The network first, keeping a copy; the copy, or a page saying what's here, when the network fails. */
async function page(request) {
  try {
    const response = await fetch(request);
    await keepPage(request.url, response.clone());
    return response;
  } catch {
    const copy = await (await caches.open(PAGES)).match(pageKey(request.url));
    return copy ?? offlinePage();
  }
}

async function keepPage(url, response) {
  const type = response.headers.get("content-type") ?? "";
  // A page that sent you to sign in isn't the page you asked for.
  if (!response.ok || response.redirected || response.type !== "basic" || !type.includes("text/html")) return;
  await (await caches.open(PAGES)).put(pageKey(url), response);
  void trim(PAGES, MAX_PAGES);
}

/**
 * A page's data for an in-app move. Offline, the reply is deliberately not
 * page data: Next.js then loads the page in full, which `page` above answers
 * from its copy. A prefetch just fails, as it would without this worker.
 */
async function pageData(request) {
  try {
    return await fetch(request);
  } catch {
    if (request.headers.get("Next-Router-Prefetch") || request.headers.get("Next-Router-Segment-Prefetch")) return Response.error();
    return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
  }
}

/** Drops the oldest entries past `max`. */
async function trim(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(key);
}

// The page asks for copies of itself and the files it loaded before this worker was in charge,
// so the first visit already works offline.
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "keep" || typeof data.page !== "string") return;
  event.waitUntil(
    (async () => {
      const url = new URL(data.page);
      if (url.origin !== self.location.origin || !pageable(url.pathname)) return;
      const cache = await caches.open(PAGES);
      // A copy less than ten minutes old is fresh enough; the next visit while online refreshes it anyway.
      const copy = await cache.match(pageKey(url));
      const age = copy ? Date.now() - Date.parse(copy.headers.get("date") ?? "") : Infinity;
      if (!(age < 10 * 60 * 1000)) {
        try {
          await keepPage(url.href, await fetch(url.href, { credentials: "same-origin" }));
        } catch {
          // Offline: the copy there is stays.
        }
      }
      const files = await caches.open(STATIC);
      for (const asset of Array.isArray(data.assets) ? data.assets.slice(0, 300) : []) {
        if (typeof asset !== "string" || !asset.startsWith(`${self.location.origin}/_next/static/`)) continue;
        if (await files.match(asset)) continue;
        try {
          const response = await fetch(asset);
          if (response.ok) await files.put(asset, response);
        } catch {
          // Offline, or gone after a deploy: skip it.
        }
      }
      void trim(STATIC, MAX_STATIC);
    })(),
  );
});

/** What a page you haven't opened on this device shows offline: the ones you have. */
async function offlinePage() {
  const cache = await caches.open(PAGES);
  const links = [];
  for (const request of (await cache.keys()).reverse().slice(0, 40)) {
    const path = new URL(request.url).pathname;
    if (!path.includes("/p/")) continue;
    const html = await (await cache.match(request))?.text();
    const title = (html?.match(/<title>([^<]*)<\/title>/)?.[1] ?? path).replace(/ · Plotra$/, "");
    links.push(`<li><a href="${escape(path)}">${title}</a></li>`);
  }
  const list = links.length
    ? `<p>These projects are on this device. Open one to keep writing; your changes go up when you're back online.</p><ul>${links.join("")}</ul>`
    : "<p>No project has been opened on this device yet. Open one while online and it will be here next time.</p>";
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offline · Plotra</title><style>
body{margin:0;font:16px/1.6 system-ui,sans-serif;background:#f7f6f3;color:#1f1d1a}
main{max-width:34rem;margin:12vh auto;padding:0 1.5rem}h1{font-weight:600;font-size:1.5rem;margin:0 0 .5rem}
p{color:#6b665e}ul{padding:0;list-style:none}li{border-bottom:1px solid #e6e2da}
a{display:block;padding:.6rem 0;color:inherit;text-decoration:none}a:hover{color:#d9541f}
button{margin-top:1.5rem;font:inherit;background:#1f1d1a;color:#f7f6f3;border:0;border-radius:.4rem;padding:.5rem .9rem;cursor:pointer}
@media (prefers-color-scheme:dark){body{background:#141311;color:#ece9e3}p{color:#a29d94}li{border-color:#2b2925}button{background:#ece9e3;color:#141311}}
</style></head><body><main><h1>You're offline</h1>${list}<button onclick="location.reload()">Try again</button></main></body></html>`;
  return new Response(body, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function escape(text) {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
