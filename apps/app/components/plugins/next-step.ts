"use client";

import { formatHotkey } from "@/components/workspace/hotkeys";

/**
 * What to do after adding a plugin, said where the person is looking. The
 * command palette's shortcut is ⌘P / Ctrl+P (workspace-provider.tsx, "palette.commands").
 */
export const pluginNextStep = () => `Open a project (or reload one that's open) and press ${formatHotkey("mod+p")} to find its commands.`;
