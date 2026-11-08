import { Directory, File, Paths } from "expo-file-system";

// Larger things kept on the phone, as files (Android's key-value storage
// can't hold more than about 2 MB in one entry): each project's text, for
// searching offline, and each note's live document, for writing offline.

const root = () => new Directory(Paths.document, "plotra");

function fileFor(name: string): File {
  const dir = root();
  if (!dir.exists) dir.create({ idempotent: true, intermediates: true });
  return new File(dir, name.replace(/[^A-Za-z0-9._-]/g, "_"));
}

export async function readJson<T>(name: string): Promise<T | null> {
  try {
    const file = fileFor(name);
    if (!file.exists) return null;
    return JSON.parse(await file.text()) as T;
  } catch {
    return null;
  }
}

export async function writeJson(name: string, value: unknown): Promise<void> {
  try {
    await fileFor(name).write(JSON.stringify(value));
  } catch {}
}

export function removeFile(name: string) {
  try {
    const file = fileFor(name);
    if (file.exists) file.delete();
  } catch {}
}

/** Everything kept here: on signing out. */
export function clearFiles() {
  try {
    const dir = root();
    if (dir.exists) dir.delete();
  } catch {}
}
