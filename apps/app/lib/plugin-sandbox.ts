// The frames a plugin runs in (lib/plugins.ts). A plugin never runs in the
// app's own page: its code goes into an `<iframe sandbox="allow-scripts">`
// made from a string (`srcdoc`), whose origin matches nothing. No cookies, no
// storage of the app's, no reading the app's page, no requests that carry the
// person's session. It talks to the app only by messages, and the app answers
// only the calls in lib/plugins.ts.
//
// Every frame also carries a Content-Security-Policy:
//
//   default-src 'none'      nothing loads unless listed below
//   script-src 'sha256-…'   only our two scripts and the plugin's code, by hash:
//                           no eval, no remote or injected script
//   connect-src 'none'      no fetch, no WebSocket: a plugin can't send what it
//                           reads anywhere
//   frame-src 'none', form-action 'none', base-uri 'none', img-src data: blob:
//
// A frame may navigate itself wherever it likes, which would carry what it
// read off in a URL. Where a frame may go is its parent's policy, so the
// plugin's frame sits inside a relay frame of ours whose policy forbids it
// (frame-src 'none') and which only passes messages along. A `srcdoc` frame
// also takes on its parent's policy, so the relay's has to allow the plugin's
// scripts too: both frames carry the same one.
//
// What this doesn't close, the docs say (guide/plugins): WebRTC isn't covered
// by any policy, so the bootstrap takes it away, as far as a page can. That
// and the way frames are made rely on the app's own page having no policy of
// its own that forbids inline scripts; if it gets one, plugins need it to
// allow these frames.

import { pluginEvents } from "./plugins";

export type PluginMode = "background" | "panel";

export type PluginContext = {
  pluginId: string;
  /** A background frame registers commands, panels and exports; a panel's draws one panel. */
  mode: PluginMode;
  panel: string | null;
  project: { id: string; title: string; type: string };
  user: { name: string };
};

/** The app's colours, as `--plotra-<name>` in the plugin's page. */
export type PluginTheme = { dark: boolean; variables: Record<string, string> };

/** What the app sends a plugin's frame and what it sends back; every message carries `plotra: 1`. */
export type ToPlugin =
  | { plotra: 1; type: "result"; id: number; ok: true; value: unknown }
  | { plotra: 1; type: "result"; id: number; ok: false; error: string }
  | { plotra: 1; type: "run"; id: number; what: "command" | "export"; name: string }
  | { plotra: 1; type: "event"; name: string; data: unknown };

export type FromPlugin =
  | { plotra: 1; type: "call"; id: number; method: string; args: unknown[] }
  | { plotra: 1; type: "register"; what: "command" | "export" | "panel"; name: string; title: string; extension?: string }
  | { plotra: 1; type: "register"; what: "theme"; name: string; title: string; light: unknown; dark: unknown; css?: unknown }
  | { plotra: 1; type: "done"; id: number; ok: boolean; value?: unknown; error?: string }
  | { plotra: 1; type: "error"; message: string }
  | { plotra: 1; type: "subscribe"; name: string };

/**
 * Passes messages between the app and the plugin's frame, and nothing else.
 * In the head, so it listens before the plugin's frame can say anything.
 */
export const RELAY =
  '(function(){addEventListener("message",function(e){var f=document.getElementById("p");var w=f&&f.contentWindow;if(!w)return;if(e.source===parent){w.postMessage(e.data,"*")}else if(e.source===w){parent.postMessage(e.data,"*")}})})();';

/**
 * The `plotra` object a plugin's code finds: calls to the app, which answer
 * with promises, and what it registers. Runs before the plugin's code, with
 * the frame's context as `C`. No `</script` and no `<!--` in it.
 */
