// The editor's formatting shortcuts, which a person can rebind like any
// command (components/workspace/hotkeys-dialog.tsx). Their ids share the
// overrides map with the workspace's commands, under "format.". Pure: the
// editor plugin, the shortcuts sheet and the tests read the same list.

export type FormatAction = { mark: string } | { block: string } | { exit: "after" | "before" };

export type FormatShortcut = { id: string; title: string; keys: string; action: FormatAction };

// Plate's keys for these marks and blocks ("bold", "h1", "blockquote"…), written out so this file stays free of the editor.
export const formatShortcuts: FormatShortcut[] = [
  { id: "format.bold", title: "Bold", keys: "mod+b", action: { mark: "bold" } },
  { id: "format.italic", title: "Italic", keys: "mod+i", action: { mark: "italic" } },
  { id: "format.underline", title: "Underline", keys: "mod+u", action: { mark: "underline" } },
  { id: "format.strikethrough", title: "Strikethrough", keys: "mod+shift+x", action: { mark: "strikethrough" } },
  { id: "format.code", title: "Inline code", keys: "mod+e", action: { mark: "code" } },
  { id: "format.highlight", title: "Highlight", keys: "mod+shift+h", action: { mark: "highlight" } },
  { id: "format.h1", title: "Heading 1", keys: "mod+alt+1", action: { block: "h1" } },
  { id: "format.h2", title: "Heading 2", keys: "mod+alt+2", action: { block: "h2" } },
  { id: "format.h3", title: "Heading 3", keys: "mod+alt+3", action: { block: "h3" } },
  { id: "format.quote", title: "Quote", keys: "mod+shift+.", action: { block: "blockquote" } },
  { id: "format.break-after", title: "New paragraph below the block", keys: "mod+enter", action: { exit: "after" } },
  { id: "format.break-before", title: "New paragraph above the block", keys: "mod+shift+enter", action: { exit: "before" } },
];

/** The keys a formatting shortcut answers to, after the person's changes; undefined when they removed it. */
export function formatKeys(shortcut: FormatShortcut, overrides: Record<string, string | null> | undefined): string | undefined {
  return overrides && shortcut.id in overrides ? (overrides[shortcut.id] ?? undefined) : shortcut.keys;
}

/** The formatting shortcut bound to these keys, if any. */
export function formatFor(hotkey: string, overrides: Record<string, string | null> | undefined): FormatShortcut | undefined {
  return formatShortcuts.find((shortcut) => formatKeys(shortcut, overrides) === hotkey);
}
