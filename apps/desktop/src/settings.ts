import { readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * What the app remembers on this computer (not in any library): which way the
 * person chose to work, the library they had open, and a port for each library.
 */
export type Settings = {
  /** Unset until the first-run choice is made. */
  mode?: "cloud" | "local";
  library?: string;
  /** Most recent first. */
  recent: string[];
  /**
   * The port each library's server listens on. Kept the same from one launch
   * to the next, because the window's own storage (preferences, the editor's
   * offline copies) belongs to the address, port included.
   */
  ports: Record<string, number>;
};

const empty = (): Settings => ({ recent: [], ports: {} });

export function loadSettings(dir: string): Settings {
  try {
    const raw = JSON.parse(readFileSync(path.join(dir, "settings.json"), "utf8")) as Partial<Settings>;
    return { ...empty(), ...raw, recent: Array.isArray(raw.recent) ? raw.recent : [], ports: raw.ports ?? {} };
  } catch {
    return empty();
  }
}

export function saveSettings(dir: string, settings: Settings) {
  const file = path.join(dir, "settings.json");
  writeFileSync(`${file}.tmp`, JSON.stringify(settings, null, 2));
  renameSync(`${file}.tmp`, file);
}

/** Puts `library` first in the recent list. */
export function rememberLibrary(settings: Settings, library: string): Settings {
  return { ...settings, mode: "local", library, recent: [library, ...settings.recent.filter((dir) => dir !== library)].slice(0, 8) };
}