const BOOT = `"use strict";
var send = function (m) { m.plotra = 1; parent.postMessage(m, "*"); };
var describe = function (e) { return String((e && e.message) || e || "Something went wrong.").slice(0, 300); };
var pending = new Map();
var next = 1;
var handlers = { command: new Map(), export: new Map() };
var EVENTS = ${JSON.stringify(pluginEvents)};
var listeners = new Map();
var call = function (method, args) {
  return new Promise(function (resolve, reject) {
    var id = next++;
    pending.set(id, { resolve: resolve, reject: reject });
    send({ type: "call", id: id, method: method, args: args || [] });
  });
};
addEventListener("message", function (event) {
  if (event.source !== parent) return;
  var m = event.data;
  if (!m || m.plotra !== 1) return;
  if (m.type === "result") {
    var p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if (m.ok) p.resolve(m.value); else p.reject(new Error(String(m.error || "That didn't work.")));
  } else if (m.type === "run") {
    var table = handlers[m.what];
    var run = table && table.get(m.name);
    Promise.resolve()
      .then(function () { if (!run) throw new Error("This plugin no longer has that."); return run(); })
      .then(
        function (value) { send({ type: "done", id: m.id, ok: true, value: value === undefined ? null : value }); },
        function (error) { send({ type: "done", id: m.id, ok: false, error: describe(error) }); }
      );
  } else if (m.type === "event") {
    var heard = listeners.get(m.name);
    if (!heard) return;
    heard.forEach(function (handler) {
      try {
        var out = handler(m.data);
        if (out && typeof out.then === "function") out.then(null, function (e) { send({ type: "error", message: describe(e) }); });
      } catch (e) { send({ type: "error", message: describe(e) }); }
    });
  }
});
addEventListener("error", function (event) { send({ type: "error", message: describe(event.error || event.message) }); });
addEventListener("unhandledrejection", function (event) { send({ type: "error", message: describe(event.reason) }); });
var spec = function (value, what) {
  if (!value || typeof value !== "object") throw new TypeError("Describe the " + what + " with an object: { id, title, ... }.");
  if (typeof value.id !== "string" || !/^[a-z0-9][a-z0-9._-]{0,59}$/i.test(value.id.trim())) throw new TypeError("A " + what + "'s id must be letters, digits, dots, dashes or underscores, up to 60.");
  if (typeof value.title !== "string" || !value.title.trim()) throw new TypeError("Give the " + what + " a title.");
  return value.id.trim().toLowerCase();
};
var needs = function (value, what) { if (typeof value !== "function") throw new TypeError(what + " must be a function."); };
var plotra = {
  version: 2,
  project: Object.freeze(C.project),
  user: Object.freeze(C.user),
  panel: C.panel ? Object.freeze({ id: C.panel }) : null,
  registerCommand: function (s) {
    var id = spec(s, "command");
    needs(s.run, "A command's run");
    handlers.command.set(id, s.run);
    if (C.mode === "background") send({ type: "register", what: "command", name: id, title: s.title.trim().slice(0, 80) });
  },
  registerExport: function (s) {
    var id = spec(s, "export");
    needs(s.run, "An export's run");
    handlers.export.set(id, s.run);
    var extension = typeof s.extension === "string" ? s.extension.replace(/^[.]/, "") : "txt";
    if (C.mode === "background") send({ type: "register", what: "export", name: id, title: s.title.trim().slice(0, 80), extension: extension });
  },
  registerPanel: function (s) {
    var id = spec(s, "panel");
    needs(s.render, "A panel's render");
    if (C.mode === "background") send({ type: "register", what: "panel", name: id, title: s.title.trim().slice(0, 80) });
    else if (C.panel === id) {
      try {
        var drawn = s.render(document.body);
        if (drawn && typeof drawn.then === "function") drawn.then(null, function (e) { send({ type: "error", message: describe(e) }); });
      } catch (e) { send({ type: "error", message: describe(e) }); }
    }
  },
  registerTheme: function (s) {
    var id = spec(s, "theme");
    var colours = function (v, mode) {
      var out = {};
      if (v === undefined) return out;
      if (!v || typeof v !== "object") throw new TypeError("A theme's " + mode + " is an object of colours: { background: '#ffffff', ... }.");
      Object.keys(v).forEach(function (k) { if (typeof v[k] === "string") out[k] = v[k].slice(0, 60); });
      return out;
    };
    var light = colours(s.light, "light");
    var dark = colours(s.dark, "dark");
    if (s.css !== undefined && typeof s.css !== "string") throw new TypeError("A theme's css must be a string.");
    if (!Object.keys(light).length && !Object.keys(dark).length && !s.css) throw new TypeError("Give the theme colours for light, dark, or both.");
    if (C.mode === "background") send({ type: "register", what: "theme", name: id, title: s.title.trim().slice(0, 40), light: light, dark: dark, css: s.css ? s.css.slice(0, 20000) : "" });
  },
  on: function (name, handler) {
    if (EVENTS.indexOf(name) < 0) throw new TypeError("plotra.on listens for one of: " + EVENTS.join(", ") + ".");
    needs(handler, "An event's handler");
    var heard = listeners.get(name);
    if (!heard) {
      heard = new Set();
      listeners.set(name, heard);
      send({ type: "subscribe", name: name });
    }
    heard.add(handler);
    return function () { heard.delete(handler); };
  },
  storage: Object.freeze({
    get: function (key) { return call("storage.get", [key]); },
    set: function (key, value) { return call("storage.set", [key, value]); },
    delete: function (key) { return call("storage.delete", [key]); },
    keys: function () { return call("storage.keys"); }
  }),
  notes: Object.freeze({
    list: function () { return call("notes.list"); },
    read: function (id) { return call("notes.read", [id]); },
    search: function (query, limit) { return call("notes.search", [query, limit]); },
    create: function (note) { return call("notes.create", [note]); },
    update: function (id, patch) { return call("notes.update", [id, patch]); },
    write: function (id, change) { return call("notes.write", [id, change]); },
    active: function () { return call("notes.active"); }
  }),
  kinds: Object.freeze({
    list: function () { return call("kinds.list"); },
    add: function (kind) { return call("kinds.add", [kind]); }
  }),
  ui: Object.freeze({
    toast: function (message, tone) { return call("ui.toast", [message, tone]); },
    download: function (name, content, type) { return call("ui.download", [name, content, type]); },
    openNote: function (id) { return call("ui.openNote", [id]); },
    openPanel: function (id) { return call("ui.openPanel", [id]); }
  })
};
Object.defineProperty(window, "plotra", { value: Object.freeze(plotra), enumerable: true });
["RTCPeerConnection", "webkitRTCPeerConnection", "RTCDataChannel", "RTCIceCandidate", "RTCSessionDescription", "RTCRtpSender", "RTCRtpReceiver"].forEach(function (name) {
  try { Object.defineProperty(window, name, { value: undefined, writable: false, configurable: false }); } catch (e) {}
});`;

