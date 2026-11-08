// Which files of a World Anvil export an import needs (beat-the-competitors.md,
// step 3): each article's `.json`, found under a world's `articles/` folder.
// The `.html` copies, pictures and the rest stay behind. Shared by the import
// dialog, which picks them out of a folder or a zip, and the server
// (./worldanvil.ts). Pure, and free of anything server-only.

/** Where an article sits: its world, and the categories above it. Null for a file that isn't an article. */
export function worldAnvilPlace(path: string): { world: string; categories: string[] } | null {
  const parts = path.split(/[/\\]/).filter(Boolean);
  const at = parts.lastIndexOf("articles");
  if (at < 1 || !/\.json$/i.test(parts.at(-1) ?? "")) return null;
  return { world: parts[at - 1], categories: parts.slice(at + 1, -1) };
}

export const isWorldAnvilArticle = (path: string) => worldAnvilPlace(path) !== null;

/** Whether a set of paths is a World Anvil export: articles as JSON under a world's `articles/` folder. */
export const isWorldAnvilExport = (paths: string[]) => paths.some(isWorldAnvilArticle);

export const worldAnvilKeep = isWorldAnvilArticle;
