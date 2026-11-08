import type { ScriptFormat } from "@plotra/db/schema";
import { createTSlatePlugin, KEYS, PathApi, type Path, type PluginConfig, type SlateEditor, type TElement } from "platejs";
import type { DocNode } from "@/lib/doc-index";
import {
  ACTION,
  CHARACTER,
  cueName,
  detectElement,
  documentCues,
  emptyReset,
  isBlankElement,
  isScriptElement,
  isScriptFormat,
  isUppercaseElement,
  nextOnEnter,
  PARENTHETICAL,
  speechCue,
  suggestCues,
  tabElement,
  type ScriptElementType,
} from "@/lib/script";

// The keyboard flow of script documents (plan.md 2.3), like Final Draft: Enter
// starts the element that usually comes next, Tab and Shift+Tab change what the
// current line is, and a character cue offers the names already in play. All of
// it is switched off in prose documents (the `format` option), where Enter and
// Tab behave as they always have. No React here, so it can be tested headless.

export const SCRIPT_KEY = "script";

/** The cue being completed: which block, and which suggestion is highlighted. */
export type CueState = { block: string; index: number; moved: boolean };

export type ScriptConfig = PluginConfig<
  typeof SCRIPT_KEY,
  {
    /** The format of the document this editor holds (`node.settings.format`). */
    format: ScriptFormat;
    /** The project's characters (titles and aliases), offered when typing a cue. */
    names: string[];
    cue: CueState | null;
  }
>;

type Current = { node: TElement; path: Path; type: ScriptElementType; paragraph: boolean };

const blockKey = (node: TElement, path: Path) => String(node.id ?? path[0]);

/**
 * The script element the selection is in. Only top-level text blocks count:
 * list items, table cells and callouts keep their own Tab and Enter. A plain
 * paragraph in a script document is treated as action.
 */
function currentElement(editor: SlateEditor, format: ScriptFormat): Current | null {
  if (!isScriptFormat(format) || !editor.selection) return null;
  const blocks = [...editor.api.nodes<TElement>({ match: (n, p) => p.length === 1 && editor.api.isBlock(n) })];
  if (blocks.length !== 1) return null;
  const [node, path] = blocks[0];
  if (node[KEYS.listType] || editor.api.isVoid(node)) return null;
  const lowest = editor.api.block();
  if (!lowest || lowest[1].length !== 1) return null;
  const paragraph = node.type === editor.getType(KEYS.p);
  const type = paragraph ? ACTION : node.type;
  return isScriptElement(type) ? { node, path, type, paragraph } : null;
}

const caretAtEnd = (editor: SlateEditor, { path, type }: Current) => {
  if (!editor.api.isCollapsed() || !editor.selection) return false;
  const after = editor.api.string({ anchor: editor.selection.anchor, focus: editor.api.end(path)! });
  // Inside a parenthetical's closing bracket is the end of what's written.
  return after === "" || (type === PARENTHETICAL && after === ")");
};

/** Turns the block at `path` into another element, keeping its text. */
function setElement(editor: SlateEditor, { path, type: from }: Pick<Current, "path" | "type">, to: ScriptElementType) {
  editor.tf.withoutNormalizing(() => {
    const text = editor.api.string(path);
    // Brackets nobody wrote in go away with the parenthetical.
    if (from === PARENTHETICAL && to !== PARENTHETICAL && isBlankElement(from, text) && text) {
      editor.tf.delete({ at: { anchor: editor.api.start(path)!, focus: editor.api.end(path)! } });
    }
    editor.tf.setNodes({ type: to }, { at: path });
    // Only a cue is marked as dual dialogue.
    if (from === CHARACTER && to !== CHARACTER) editor.tf.unsetNodes("dual", { at: path });
    if (to === PARENTHETICAL && !text) {
      const start = editor.api.start(path)!;
      editor.tf.insertText("()", { at: start });
      editor.tf.select({ path: start.path, offset: 1 });
    }
  });
}

/** Starts a new, empty element after `path` and puts the caret in it (a parenthetical gets its brackets). */
function insertElement(editor: SlateEditor, path: Path, type: ScriptElementType) {
  const at = PathApi.next(path);
  editor.tf.insertNodes({ type, children: [{ text: type === PARENTHETICAL ? "()" : "" }] }, { at, select: true });
  if (type === PARENTHETICAL) editor.tf.select({ path: [...at, 0], offset: 1 });
}

