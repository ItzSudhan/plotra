"use client";

import { cn } from "@plotra/ui/lib/utils";
import { useEditorReadOnly, useEditorRef, useEditorVersion, useFocused, usePluginOption, useSelectionVersion } from "platejs/react";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useStore } from "@/components/workspace/stores";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { flatten } from "@/lib/tree";
import { acceptCue, BaseScriptPlugin, closeCue, cueMenu } from "./flow";

/**
 * Character-name autocomplete (plan.md 2.3): while a cue is typed, a small
 * list at the caret offers the characters already speaking in this document
 * and the project's character notes. Arrows move, Enter takes the name and
 * starts the dialogue, Tab takes it and stays on the cue (for a "(V.O.)").
 */
export function CharacterMenu() {
  const editor = useEditorRef();
  const readOnly = useEditorReadOnly();
  const focused = useFocused();
  const { binder } = useWorkspace();
  const { index } = useStore(binder);
  const cue = usePluginOption(BaseScriptPlugin, "cue");
  // The menu depends on the text and the caret, so follow both.
  useEditorVersion();
  useSelectionVersion();

  // The project's characters, by title and alias.
  const names = useMemo(
    () =>
      flatten(index)
        .filter((n) => n.kind === "character")
        .flatMap((n) => [n.title, ...n.aliases]),
    [index],
  );
  useEffect(() => {
    editor.setOption(BaseScriptPlugin, "names", names);
  }, [editor, names]);

  const menu = cue && focused && !readOnly ? cueMenu(editor) : null;

  // Leaving the cue (another block, or the caret moved back into the name) closes the menu for good.
  useEffect(() => {
    if (cue && !menu) closeCue(editor);
  }, [cue, editor, menu]);

  // Sits under the caret; an empty cue has no caret rectangle, so its block stands in.
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !menu) return;
    const selection = window.getSelection();
    let rect = selection?.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : null;
    if (!rect?.height) {
      const block = editor.api.node(menu.path)?.[0];
      rect = (block && editor.api.toDOMNode(block)?.getBoundingClientRect()) ?? null;
    }
    if (!rect) return;
    const top = rect.bottom + 6;
    // Above the line when there's no room below.
    el.style.top = `${top + el.offsetHeight > window.innerHeight - 8 ? Math.max(8, rect.top - el.offsetHeight - 6) : top}px`;
    el.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - el.offsetWidth - 8))}px`;
  });

  if (!menu) return null;
  return createPortal(
    <div
      ref={ref}
      role="listbox"
      aria-label="Characters"
      className="fixed z-500 max-h-[240px] min-w-40 max-w-[280px] overflow-y-auto rounded-md border bg-popover py-1 font-sans text-popover-foreground shadow-md print:hidden"
    >
      {menu.items.map((name, i) => (
        <button
          key={name}
          type="button"
          role="option"
          aria-selected={i === menu.index}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => acceptCue(editor, menu.path, name, false)}
          className={cn(
            "mx-1 flex h-7 w-[calc(100%-0.5rem)] items-center rounded-sm px-2 text-left text-ui-sm hover:bg-accent",
            // Highlighted only when Enter would take it.
            i === menu.index && menu.takes && "bg-accent",
          )}
        >
          <span className="truncate">{name}</span>
        </button>
      ))}
    </div>,
    document.body,
  );
}
