import type { ScriptFormat } from "@plotra/db/schema";
import { PathApi, RangeApi, type SlateEditor, type TElement, type TRange } from "platejs";
import { MAX_AFTER, MAX_BEFORE } from "@/lib/agent/inline";
import { blockShape, blocksToText, textToBlocks } from "@/lib/agent/inline-text";
import type { InlineAction } from "@/lib/agent/types";
import type { DocNode } from "@/lib/doc-index";
import { CHARACTER, isScriptElement, nextOnEnter, scriptHeadingLevels, TRANSITION } from "@/lib/script";

// The two places the inline actions touch the document (plan.md 2.11 "Inline
// in the editor"): reading the selection and what surrounds it, and putting
// the accepted answer in. Kept apart from the popover so they can be run
// against an editor without a browser.

/** What is sent with a request: the selection and the text around it. */
export function gatherContext(editor: SlateEditor, range: TRange, action: InlineAction, titleOf: (id: string) => string | null) {
  const top = editor.children as DocNode[];
  const [start, end] = RangeApi.edges(range);
  // Continuing picks up at the end of whatever is selected.
  const from = action === "continue" ? end : start;
  const firstBlock = from.path[0];
  const lastBlock = end.path[0];

  const before: string[] = [];
  let length = 0;
  const head = editor.api.string({ anchor: editor.api.start([firstBlock])!, focus: from });
  for (let i = firstBlock - 1; i >= 0 && length < MAX_BEFORE; i--) {
    const text = blocksToText([top[i]], titleOf);
    if (!text) continue;
    before.unshift(text);
    length += text.length;
  }
  if (head.trim()) before.push(head);

  const after: string[] = [];
  const tail = editor.api.string({ anchor: end, focus: editor.api.end([lastBlock])! });
  if (tail.trim()) after.push(tail);
  for (let i = lastBlock + 1; i < top.length && after.join("\n\n").length < MAX_AFTER; i++) {
    const text = blocksToText([top[i]], titleOf);
    if (text) after.push(text);
  }

  return {
    selection: action === "continue" ? "" : blocksToText(editor.api.fragment(range) as DocNode[], titleOf),
    before: before.join("\n\n"),
    after: after.join("\n\n"),
  };
}

/**
 * The kind of block that follows `block` when a continuation starts a new one:
 * body text after a heading, and in a script whatever Enter would start there
 * (dialogue after a character cue, action after a scene heading).
 */
function followingShape(block: DocNode, format: ScriptFormat): Record<string, unknown> {
  const type = typeof block.type === "string" ? block.type : "p";
  if (isScriptElement(type)) return { type: nextOnEnter(format, type) };
  return blockShape(block);
}

/** Headings and cues are complete as they stand: what continues them goes underneath, never inside. */
const standsAlone = (type: unknown) =>
  typeof type === "string" && (/^h[1-6]$/.test(type) || type in scriptHeadingLevels || type === CHARACTER || type === TRANSITION);

/**
 * Puts the accepted text into the document as one edit: one undo step, and a
 * tracked suggestion when the editor is in suggesting mode. `format` is the
 * note's script format, which decides what follows a script element.
 */
export function applyAnswer(
  editor: SlateEditor,
  range: TRange,
  action: InlineAction,
  answer: string,
  noteByTitle: (title: string) => string | null,
  format: ScriptFormat = "prose",
) {
  editor.tf.withoutNormalizing(() => {
    if (action !== "continue") {
      // Each new paragraph takes the kind of the block it replaces (a list item stays a list item).
      const shapes = [...editor.api.blocks<TElement>({ at: range, mode: "lowest" })].map(([block]) => blockShape(block as DocNode));
      const blocks = textToBlocks(answer, shapes, noteByTitle) as TElement[];
      if (!blocks.length) return;
      editor.tf.select(range);
      editor.tf.insertFragment(blocks);
      return;
    }
    const point = RangeApi.end(range);
    const entry = editor.api.block({ at: point });
    if (!entry) return;
    const [block, path] = entry;
    const written = editor.api.string({ anchor: editor.api.start(path)!, focus: point });
    const rest = editor.api.string({ anchor: point, focus: editor.api.end(path)! });
    // After a finished sentence at the end of a paragraph (or under a heading), what comes next is new paragraphs.
    const below = written.trim() !== "" && !rest.trim() && (standsAlone(block.type) || /[.!?…"”’)\]]\s*$/.test(written));
    if (below) {
      const blocks = textToBlocks(answer, [followingShape(block as DocNode, format)], noteByTitle) as TElement[];
      if (blocks.length) editor.tf.insertNodes(blocks, { at: PathApi.next(path), select: true });
      return;
    }
    // Otherwise it carries on in the same paragraph, from the cursor.
    const blocks = textToBlocks(answer, [blockShape(block as DocNode)], noteByTitle) as TElement[];
    if (!blocks.length) return;
    const first = blocks[0].children[0] as { text?: string };
    if (written && !/\s$/.test(written) && typeof first.text === "string" && !/^[\s,.;:!?’”)]/.test(first.text)) first.text = ` ${first.text}`;
    editor.tf.select(point);
    editor.tf.insertFragment(blocks);
  });
}