/** The cue suggestions showing right now, or null when the menu is closed. */
export function cueMenu(editor: SlateEditor): { path: Path; items: string[]; index: number; takes: boolean } | null {
  const { format, names, cue } = editor.getOptions(BaseScriptPlugin);
  if (!cue) return null;
  const current = currentElement(editor, format);
  if (!current || current.type !== CHARACTER || blockKey(current.node, current.path) !== cue.block) return null;
  if (!caretAtEnd(editor, current)) return null;
  const query = editor.api.string(current.path);
  const items = suggestCues(query, editor.children as DocNode[], current.path[0], names);
  if (!items.length) return null;
  // Enter and Tab take the highlighted name once the arrows have picked it, or
  // while what's typed is only the start of a name. A name typed out in full
  // ("BOB", with BOBBY also in the list) is left as written.
  const typed = cueName(query);
  const others = (editor.children as DocNode[]).filter((_, i) => i !== current.path[0]);
  const complete = documentCues(others).includes(typed) || names.some((name) => name.trim().toUpperCase() === typed);
  return { path: current.path, items, index: Math.min(cue.index, items.length - 1), takes: cue.moved || (typed.length > 0 && !complete) };
}

/** Moves the highlight in the cue menu. */
export function moveCue(editor: SlateEditor, delta: number) {
  const menu = cueMenu(editor);
  const cue = editor.getOption(BaseScriptPlugin, "cue");
  if (!menu || !cue) return false;
  const index = (menu.index + delta + menu.items.length) % menu.items.length;
  editor.setOption(BaseScriptPlugin, "cue", { ...cue, index, moved: true });
  return true;
}

export function closeCue(editor: SlateEditor) {
  if (editor.getOption(BaseScriptPlugin, "cue")) editor.setOption(BaseScriptPlugin, "cue", null);
}

/** Writes the chosen name into the cue; with `advance`, moves on to the dialogue. */
export function acceptCue(editor: SlateEditor, path: Path, name: string, advance: boolean) {
  const format = editor.getOption(BaseScriptPlugin, "format");
  editor.tf.withoutNormalizing(() => {
    const start = editor.api.start(path)!;
    const end = editor.api.end(path)!;
    if (!PathApi.equals(start.path, end.path) || start.offset !== end.offset) editor.tf.delete({ at: { anchor: start, focus: end } });
    editor.tf.insertText(name, { at: editor.api.start(path)! });
    if (advance) {
      insertElement(editor, path, nextOnEnter(format, CHARACTER));
    } else {
      editor.tf.select(editor.api.end(path)!);
    }
  });
  closeCue(editor);
}

/**
 * Marks the cue of the speech the caret is in as dual dialogue, so it's set
 * beside the speech before it (`dualPairs` in lib/script.ts), or unmarks it.
 * Outside a speech it starts a cue marked dual: the line itself when it's
 * empty, else a new line below. False where there's no script element.
 */
export function toggleDualDialogue(editor: SlateEditor): boolean {
  const current = currentElement(editor, editor.getOption(BaseScriptPlugin, "format"));
  if (!current) return false;
  const cue = speechCue(editor.children as DocNode[], current.path[0]);
  if (cue >= 0 && !current.paragraph) {
    const node = editor.children[cue] as TElement;
    if (node.dual === true) editor.tf.unsetNodes("dual", { at: [cue] });
    else editor.tf.setNodes({ dual: true }, { at: [cue] });
    return true;
  }
  if (isBlankElement(current.type, editor.api.string(current.path))) {
    editor.tf.withoutNormalizing(() => {
      setElement(editor, current, CHARACTER);
      editor.tf.setNodes({ dual: true }, { at: current.path });
    });
  } else {
    const at = PathApi.next(current.path);
    editor.tf.insertNodes({ type: CHARACTER, dual: true, children: [{ text: "" }] }, { at, select: true });
  }
  return true;
}

