// The plugin store (plugin-store-plan.md): plugins people publish for each
// other. Publishing makes a listing from one of the author's own plugins;
// installing copies a release's code into the person's own plugins
// (lib/plugins.ts), where it runs sandboxed like any other. Pure, for the
// browser and the server alike.

export const pluginCategories = [
  { id: "writing", label: "Writing tools" },
  { id: "export", label: "Export formats" },
  { id: "panels", label: "Panels and views" },
  { id: "worlds", label: "Worlds and kinds" },
  { id: "stats", label: "Stats and goals" },
  { id: "themes", label: "Themes" },
  { id: "other", label: "Other" },
] as const;
export type PluginCategory = (typeof pluginCategories)[number]["id"];

export const isPluginCategory = (value: unknown): value is PluginCategory => pluginCategories.some((c) => c.id === value);
export const categoryLabel = (id: string) => pluginCategories.find((c) => c.id === id)?.label ?? "Other";

/** The most listings one person may publish. */
export const MAX_LISTINGS = 20;
export const MAX_SUMMARY = 160;
export const MAX_ABOUT = 5000;
export const MAX_NOTES = 2000;

/** What the store says a plugin may do, by its access. */
export const accessLabel = (access: string) => (access === "read" ? "Reads your notes" : "Reads and changes your notes");

/** A slug as a listing's address: 3 to 50 lowercase letters, digits and dashes, starting and ending with a letter or digit. Null when it can't be one. */
export function cleanSlug(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const slug = raw.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(slug) && !slug.includes("--") ? slug : null;
}

/** A slug to suggest from a plugin's name. */
export function slugFromName(name: string): string {
  return String(name ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/, "");
}

/** Text for a listing: trimmed, no control characters but newlines, at most `max` characters. */
export function cleanText(raw: unknown, max: number, { lines = false } = {}): string {
  const text = String(raw ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(lines ? /[\u0000-\u0009\u000b-\u001f\u007f]/g : /[\u0000-\u001f\u007f]+/g, lines ? "" : " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.slice(0, max).trim();
}

/** Whether installing `next` gives a plugin more than it had. */
export const asksForMore = (had: string, next: string) => had === "read" && next !== "read";
