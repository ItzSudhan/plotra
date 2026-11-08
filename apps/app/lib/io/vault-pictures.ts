// Pictures in an Obsidian vault (beat-the-competitors.md, step 3): a note
// shows one with `![[map.png]]` or `![a map](Attachments/map.png)`, and the
// picture is a file of its own somewhere in the vault. An import sends only the
// notes' text; the dialog says which pictures the vault holds (their paths), the
// notes come in with a placeholder where each picture goes, and the dialog then
// uploads the ones that are used, as files of the notes that show them, and
// has the placeholders pointed at them (lib/io/picture-actions.ts). Pure.

/** What a picture's address is until its file is uploaded: never a real URL, so nothing tries to load it. */
export const PENDING_PICTURE = "plotra-import:";

/** Pictures the editor shows and the app serves (never SVG, which can carry script). */
export const PICTURE = /\.(png|jpe?g|gif|webp|avif)$/i;

export const isPendingPicture = (url: unknown): url is string => typeof url === "string" && url.startsWith(PENDING_PICTURE);
export const pendingPath = (url: string) => url.slice(PENDING_PICTURE.length);

const clean = (path: string) =>
  path
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part && part !== ".")
    .reduce<string[]>((parts, part) => (part === ".." ? parts.slice(0, -1) : [...parts, part]), [])
    .join("/");

const decode = (ref: string) => {
  try {
    return decodeURIComponent(ref);
  } catch {
    return ref;
  }
};

/**
 * Finds the vault file a picture reference means, as Obsidian does: a path
 * relative to the note's folder, then a path from the vault's top, then the
 * shortest path that ends with the reference (`![[map.png]]` finds
 * `Attachments/map.png`). Null when the vault has no such picture.
 */
export function pictureFinder(paths: string[]): (ref: string, folder?: string[]) => string | null {
  const all = new Map<string, string>();
  for (const path of paths) if (PICTURE.test(path)) all.set(clean(path).toLowerCase(), clean(path));
  const byEnd = [...all.values()].sort((a, b) => a.split("/").length - b.split("/").length || a.length - b.length);
  return (raw, folder = []) => {
    const ref = clean(decode(raw.split("|")[0].split("#")[0].trim()));
    if (!ref || !PICTURE.test(ref) || /^[a-z][a-z0-9+.-]*:/i.test(raw.trim())) return null;
    const relative = clean([...folder, ref].join("/")).toLowerCase();
    if (all.has(relative)) return all.get(relative)!;
    if (all.has(ref.toLowerCase())) return all.get(ref.toLowerCase())!;
    const tail = `/${ref.toLowerCase()}`;
    return byEnd.find((path) => path.toLowerCase().endsWith(tail)) ?? null;
  };
}
