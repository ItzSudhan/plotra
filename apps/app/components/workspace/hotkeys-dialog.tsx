"use client";

import { confirm } from "@plotra/ui/components/dialogs";
import { IconButton } from "@plotra/ui/components/icon-button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@plotra/ui/components/dialog";
import { cn } from "@plotra/ui/lib/utils";
import { useEffect, useMemo, useState } from "react";
import { formatKeys, formatShortcuts } from "@/lib/editor-shortcuts";
import { browserReserved, eventToHotkey, formatHotkey } from "./hotkeys";
import { useHotkeys } from "./shell-prefs";
import { useUi, useWorkspace } from "./workspace-provider";
import { plural } from "@/lib/plural";

// What the editor binds that can't be rebound: Plate's own keys and what is
// typed. They're listed so the sheet is the whole answer to "what can I
// press?". The formatting shortcuts (lib/editor-shortcuts.ts) can be, and are
// listed with the commands.
// `keys` in the hotkey notation is formatted per platform; `typed` is shown as written.
type Fixed = { title: string; keys?: string; typed?: string };
const editorShortcuts: Fixed[] = [
  { title: "Insert or edit a web link", keys: "mod+k" },
  { title: "Ask AI about the selection (when AI is on)", keys: "mod+j" },
  { title: "Undo", keys: "mod+z" },
  { title: "Redo", keys: "mod+shift+z" },
  { title: "Insert a block (slash menu)", typed: "/" },
  { title: "Link to a note", typed: "[[" },
  { title: "Link to a heading in a note", typed: "[[Note#" },
  { title: "Link with other words shown", typed: "[[Note|words" },
  { title: "Embed a note", typed: "![[" },
  { title: "Open a link in a new tab", typed: "Ctrl/⌘-click" },
  { title: "Open a link to the side", typed: "Ctrl/⌘+Alt-click" },
  { title: "Tag (typed in the text)", typed: "#name" },
  { title: "Indent or outdent a list item", typed: "Tab / Shift+Tab" },
  { title: "Heading, list, quote or rule as you type", typed: "# , - , 1. , > , ---" },
  { title: "Bold, italic, code, highlight as you type", typed: "**b** , *i* , `c` , ==h==" },
  { title: "Smart quotes, dashes and ellipses", typed: '" \' -- ...' },
  { title: "Script: next or previous element type", typed: "Tab / Shift+Tab" },
];

const groupHeading = "px-2 pt-3 pb-1 text-ui-sm font-medium text-muted-foreground";
const keyClass = "min-w-24 rounded-md border px-2 py-0.5 text-right font-sans text-xs text-muted-foreground";

/**
 * The keyboard shortcuts sheet: every command by group with its shortcut, and
 * the editor's own. Type to search by name, group or key. Click a command's
 * shortcut to rebind it.
 */
