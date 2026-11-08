"use client";

import { Icon, type IconName } from "@plotra/icons";
import { cn } from "@plotra/ui/lib/utils";
import { KEYS } from "platejs";
import { useEditorRef, type PlateEditor } from "platejs/react";
import { useEffect, useState } from "react";
import { useMedia, WIDE_ENOUGH_FOR_BINDER } from "@/components/workspace/use-media";
import { getBlockType, setBlockType } from "./transforms";

// Writing on a phone (beat-the-competitors.md, step 2): the toolbar that floats
// over a selection is awkward with a finger, and the keyboard takes half the
// screen. While someone writes in a note on a phone, this bar sits just above
// the on-screen keyboard: bold, italic, a heading, a list, a link to a note,
// undo, redo, and Done to put the keyboard away.

/** How far the on-screen keyboard reaches up from the bottom of the window. */
function useKeyboardInset(active: boolean) {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!active || !viewport) return;
    const update = () => setInset(Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop));
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, [active]);
  return inset;
}

const currentType = (editor: PlateEditor) => {
  const entry = editor.api.block();
  return entry ? getBlockType(entry[0]) : null;
};

export function PhoneWritingBar({ active }: { active: boolean }) {
  const editor = useEditorRef();
  const wide = useMedia(WIDE_ENOUGH_FOR_BINDER, true);
  const touch = useMedia("(pointer: coarse)", false);
  const phone = !wide && touch;
  const shown = active && phone;
  const inset = useKeyboardInset(shown);
  if (!shown) return null;

  const button = (label: string, icon: IconName, run: () => void) => (
    <button
      key={label}
      type="button"
      aria-label={label}
      // Pressing a button must not take the caret out of the text, or the keyboard closes.
      onPointerDown={(event) => event.preventDefault()}
      onClick={run}
      className="grid size-10 shrink-0 place-items-center rounded-md text-muted-foreground active:bg-accent active:text-foreground"
    >
      <Icon name={icon} className="size-5" />
    </button>
  );
  const toggle = (type: string) => setBlockType(editor, currentType(editor) === type ? KEYS.p : type);

  return (
    <div
      role="toolbar"
      aria-label="Writing"
      style={{ bottom: inset }}
      className={cn("fixed inset-x-0 z-40 flex items-center gap-0.5 overflow-x-auto border-t bg-background/95 px-1 py-0.5 backdrop-blur [scrollbar-width:none] print:hidden")}
    >
      {button("Bold", "text-bold-linear", () => editor.tf.toggleMark(KEYS.bold))}
      {button("Italic", "text-italic-linear", () => editor.tf.toggleMark(KEYS.italic))}
      {button("Heading", "text-linear", () => toggle(KEYS.h2))}
      {button("List", "list-linear", () => toggle(KEYS.ul))}
      {button("Link a note", "link-round-linear", () => {
        // Two brackets open the list of notes, as typing them does (./wiki-links.tsx).
        editor.tf.insertText("[");
        editor.tf.insertText("[");
      })}
      <span className="mx-0.5 h-6 w-px shrink-0 bg-border" />
      {button("Undo", "undo-left-linear", () => editor.undo())}
      {button("Redo", "undo-right-linear", () => editor.redo())}
      <button
        type="button"
        onPointerDown={(event) => event.preventDefault()}
        onClick={() => {
          editor.tf.blur();
          (document.activeElement as HTMLElement | null)?.blur();
        }}
        className="ml-auto h-10 shrink-0 rounded-md px-3 text-sm font-medium text-ember-ink active:bg-accent"
      >
        Done
      </button>
    </div>
  );
}