const utf8 = new TextEncoder();

async function sha256(text: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("Plugins need Plotra on https (or localhost): only there does the browser make the hashes their frames are checked by.");
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", utf8.encode(text)));
  let binary = "";
  for (const byte of digest) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * JavaScript made safe to sit in an inline `<script>`: nothing in it can end
 * the element or open an HTML comment (which changes where the element ends).
 * Both replacements mean the same inside strings, templates and regular
 * expressions, the only place valid code has them; bundlers escape them alike.
 * Line endings are made the parser's, because the hash is of what it sees.
 */
export const inlineScript = (code: string) =>
  code
    .replace(/\r\n?/g, "\n")
    .replace(/<\/(script)/gi, "<\\/$1")
    .replace(/<!--/g, "<\\x21--");

/** Text inside a double-quoted attribute. */
const attribute = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/** A value a script can hold as a literal, with nothing in it that ends the element. */
const literal = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

/** The bootstrap for one frame, with its context. */
export const bootScript = (context: PluginContext) => `(function(C){${BOOT}})(${literal(context)});`;

/** The policy both frames carry, allowing exactly these scripts. */
export function policy(hashes: string[]): string {
  return [
    "default-src 'none'",
    `script-src ${hashes.map((hash) => `'sha256-${hash}'`).join(" ")}`,
    "style-src 'unsafe-inline'",
    "img-src data: blob:",
    "font-src data:",
    "media-src data: blob:",
    "connect-src 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
}

const cssValue = (value: string) => value.replace(/[<>{};\\]/g, "");

function themeCss(theme: PluginTheme): string {
  const variables = Object.entries(theme.variables)
    .filter(([name]) => /^[a-z0-9-]{1,40}$/.test(name))
    .map(([name, value]) => `--plotra-${name}:${cssValue(value)}`)
    .join(";");
  return (
    `:root{color-scheme:${theme.dark ? "dark" : "light"};${variables}}` +
    "*,*::before,*::after{box-sizing:border-box}" +
    "html,body{margin:0}" +
    "body{padding:12px;font:13px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif;color:var(--plotra-foreground);background:var(--plotra-background)}" +
    "a{color:var(--plotra-primary)}button,input,select,textarea{font:inherit;color:inherit}"
  );
}

/**
 * The `srcdoc` of a plugin's frame: the relay, with the plugin's own frame
 * inside it holding the bootstrap and then the plugin's code. The code runs as
 * a module, so it may `await` at the top.
 */
export async function pluginDocument(code: string, context: PluginContext, theme: PluginTheme): Promise<string> {
  const boot = bootScript(context);
  const main = inlineScript(code);
  const csp = attribute(policy(await Promise.all([sha256(RELAY), sha256(boot), sha256(main)])));
  const meta = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta http-equiv="x-dns-prefetch-control" content="off">`;
  const inner =
    `<!doctype html><html><head>${meta}<style>${themeCss(theme)}</style></head>` +
    `<body><script>${boot}</script><script type="module">${main}</script></body></html>`;
  return (
    `<!doctype html><html><head>${meta}<script>${RELAY}</script>` +
    "<style>html,body{margin:0;height:100%;overflow:hidden;background:transparent}iframe{display:block;width:100%;height:100%;border:0}</style></head>" +
    `<body><iframe id="p" sandbox="allow-scripts" title="Plugin" srcdoc="${attribute(inner)}"></iframe></body></html>`
  );
}

/** The app's colour tokens a plugin's page gets. */
const TOKENS = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "border",
  "input",
  "ring",
  "ember",
  "gold",
  "teal",
  "violet",
  "rose",
  "faint",
  "radius",
];

/** The app's colours right now, read from the page. Browser only. */
export function readTheme(): PluginTheme {
  const style = getComputedStyle(document.documentElement);
  const variables: Record<string, string> = {};
  for (const token of TOKENS) {
    const value = style.getPropertyValue(`--${token}`).trim();
    if (value) variables[token] = value;
  }
  return { dark: document.documentElement.classList.contains("dark"), variables };
}
