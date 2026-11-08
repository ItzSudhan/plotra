"use client";

import { undoToast } from "@plotra/ui/components/sonner";
import { useShell } from "@/components/workspace/shell-prefs";

// "Hide AI for me": takes the AI button off this person's formatting toolbar
// and AI out of their "/" menu. Customize → Formatting toolbar brings it back.

/** The hide id the AI button has in Customize (lib/shell-prefs.ts). */
export const AI_TOOLBAR_ID = "toolbar.ai";

export function useHideAi() {
  const { shell, save } = useShell();
  return () => {
    const before = shell.hide ?? [];
    if (before.includes(AI_TOOLBAR_ID)) return;
    save({ ...shell, hide: [...before, AI_TOOLBAR_ID] });
    undoToast("AI is hidden for you", () => save({ ...shell, hide: before }), { description: "Customize → Formatting toolbar brings it back." });
  };
}
