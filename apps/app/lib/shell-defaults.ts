import type { ProjectSettings, RibbonPrefs, ShellPrefs } from "@plotra/db/schema";
import { cleanRibbon } from "./ribbon";
import { cleanShell } from "./shell-prefs";

// Defaults at three levels (beat-the-competitors.md, part 2, item 12): the
// setup a person sees is their own where they chose one, else their project's
// default, else their workspace's, else the app's. What can have a default is
// what shapes a screen: the page (typeface, size, width, spacing, paragraphs,
// each on its own), the inspector's panels, the project home's blocks, and the
// ribbon. Whoever manages a project (or a workspace) makes their own setup its
// default from Customize. Pure.

export type ShellDefaults = NonNullable<ProjectSettings["shellDefaults"]>;

const hasInspector = (prefs: ShellPrefs["inspector"]) => Boolean(prefs && (prefs.split || prefs.hidden?.length || prefs.order?.length));
const hasHome = (prefs: ShellPrefs["home"]) => Boolean(prefs && (prefs.hidden?.length || prefs.order?.length));
/** Whether a ribbon has been arranged at all, rather than left as the project's track starts it. */
export const hasRibbon = (prefs: RibbonPrefs | undefined) => Boolean(prefs && (prefs.all || prefs.pinned?.length || prefs.hidden?.length || prefs.order?.length));

/** The person's setup with the defaults under it, nearest first (the project's, then the workspace's). */
export function effectiveShell(own: ShellPrefs, ...layers: Array<ShellDefaults | null | undefined>): ShellPrefs {
  const defaults = layers.filter((layer): layer is ShellDefaults => Boolean(layer));
  if (!defaults.length) return own;
  const editor: Record<string, string> = {};
  for (const layer of [...defaults].reverse()) Object.assign(editor, layer.editor);
  Object.assign(editor, own.editor);
  return {
    ...own,
    editor,
    inspector: hasInspector(own.inspector) ? own.inspector : (defaults.find((layer) => hasInspector(layer.inspector))?.inspector ?? own.inspector),
    home: hasHome(own.home) ? own.home : (defaults.find((layer) => hasHome(layer.home))?.home ?? own.home),
  };
}

/** The person's ribbon, or the nearest default one when they haven't arranged theirs. */
export function effectiveRibbon(own: RibbonPrefs, ...layers: Array<ShellDefaults | null | undefined>): RibbonPrefs {
  if (hasRibbon(own)) return own;
  return layers.find((layer) => hasRibbon(layer?.ribbon))?.ribbon ?? own;
}

/** What "make my setup the default" keeps: the parts of a setup a default holds. */
export function defaultsFrom(shell: ShellPrefs, ribbon: RibbonPrefs): ShellDefaults {
  return cleanDefaults({ editor: shell.editor, inspector: shell.inspector, home: shell.home, ribbon });
}

/** Defaults as they arrive from the browser, made safe to store; empty parts left out. */
export function cleanDefaults(input: unknown): ShellDefaults {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const shell = cleanShell({ editor: raw.editor, inspector: raw.inspector, home: raw.home });
  const ribbon = cleanRibbon(raw.ribbon);
  const out: ShellDefaults = {};
  if (shell.editor && Object.keys(shell.editor).length) out.editor = shell.editor as Record<string, string>;
  if (hasInspector(shell.inspector)) out.inspector = shell.inspector;
  if (hasHome(shell.home)) out.home = shell.home;
  if (hasRibbon(ribbon)) out.ribbon = ribbon;
  return out;
}
