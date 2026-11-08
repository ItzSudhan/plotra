"use client";

import type { ShellPrefs } from "@plotra/db/schema";
import { Store, useStore } from "@/components/workspace/stores";

// The person's setup (ShellPrefs), mirrored for code that runs outside the
// workspace's React tree: editor plugins read it on each key press, and the
// formatting toolbar renders on shared pages too, where it is simply empty and
// everything is at its default. The workspace keeps it current
// (components/workspace/shell-prefs.ts, useLivePrefsSync).

export const livePrefs = new Store<ShellPrefs>({});

export const useLivePrefs = () => useStore(livePrefs);
