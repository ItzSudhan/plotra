// Which files of a Scrivener project an import needs (beat-the-competitors.md,
// step 3). A .scriv folder also holds settings, search indexes, snapshots,
// backups and every research PDF and picture; only the binder and the text are
// read, so only those are sent. Shared by the import dialog, which picks them
// out of a folder or a zip, and the server (./scrivener.ts), which reads them.
// Pure, and free of anything server-only.

/** The binder: `My Novel.scrivx` at the top of the .scriv folder. */
export const isScrivx = (path: string) => /\.scrivx$/i.test(path);

/**
 * A file a Scrivener import reads, by its path inside the .scriv folder:
 * - Scrivener 3: `Files/Data/<UUID>/content.rtf` and `synopsis.txt`
 * - Scrivener 2: `Files/Docs/<ID>.rtf` and `<ID>_synopsis.txt`
 */
export function isScrivenerText(path: string): boolean {
  const parts = path.split(/[/\\]/);
  const [name, parent, grand] = [parts.at(-1) ?? "", parts.at(-2) ?? "", parts.at(-3) ?? ""];
  if (/^data$/i.test(grand) && /^(content\.rtf|synopsis\.txt)$/i.test(name)) return true;
  return /^docs$/i.test(parent) && /^\d+(\.rtf|_synopsis\.txt)$/i.test(name);
}

/** Whether a set of paths is a Scrivener project: it has a .scrivx outside any snapshot or backup. */
export const isScrivenerProject = (paths: string[]) => paths.some((path) => isScrivx(path) && !/(^|[/\\])(snapshots|backups?)[/\\]/i.test(path));

/** The files of a Scrivener project worth sending: the binder and the documents' text. */
export const scrivenerKeep = (path: string) => (isScrivx(path) && !/(^|[/\\])(snapshots|backups?)[/\\]/i.test(path)) || isScrivenerText(path);