export function HotkeysDialog() {
  const { hotkeys } = useUi();
  const { commands, setUi } = useWorkspace();
  const { overrides, change } = useHotkeys();
  // Everything that can be rebound: the workspace's commands, then the editor's formatting.
  const bindable = useMemo(
    () => [
      ...commands.map((command) => ({ id: command.id, title: command.title, group: command.group, hotkey: command.hotkey })),
      ...formatShortcuts.map((shortcut) => ({ id: shortcut.id, title: shortcut.title, group: "Formatting", hotkey: formatKeys(shortcut, overrides) })),
    ],
    [commands, overrides],
  );
  const [recording, setRecording] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  // Why the last keys pressed weren't taken, if they weren't.
  const [notice, setNotice] = useState<string | null>(null);

  /** Gives `id` the keys, after asking before taking them from another command. */
  const bind = async (id: string, hotkey: string) => {
    const keys = formatHotkey(hotkey);
    if (browserReserved(hotkey)) {
      setNotice(`Your browser keeps ${keys} for itself, so it won't reach Plotra. Try another.`);
      return;
    }
    const title = bindable.find((c) => c.id === id)?.title ?? "this command";
    const others = bindable.filter((other) => other.id !== id && other.hotkey === hotkey);
    if (others.length) {
      const names = others.map((other) => `‘${other.title}’`).join(" and ");
      const ok = await confirm({
        title: `‘${keys}’ is already used`,
        description: `It runs ${names}. Use it for ‘${title}’ instead? ${names} will have no shortcut.`,
        confirmLabel: "Use it here",
        destructive: false,
      });
      if (!ok) return;
    }
    // A combo can only belong to one command: unbind whoever had it, in the same save.
    const changes: Record<string, string | null> = { [id]: hotkey };
    for (const other of others) changes[other.id] = null;
    change(changes);
  };

  // While recording, swallow the next key combo and save it.
  useEffect(() => {
    if (!recording) return;
    document.body.dataset.recordingHotkey = "true";
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") return setRecording(null);
      if (e.key === "Backspace" || e.key === "Delete") {
        change({ [recording]: null });
        return setRecording(null);
      }
      const hotkey = eventToHotkey(e);
      if (!hotkey) return;
      setRecording(null);
      void bind(recording, hotkey);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      delete document.body.dataset.recordingHotkey;
      window.removeEventListener("keydown", onKeyDown, true);
    };
    // `bind` is rebuilt every render; the listener only lives while recording.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bindable, change, recording]);

  const query = filter.trim().toLowerCase();
  // Matches the name, the group, or the keys as shown ("⌘P") or as written ("mod+p").
  const matches = (title: string, group: string, keys?: string) =>
    !query || `${title} ${group} ${keys ? `${formatHotkey(keys)} ${keys}` : ""}`.toLowerCase().includes(query);

  const groups = useMemo(() => {
    const names = [...new Set(bindable.map((c) => c.group))];
    return names.map((name) => ({ name, commands: bindable.filter((c) => c.group === name) }));
  }, [bindable]);
  const visibleGroups = groups.map((g) => ({ ...g, commands: g.commands.filter((c) => matches(c.title, g.name, c.hotkey)) })).filter((g) => g.commands.length);
  const visibleEditor = editorShortcuts.filter((s) => matches(s.title, "Editor", s.keys ?? s.typed));
  const count = visibleGroups.reduce((sum, g) => sum + g.commands.length, 0) + visibleEditor.length;

  return (
    <Dialog
      open={hotkeys}
      onOpenChange={(open) => {
        if (!open) {
          setRecording(null);
          setFilter("");
          setNotice(null);
          setUi({ hotkeys: false });
        }
      }}
    >
      <DialogContent className="gap-3 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Click a shortcut, then press the new keys. Backspace removes it, Escape cancels. Your shortcuts follow you to every device.</DialogDescription>
        </DialogHeader>
        {notice && (
          <p role="alert" className="rounded-md bg-gold/15 px-3 py-2 text-ui-sm text-gold-ink">
            {notice}
          </p>
        )}
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search by name or key…"
          aria-label="Search shortcuts"
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm outline-none placeholder:text-faint focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        <p role="status" className="sr-only">
          {count} {plural(count, "shortcut")} shown
        </p>
        <div className="-mx-2 max-h-[55vh] overflow-y-auto">
          {count === 0 && <p className="px-2 py-8 text-center text-sm text-muted-foreground">Nothing matches “{filter.trim()}”.</p>}
          {visibleGroups.map((group) => (
            <section key={group.name} aria-label={group.name}>
              <h3 className={groupHeading}>{group.name}</h3>
              <ul>
                {group.commands.map((command) => (
                  <li key={command.id} className="flex min-h-9 items-center gap-2 rounded-md px-2 text-sm hover:bg-accent/60">
                    <span className="flex-1 truncate">{command.title}</span>
                    {command.id in overrides && (
                      <IconButton icon="restart-linear" size="xs" label={`Put ${command.title} back to its default shortcut`} onClick={() => change({ [command.id]: undefined })} />
                    )}
                    <button
                      type="button"
                      aria-label={`${command.title}: ${command.hotkey ? formatHotkey(command.hotkey) : "no shortcut"}. Change it.`}
                      onClick={() => {
                        setNotice(null);
                        setRecording(command.id);
                      }}
                      className={cn(keyClass, "hover:border-foreground/30", recording === command.id && "border-ember text-ember-ink")}
                    >
                      {recording === command.id ? "Press keys…" : command.hotkey ? formatHotkey(command.hotkey) : "None"}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {visibleEditor.length > 0 && (
            <section aria-label="Editor">
              <h3 className={groupHeading}>Editor (fixed)</h3>
              <ul>
                {visibleEditor.map((s) => (
                  <li key={s.title} className="flex min-h-9 items-center gap-2 rounded-md px-2 text-sm">
                    <span className="flex-1 truncate">{s.title}</span>
                    <kbd className={cn(keyClass, "border-transparent")}>{s.keys ? formatHotkey(s.keys) : s.typed}</kbd>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
