// Plugins (beat-the-competitors.md, part 2, item 13): a person's own scripts
// that add commands, panels and export formats to every project they open.
// Each runs in a sandboxed frame in their browser (lib/plugin-sandbox.ts) and
// reaches the project only through the calls listed here, made with the
// person's own access (lib/plugin-actions.ts). A plugin is code someone added
// themselves, from a file or pasted in, or installed from the store
// (lib/plugin-store.ts). Pure, for the browser and the server alike.

/** The most code one plugin may be, in characters. */
export const MAX_PLUGIN_CODE = 500_000;
/** The most plugins one person may keep. */
export const MAX_PLUGINS = 30;

/** What the project calls go to: the API's own functions (lib/api/notes.ts), as the person. */
export const serverMethods = [
  "notes.list",
  "notes.read",
  "notes.search",
  "notes.create",
  "notes.update",
  "notes.write",
  "kinds.list",
  "kinds.add",
  "storage.get",
  "storage.set",
  "storage.delete",
  "storage.keys",
] as const;
export type ServerMethod = (typeof serverMethods)[number];

/** What the app answers itself, in the browser. */
export const browserMethods = ["notes.active", "ui.toast", "ui.download", "ui.openNote", "ui.openPanel"] as const;
export type BrowserMethod = (typeof browserMethods)[number];

/**
 * The calls that change the person's notes: refused to a plugin whose header
 * says `@access read`. A plugin's own storage isn't the person's notes, so
 * every plugin may keep things there.
 */
export const writeMethods: readonly ServerMethod[] = ["notes.create", "notes.update", "notes.write", "kinds.add"];

export type PluginAccess = "read" | "write";

export const isServerMethod = (method: unknown): method is ServerMethod => typeof method === "string" && (serverMethods as readonly string[]).includes(method);
export const isBrowserMethod = (method: unknown): method is BrowserMethod => typeof method === "string" && (browserMethods as readonly string[]).includes(method);

export type PluginHeader = { name: string; description: string; version: string; access: PluginAccess };

const HEADER = /\/\/\s*==Plotra plugin==([\s\S]*?)\/\/\s*==\/Plotra plugin==/i;

/**
 * What a plugin says about itself, in a header like a userscript's, at the
 * top of its code:
 *
 *   // ==Plotra plugin==
 *   // @name        Word frequency
 *   // @description The words you use most, in a panel
 *   // @version     1.0
 *   // @access      read
 *   // ==/Plotra plugin==
 *
 * Empty strings for what it doesn't say. `@access read` means it only reads
 * notes; without it, a plugin may change them too.
 */
export function readPluginHeader(code: string): PluginHeader {
  const out = { name: "", description: "", version: "", access: "" };
  const block = HEADER.exec(String(code ?? "").slice(0, 20_000))?.[1];
  if (block) {
    for (const line of block.split(/\r?\n/)) {
      const match = /^\s*\/\/\s*@(name|description|version|access)\s+(.+?)\s*$/i.exec(line);
      if (!match) continue;
      const key = match[1].toLowerCase() as keyof typeof out;
      if (!out[key]) out[key] = match[2];
    }
  }
  const access: PluginAccess = /^read(-?only)?$/i.test(out.access) ? "read" : "write";
  return { name: out.name.slice(0, 80), description: out.description.slice(0, 300), version: out.version.slice(0, 30), access };
}

/** A plugin's code as it may be kept; throws a message for the person when it can't be. */
export function cleanPluginCode(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) throw new Error("Add the plugin's code: a .js file, or paste it in.");
  // The browser's parser turns these into other characters, and the frame's
  // policy only runs code that is exactly what was hashed (lib/plugin-sandbox.ts).
  const code = raw.replace(/\r\n?/g, "\n");
  if (code.includes("\0")) throw new Error("That file has characters a script can't hold. Is it a .js file?");
  if (code.length > MAX_PLUGIN_CODE) throw new Error(`That's more code than a plugin may be (${Math.round(MAX_PLUGIN_CODE / 1000)} KB).`);
  return code;
}

/** A plugin's name: what it calls itself, else what it was given, else its file's name. */
export function pluginName(code: string, given?: string | null, fileName?: string | null): string {
  const fromFile = fileName ? fileName.replace(/\.(m?js|txt)$/i, "").trim() : "";
  return (readPluginHeader(code).name || String(given ?? "").trim() || fromFile || "Untitled plugin").slice(0, 80);
}

/** An id a plugin gives a command, a panel or an export: short, and safe in a command's id. */
export function cleanPartId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const id = raw.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{0,59}$/.test(id) ? id : null;
}

/** A file name a plugin may save to: no folders, no odd characters, a sensible length. */
export function cleanDownloadName(raw: unknown, fallback = "plugin-export.txt"): string {
  const name = String(raw ?? "")
    .replace(/[/\\?%*:|"<>\u0000-\u001f]/g, "-")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 120);
  return name || fallback;
}

/** The kinds of file a plugin may save. Anything else is saved as plain text. */
export function cleanDownloadType(raw: unknown): string {
  const type = String(raw ?? "").trim().toLowerCase();
  return /^(text\/[a-z0-9.+-]+|application\/(json|xml|rtf|x-[a-z0-9.+-]+|[a-z0-9.+-]+\+(json|xml)))(;\s*charset=utf-8)?$/.test(type) ? type : "text/plain;charset=utf-8";
}

/** The most a plugin may hand over to be saved as a file, in characters. */
export const MAX_DOWNLOAD = 20_000_000;

/** What a plugin hears about through `plotra.on` (components/plugins/plugin-host.tsx). */
export const pluginEvents = ["note.open", "notes.change"] as const;
export type PluginEvent = (typeof pluginEvents)[number];
export const isPluginEvent = (value: unknown): value is PluginEvent => typeof value === "string" && (pluginEvents as readonly string[]).includes(value);

/** The most a plugin may keep through `plotra.storage`, all keys together, as JSON characters. */
export const MAX_STORAGE = 1_000_000;
/** The most one value may be, as JSON characters. */
export const MAX_STORAGE_VALUE = 200_000;
/** The most keys one plugin may keep. */
export const MAX_STORAGE_KEYS = 1000;

/** A key in a plugin's storage: 1 to 200 characters, no control characters. Throws a message for the plugin's author. */
export function cleanStorageKey(raw: unknown): string {
  if (typeof raw !== "string" || !raw || raw.length > 200 || /[\u0000-\u001f]/.test(raw)) throw new Error("A storage key is a string of 1 to 200 characters.");
  return raw;
}

/** A value to keep, as the JSON it's stored as. Throws a message for the plugin's author. */
export function storageValue(raw: unknown): string {
  let json: string | undefined;
  try {
    json = JSON.stringify(raw);
  } catch {
    throw new Error("Storage keeps what JSON can hold: text, numbers, true and false, null, lists and objects.");
  }
  if (json === undefined) throw new Error("Storage keeps what JSON can hold: text, numbers, true and false, null, lists and objects. Use storage.delete to remove a key.");
  if (json.length > MAX_STORAGE_VALUE) throw new Error(`That's too much to keep under one key (${Math.round(MAX_STORAGE_VALUE / 1000)} KB).`);
  return json;
}
