"use client";

import { insertCallout } from "@platejs/callout";
import { triggerFloatingLink } from "@platejs/link/react";
import { TablePlugin } from "@platejs/table/react";
import { KEYS, PathApi, type NodeEntry, type Path, type TElement } from "platejs";
import type { PlateEditor } from "platejs/react";
import { insertImageFromPicker } from "./image-insert";

// Adapted from Plate UI's transforms (platejs.org/r/transforms).

const insertList = (editor: PlateEditor, type: string) => {
  editor.tf.insertNodes(editor.api.create.block({ indent: 1, listStyleType: type }), { select: true });
};


const insertBlockMap: Record<string, (editor: PlateEditor, type: string) => void> = {
  [KEYS.listTodo]: insertList,
  [KEYS.ol]: insertList,
  [KEYS.ul]: insertList,
  [KEYS.callout]: (editor) => insertCallout(editor, { select: true }),
  [KEYS.table]: (editor) => editor.getTransforms(TablePlugin).insert.table({ colCount: 3, rowCount: 3 }, { select: true }),
};

export const getBlockType = (block: TElement) => {
  if (block[KEYS.listType]) {
    if (block[KEYS.listType] === KEYS.ol) return KEYS.ol;
    if (block[KEYS.listType] === KEYS.listTodo) return KEYS.listTodo;
    return KEYS.ul;
  }
  return block.type;
};

/** Inserts a block after the current one; an empty current block is replaced. */
export const insertBlock = (editor: PlateEditor, type: string) => {
  // A picture is chosen in a dialog first, and goes in when it's picked.
  if (type === KEYS.img) return insertImageFromPicker(editor);
  editor.tf.withoutNormalizing(() => {
    const block = editor.api.block();
    if (!block) return;
    const [currentNode, path] = block;
    const isCurrentBlockEmpty = editor.api.isEmpty(currentNode);
    const isSameBlockType = type === getBlockType(currentNode);
    if (isCurrentBlockEmpty && isSameBlockType) return;

    if (type === KEYS.blockquote) {
      const insertPath = PathApi.next(path);
      editor.tf.insertNodes({ type: KEYS.blockquote, children: [editor.api.create.block({ type: KEYS.p })] }, { at: insertPath });
      if (isCurrentBlockEmpty) editor.tf.removeNodes({ at: path });
      const start = editor.api.start((isCurrentBlockEmpty ? path : insertPath).concat([0]));
      if (start) editor.tf.select(start);
      return;
    }

    if (type in insertBlockMap) insertBlockMap[type](editor, type);
    else editor.tf.insertNodes(editor.api.create.block({ type }), { at: PathApi.next(path), select: true });

    if (!isSameBlockType) editor.tf.removeNodes({ previousEmptyBlock: true });
  });
};

export const insertLink = (editor: PlateEditor) => triggerFloatingLink(editor, { focused: true });

const setList = (editor: PlateEditor, type: string, entry: NodeEntry<TElement>) => {
  editor.tf.setNodes(editor.api.create.block({ indent: 1, listStyleType: type }), { at: entry[1] });
};

/** Turns the selected blocks into `type`. */
export const setBlockType = (editor: PlateEditor, type: string, { at }: { at?: Path } = {}) => {
  editor.tf.withoutNormalizing(() => {
    if (type === KEYS.blockquote) {
      const target = at ?? editor.selection;
      if (!target || editor.api.some({ at: target, match: { type } })) return;
      editor.tf.toggleBlock(type, { ...(at ? { at } : {}), wrap: true });
      return;
    }

    const setEntry = (entry: NodeEntry<TElement>) => {
      const [node, path] = entry;
      if (node[KEYS.listType]) editor.tf.unsetNodes([KEYS.listType, "indent"], { at: path });
      if (type === KEYS.ul || type === KEYS.ol || type === KEYS.listTodo) return setList(editor, type, entry);
      if (node.type !== type) editor.tf.setNodes({ type }, { at: path });
    };

    if (at) {
      const entry = editor.api.node<TElement>(at);
      if (entry) return setEntry(entry);
    }
    editor.api.blocks({ mode: "lowest" }).forEach(setEntry);
  });
};
