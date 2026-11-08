"use client";

import type { ShellPrefs } from "@plotra/db/schema";
import { useEffect, useMemo } from "react";
import { usePrefs } from "@/components/notify/data";
import { updateShell } from "@/lib/notify-actions";
import { setMotion } from "@/lib/motion";
import { livePrefs } from "@/components/editor/live-prefs";
import { cleanOwnSheets, MAX_OWN_SHEETS, type BeatSheet } from "@/lib/beat-sheets";
import { cleanCompile, cleanOwnPresets, MAX_OWN_PRESETS, type CompileOptions } from "@/lib/io/compile";
import { effectiveShell } from "@/lib/shell-defaults";
import { editorStyle, isShown, uiSizeOf } from "@/lib/shell-prefs";
import { setUiSize } from "@/lib/ui-size";
import { useWorkspace } from "./workspace-provider";
import { THEME_KEY, THEME_STYLE_ID, themeCss } from "@/lib/themes";
import { forgetLegacyOverrides, legacyOverrides } from "./hotkeys";
import { Store, useStore } from "./stores";

// The person's own setup of the shell (lib/shell-prefs.ts) as the shell reads
// it: the inspector's tabs, the look of the page, and whether empty notes
// offer a prompt. Saved with their settings, like the ribbon (./ribbon.ts).

/** A change made in this tab, shown at once and kept until the saved copy has caught up. */
const changedHere = new Store<ShellPrefs | null>(null);
let saving = 0;
const none: ShellPrefs = {};

export function useShell() {
  const { data: prefs, refresh } = usePrefs();
  const here = useStore(changedHere);
  const saved = prefs?.shell;
  useEffect(() => {
    if (saved && !saving) changedHere.set(null);
  }, [saved]);
  const shell = here ?? saved ?? none;

  const save = (next: ShellPrefs) => {
    changedHere.set(next);
    saving++;
    void updateShell(next)
      .catch(() => {
        // Offline: it stays as set in this tab and is saved with the next change.
      })
      .finally(() => {
        saving--;
        refresh();
      });
  };
  return { shell, save };
}

/**
 * The setup as the shell draws it: the person's own, with their project's
 * default under it and their workspace's under that (lib/shell-defaults.ts).
 * For reading only: changes are saved to the person's own (`useShell`).
 */
export function useEffectiveShell(): ShellPrefs {
  const { shell } = useShell();
  const { project, workspace } = useWorkspace();
  const projectDefaults = project.settings.shellDefaults;
  const workspaceDefaults = workspace.defaults;
  return useMemo(() => effectiveShell(shell, projectDefaults, workspaceDefaults), [projectDefaults, shell, workspaceDefaults]);
}

/** How the page someone writes on should look: styles for the text and for the column it sits in. */
export function useEditorStyle() {
  const shell = useEffectiveShell();
  return useMemo(() => editorStyle(shell), [shell]);
}

/**
 * Keeps `livePrefs` (for the editor's plugins and toolbar) in step with the
 * person's setup, and moves shortcuts changed before they followed the
 * account out of this browser's storage and into it, once.
 */
