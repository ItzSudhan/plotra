"use client";

import type { ShellPrefs } from "@plotra/db/schema";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { chooseTheme, chosenKey, refreshedPluginTheme, themeChoices, type PluginThemePart, type Theme } from "@/lib/themes";
import { useShell } from "./shell-prefs";
import { useStore, type Store } from "./stores";
import type { PluginPart } from "@/components/plugins/plugin-registry";

// Picking a theme (lib/themes.ts), wherever it's offered: Customize → Look,
// the account menu and All commands. Plugins' themes are there when the open
// project runs them; the one in use is kept either way.

const noParts: readonly PluginThemePart[] = [];

export function useThemes(parts: readonly PluginThemePart[] = noParts) {
  const { shell, save } = useShell();
  const theme = shell.theme as Theme | undefined;
  const choices = useMemo(() => themeChoices(theme, parts), [theme, parts]);
  const setTheme = (next: Theme | undefined) => save({ ...shell, theme: next as ShellPrefs["theme"] });
  // The same function from render to render, for lists of commands made once.
  const latest = useRef({ shell, save, parts });
  useEffect(() => {
    latest.current = { shell, save, parts };
  });
  const choose = useCallback((key: string) => {
    const { shell: now, save: keep, parts: running } = latest.current;
    keep({ ...now, theme: chooseTheme(now.theme as Theme | undefined, key, running) as ShellPrefs["theme"] });
  }, []);
  return { theme, choices, chosen: chosenKey(theme), choose, setTheme };
}

/** The themes the open project's plugins registered. */
export function usePluginThemes(store: Store<PluginPart[]>): PluginThemePart[] {
  const parts = useStore(store);
  return useMemo(() => parts.filter((part) => part.what === "theme"), [parts]);
}

/** Brings the copy of the plugin theme in use up to date when its plugin, running here, registers it differently. */
export function usePluginThemeRefresh(parts: readonly PluginThemePart[]) {
  const { shell, save } = useShell();
  useEffect(() => {
    const next = refreshedPluginTheme(shell.theme as Theme | undefined, parts);
    if (next !== null) save({ ...shell, theme: next as ShellPrefs["theme"] });
    // Only when what the plugins registered changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parts]);
}