// Markdown's block shortcuts (lists, quotes, headings, rules), as typed at the start of a line.
const BLOCK_SHORTCUT = /^(?:(?:[-*+]|\d+[.)]|>|#{1,6}|\[ ?\]|\[x\]) |-{3}|_{3})$/i;

export const BaseScriptPlugin = createTSlatePlugin<ScriptConfig>({
  key: SCRIPT_KEY,
  options: { format: "prose", names: [], cue: null },
}).overrideEditor(({ editor, getOptions, setOption, tf: { deleteBackward, insertBreak, insertText, tab } }) => {
  const openCue = () => {
    const current = currentElement(editor, getOptions().format);
    if (current?.type === CHARACTER && !current.paragraph) {
      const block = blockKey(current.node, current.path);
      const cue = getOptions().cue;
      // Only when it changes: an option set on every keystroke re-renders the menu each time.
      if (cue?.block !== block || cue.index) setOption("cue", { block, index: 0, moved: false });
    } else if (getOptions().cue) setOption("cue", null);
  };

  return {
    transforms: {
      insertBreak() {
        const { format } = getOptions();
        const current = currentElement(editor, format);
        if (!current || current.paragraph || !editor.api.isCollapsed()) return insertBreak();

        const menu = cueMenu(editor);
        if (menu?.takes) return acceptCue(editor, menu.path, menu.items[menu.index], true);

        const text = editor.api.string(current.path);
        if (isBlankElement(current.type, text)) {
          // Enter on an empty element backs out of it, as in Final Draft.
          const reset = emptyReset(format, current.type);
          if (reset === current.type) return insertBreak();
          setElement(editor, current, reset);
          return openCue();
        }
        // Mid-line, Enter splits the element in two of the same kind.
        if (!caretAtEnd(editor, current)) return insertBreak();
        insertElement(editor, current.path, nextOnEnter(format, current.type));
        openCue();
      },

      tab(options) {
        const { format } = getOptions();
        const current = currentElement(editor, format);
        // Tab never leaves a script: where it has no other job (a selection across elements), it does nothing.
        if (!current) return tab(options) || isScriptFormat(format);

        const menu = cueMenu(editor);
        if (menu?.takes && !options.reverse) {
          acceptCue(editor, menu.path, menu.items[menu.index], false);
          return true;
        }
        const move = tabElement(format, current.type, {
          reverse: options.reverse,
          blank: isBlankElement(current.type, editor.api.string(current.path)),
          atEnd: caretAtEnd(editor, current),
        });
        if (move.insert) insertElement(editor, current.path, move.type);
        else setElement(editor, current, move.type);
        openCue();
        return true;
      },

      insertText(text, options) {
        const { format } = getOptions();
        const current = options?.at ? null : currentElement(editor, format);
        if (!current || !editor.api.isCollapsed()) return insertText(text, options);

        // A plain paragraph in a script is action as soon as something is typed in it.
        if (current.paragraph && !editor.api.string(current.path)) editor.tf.setNodes({ type: ACTION }, { at: current.path });
        // Fountain's "^" at the end of a cue marks it as dual dialogue rather than going into the name.
        if (text === "^" && current.type === CHARACTER && !current.paragraph && caretAtEnd(editor, current) && editor.api.string(current.path).trim()) {
          toggleDualDialogue(editor);
          return;
        }
        const typed = isUppercaseElement(current.type) && !current.paragraph ? text.toUpperCase() : text;
        const before = editor.api.string({ anchor: editor.api.start(current.path)!, focus: editor.selection!.anchor });
        if (BLOCK_SHORTCUT.test(before + typed)) {
          // "- " or "> " opening a line of script is text, not a list or a quote.
          editor.tf.insertNodes({ text: typed }, { at: editor.selection!.anchor, select: true });
        } else {
          insertText(typed, options);
        }

        // The typing may have turned the block into something else (a markdown shortcut).
        const after = currentElement(editor, format);
        if (!after) return;
        if (caretAtEnd(editor, after)) {
          const detected = detectElement(format, after.type, editor.api.string(after.path));
          if (detected) {
            editor.tf.setNodes({ type: detected }, { at: after.path });
            // What was typed before it was recognised goes into capitals with the rest.
            const written = editor.api.string(after.path);
            if (isUppercaseElement(detected) && written !== written.toUpperCase()) {
              editor.tf.insertText(written.toUpperCase(), { at: { anchor: editor.api.start(after.path)!, focus: editor.api.end(after.path)! } });
              editor.tf.select(editor.api.end(after.path)!);
            }
          }
        }
        openCue();
      },

      deleteBackward(unit) {
        deleteBackward(unit);
        if (isScriptFormat(getOptions().format)) openCue();
      },
    },
  };
});