export function useLivePrefsSync() {
  const { shell, save } = useShell();
  const { data: prefs } = usePrefs();
  useEffect(() => {
    livePrefs.set(shell);
  }, [shell]);
  const loaded = Boolean(prefs);
  useEffect(() => {
    if (!loaded) return;
    const legacy = legacyOverrides();
    if (!legacy) return;
    forgetLegacyOverrides();
    // What's already saved wins over an older copy from this browser.
    save({ ...shell, hotkeys: { ...legacy, ...shell.hotkeys } });
    // Once, when the saved setup first arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);
}

/**
 * Opens the project as the person asked (Customize → Opening and printing):
 * in focus mode, with typewriter scrolling. Once, when their setup arrives;
 * after that the modes are theirs to toggle.
 */
export function useStartPrefs(setUi: (patch: { focus?: boolean; typewriter?: boolean }) => void) {
  const { data: prefs } = usePrefs();
  const start = prefs?.shell?.start;
  const loaded = Boolean(prefs);
  useEffect(() => {
    if (!loaded || !start) return;
    setUi({ ...(start.focus && { focus: true }), ...(start.typewriter && { typewriter: true }) });
    // Once, when the saved setup first arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);
}

/**
 * The person's shortcut changes, and a way to make more. `change` takes ids to
 * new keys (null: no shortcut) or to undefined (back to the default), all
 * saved at once.
 */
export function useHotkeys() {
  const { shell, save } = useShell();
  const overrides = useMemo(() => shell.hotkeys ?? {}, [shell.hotkeys]);
  const change = (changes: Record<string, string | null | undefined>) => {
    const next = { ...overrides };
    for (const [id, keys] of Object.entries(changes)) {
      if (keys === undefined) delete next[id];
      else next[id] = keys;
    }
    save({ ...shell, hotkeys: next });
  };
  return { overrides, change, reset: () => save({ ...shell, hotkeys: {} }) };
}

/** The story structures the person saved from their own folders (lib/beat-sheets.ts), and keeping or dropping one. */
export function useOwnSheets() {
  const { shell, save } = useShell();
  const sheets = useMemo(() => cleanOwnSheets(shell.beatSheets), [shell.beatSheets]);
  return {
    sheets,
    full: sheets.length >= MAX_OWN_SHEETS,
    add: (sheet: BeatSheet) => save({ ...shell, beatSheets: [...(shell.beatSheets ?? []), sheet] }),
    remove: (id: string) => save({ ...shell, beatSheets: (shell.beatSheets ?? []).filter((s) => s.id !== id) }),
  };
}

/** Export layout settings (lib/io/compile.ts): the last used, the person's presets, and keeping or dropping one. */
export function useCompilePrefs() {
  const { shell, save } = useShell();
  const saved = shell.compile;
  const last = useMemo(() => (saved?.last ? cleanCompile(saved.last) : null), [saved]);
  const presets = useMemo(() => cleanOwnPresets(saved?.presets), [saved]);
  const stored = shell.compile?.presets ?? [];
  return {
    last,
    presets,
    full: presets.length >= MAX_OWN_PRESETS,
    remember: (options: CompileOptions) => save({ ...shell, compile: { ...shell.compile, last: options } }),
    add: (title: string, options: CompileOptions) =>
      save({ ...shell, compile: { ...shell.compile, last: options, presets: [...stored, { id: `own-${crypto.randomUUID().slice(0, 8)}`, title, options }] } }),
    remove: (id: string) => save({ ...shell, compile: { ...shell.compile, presets: stored.filter((p) => p.id !== id) } }),
  };
}

/**
 * Puts the person's theme (lib/themes.ts) in the page, and keeps a copy on this
 * device so the next page has it before it paints (`themeScript`). Waits for
 * the saved setup, so it never wipes the copy with nothing.
 */
export function useThemeSync() {
  const { shell } = useShell();
  const { data: prefs } = usePrefs();
  const css = useMemo(() => themeCss(shell.theme), [shell.theme]);
  useEffect(() => {
    if (!prefs) return;
    let style = document.getElementById(THEME_STYLE_ID) as HTMLStyleElement | null;
    if (css) {
      if (!style) {
        style = document.createElement("style");
        style.id = THEME_STYLE_ID;
        document.head.appendChild(style);
      }
      // As text, never as markup.
      style.textContent = css;
    } else style?.remove();
    try {
      if (css) localStorage.setItem(THEME_KEY, css);
      else localStorage.removeItem(THEME_KEY);
    } catch {
      // Private mode: this page has it; the next one starts plain until it loads.
    }
  }, [css, prefs]);
}

/**
 * A setting a view remembers for the person (ShellPrefs.views), in every
 * project and on every device: the graph's filters, the outline's columns.
 * `clean` turns what was saved into a value, or undefined to use `fallback`.
 */
export function useViewSetting<T>(key: string, fallback: T, clean: (saved: unknown) => T | undefined): [T, (next: T) => void] {
  const { shell, save } = useShell();
  const saved = shell.views?.[key];
  const value = saved === undefined ? fallback : (clean(saved) ?? fallback);
  const set = (next: T) => save({ ...shell, views: { ...shell.views, [key]: next } });
  return [value, set];
}

/** Whether the person kept this piece of the shell (lib/shell-prefs.ts, `hideable`). */
export function useShown(id: string) {
  const { shell } = useShell();
  return isShown(shell, id);
}

/** Brings this device's animations (lib/motion.ts) in line with the person's saved choice, once it has loaded. */
export function useMotionSync() {
  const { data: prefs } = usePrefs();
  const off = prefs ? prefs.shell.motion === false : null;
  useEffect(() => {
    if (off !== null) setMotion(!off);
  }, [off]);
}

/** Brings this device's interface size (lib/ui-size.ts) in line with the person's saved choice, once it has loaded. */
export function useUiSizeSync() {
  const { data: prefs } = usePrefs();
  const { shell } = useShell();
  // A change made in this tab shows at once; before the saved copy arrives, the device's own copy stands.
  const size = prefs ? uiSizeOf(shell) : null;
  useEffect(() => {
    if (size) setUiSize(size);
  }, [size]);
}
