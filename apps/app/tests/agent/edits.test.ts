import { expect, test } from "bun:test";
import { slateNodesToInsertDelta, yTextToSlateElement } from "@slate-yjs/core";
import * as Y from "yjs";
import { applyEdits, blockIds, cursorAt, ensureBlockIds, replaceAll, restoreValue, rootOf, textToBlocks, type EditOptions } from "@/lib/agent/edits";

// The agent's edits to a document (lib/agent/edits.ts), on a real Y.Doc of the
// shape the editor binds.

type Node = Record<string, unknown> & { children?: Node[] };

const make = (value: Node[]) => {
  const doc = new Y.Doc();
  rootOf(doc).applyDelta(slateNodesToInsertDelta(value as never));
  return doc;
};
const value = (doc: Y.Doc) => yTextToSlateElement(rootOf(doc)).children as unknown as Node[];
const text = (node: Node): string => (typeof node.text === "string" ? node.text : (node.children ?? []).map(text).join(""));
const direct: EditOptions = { suggest: null, resolveLink: (title) => (title === "Mara" ? "node-mara" : null) };
const stamp = { id: "s1", userId: "agent:u1", createdAt: 1 };

const scene = () =>
  make([
    { type: "h2", id: "a", children: [{ text: "Arrival" }] },
    { type: "p", id: "b", canon: "canon", children: [{ text: "Mara walked " }, { text: "home", bold: true }, { text: "." }] },
    { type: "p", id: "c", children: [{ text: "The door was open." }] },
  ]);

test("replace keeps the block's id and tags, and only that block changes", () => {
  const doc = scene();
  const result = applyEdits(doc, [{ op: "replace", blockId: "b", text: "Mara ran home." }], direct);
  expect(result.problems).toEqual([]);
  const blocks = value(doc);
  expect(blocks.map((b) => b.id)).toEqual(["a", "b", "c"]);
  expect(blocks[1].canon).toBe("canon");
  expect(text(blocks[1])).toBe("Mara ran home.");
  expect(text(blocks[2])).toBe("The door was open.");
});

test("a block id echoed in front of the text is dropped, and marks become formatting and links", () => {
  const doc = scene();
  applyEdits(doc, [{ op: "replace", blockId: "b", text: "[b] [[Mara]] ran **fast** to [[Nowhere]]." }], direct);
  const block = value(doc)[1];
  expect(text(block)).toBe(" ran fast to Nowhere.");
  expect(block.children?.some((c) => c.type === "wikilink" && c.nodeId === "node-mara")).toBe(true);
  expect(block.children?.some((c) => c.bold === true && c.text === "fast")).toBe(true);
});

test("insert and delete address blocks by id; an unknown id is reported and the rest still apply", () => {
  const doc = scene();
  const result = applyEdits(
    doc,
    [
      { op: "insert", after: "a", text: "- one\n## Two" },
      { op: "delete", blockId: "zzz" },
      { op: "delete", blockId: "c" },
      { op: "insert", after: "end", text: "The end." },
    ],
    direct,
  );
  expect(result.problems).toHaveLength(1);
  const blocks = value(doc);
  expect(blocks.map(text)).toEqual(["Arrival", "one", "Two", "Mara walked home.", "The end."]);
  expect(blocks[1].listStyleType).toBe("disc");
  expect(blocks[2].type).toBe("h2");
  expect(new Set(blocks.map((b) => b.id)).size).toBe(blocks.length);
});

test("in Suggest mode nothing is removed: old text is marked for removal and new text for insertion, under one suggestion", () => {
  const doc = scene();
  applyEdits(doc, [{ op: "replace", blockId: "c", text: "The door was shut." }, { op: "delete", blockId: "a" }, { op: "insert", after: "c", text: "She knocked." }], { ...direct, suggest: stamp });
  const blocks = value(doc);
  const kinds = (block: Node) => (block.children ?? []).map((leaf) => (leaf.suggestion_s1 as { type: string } | undefined)?.type);
  const c = blocks.find((b) => b.id === "c")!;
  expect(kinds(c)).toEqual(["remove", "insert"]);
  expect((blocks.find((b) => b.id === "a")!.suggestion as { type: string }).type).toBe("remove");
  const added = blocks.find((b) => text(b) === "She knocked.")!;
  expect((added.suggestion as { type: string; userId: string }).type).toBe("insert");
  expect((added.suggestion as { userId: string }).userId).toBe("agent:u1");
});

test("the edit travels as an update that merges into another copy of the document", () => {
  const live = scene();
  const copy = new Y.Doc();
  Y.applyUpdate(copy, Y.encodeStateAsUpdate(live));
  const before = Y.encodeStateVector(copy);
  // Someone types in the live document while the agent works on its copy.
  applyEdits(live, [{ op: "insert", after: "end", text: "Typed by a person." }], direct);
  applyEdits(copy, [{ op: "replace", blockId: "a", text: "## Departure" }], direct);
  Y.applyUpdate(live, Y.encodeStateAsUpdate(copy, before));
  expect(value(live).map(text)).toEqual(["Departure", "Mara walked home.", "The door was open.", "Typed by a person."]);
});

test("writing into an empty note replaces its empty paragraph; replaceAll and restoreValue swap the whole text", () => {
  const doc = make([{ type: "p", id: "e", children: [{ text: "" }] }]);
  applyEdits(doc, [{ op: "insert", after: "end", text: "First words." }], direct);
  expect(value(doc).map(text)).toEqual(["First words."]);
  replaceAll(doc, "# Title\nBody", direct);
  expect(value(doc).map((b) => b.type)).toEqual(["h1", "p"]);
  restoreValue(doc, [{ type: "p", id: "q", children: [{ text: "restored" }] }]);
  expect(value(doc).map(text)).toEqual(["restored"]);
});

test("blocks without ids get one, script lines keep their element, and the cursor lands in the edited block", () => {
  const doc = make([{ type: "p", children: [{ text: "no id" }] }]);
  expect(ensureBlockIds(doc)).toBe(1);
  const [id] = [...blockIds(doc)];
  expect(cursorAt(doc, id)).not.toBeNull();
  expect(cursorAt(doc, "missing")).toBeNull();
  const blocks = textToBlocks("(scene heading) INT. KITCHEN - NIGHT\nShe waits.", { ...direct, defaultType: "action" });
  expect(blocks.map((b) => b.type)).toEqual(["scene_heading", "action"]);
});

test("a rewrite of plain text changes only the words that differ, so someone typing in that block keeps their keystrokes", () => {
  const agent = scene();
  const writer = new Y.Doc();
  Y.applyUpdate(writer, Y.encodeStateAsUpdate(agent));
  const blockC = (doc: Y.Doc) => {
    const delta = rootOf(doc).toDelta() as Array<{ insert: unknown }>;
    return delta.map((op) => op.insert).filter((insert): insert is Y.XmlText => insert instanceof Y.XmlText)[2];
  };
  const before = blockC(agent);

  // At the same moment: the agent rewrites the block, and the writer types at its end.
  applyEdits(agent, [{ op: "replace", blockId: "c", text: "The door was shut." }], direct);
  const typed = blockC(writer);
  typed.insert(typed.length, " Rain fell.");

  Y.applyUpdate(agent, Y.encodeStateAsUpdate(writer));
  Y.applyUpdate(writer, Y.encodeStateAsUpdate(agent));
  expect(blockC(agent)).toBe(before);
  for (const doc of [agent, writer]) expect(text(value(doc)[2])).toBe("The door was shut. Rain fell.");
});

test("a rewrite that brings marks or links changes the block in place too", () => {
  const doc = scene();
  const elementC = () => (rootOf(doc).toDelta() as Array<{ insert: unknown }>).map((op) => op.insert).filter((insert) => insert instanceof Y.XmlText)[2];
  const before = elementC();
  applyEdits(doc, [{ op: "replace", blockId: "c", text: "[[Mara]] found the door **shut**." }], direct);
  expect(elementC()).toBe(before);
  const block = value(doc)[2];
  expect(block.id).toBe("c");
  expect(text(block)).toBe(" found the door shut.");
  expect(block.children?.find((c) => c.type === "wikilink")).toMatchObject({ nodeId: "node-mara" });
  expect(block.children?.filter((c) => c.bold).map((c) => c.text)).toEqual(["shut"]);
});

test("words the model left as they were keep formatting it can't write, and new words don't take on their neighbours' marks", () => {
  const doc = make([
    { type: "p", id: "u", children: [{ text: "Old " }, { text: "words", underline: true }, { text: " here, " }, { text: "home", bold: true }, { text: "." }] },
  ]);
  applyEdits(doc, [{ op: "replace", blockId: "u", text: "Old words there, **home** now." }], direct);
  const [block] = value(doc);
  expect(text(block)).toBe("Old words there, home now.");
  expect(block.children?.find((c) => c.underline)).toMatchObject({ text: "words" });
  expect(block.children?.filter((c) => c.bold).map((c) => c.text)).toEqual(["home"]);
  expect(block.children?.some((c) => typeof c.text === "string" && c.text.includes("now") && (c.bold || c.underline))).toBe(false);
});

test("someone typing in a block while the agent adds a link to it keeps their keystrokes", () => {
  const agent = scene();
  const writer = new Y.Doc();
  Y.applyUpdate(writer, Y.encodeStateAsUpdate(agent));
  const blockC = (doc: Y.Doc) => (rootOf(doc).toDelta() as Array<{ insert: unknown }>).map((op) => op.insert).filter((insert): insert is Y.XmlText => insert instanceof Y.XmlText)[2];
  applyEdits(agent, [{ op: "replace", blockId: "c", text: "The door [[Mara]] left was open." }], direct);
  const typed = blockC(writer);
  typed.insert(typed.length, " Rain fell.");
  Y.applyUpdate(agent, Y.encodeStateAsUpdate(writer));
  Y.applyUpdate(writer, Y.encodeStateAsUpdate(agent));
  for (const doc of [agent, writer]) {
    expect(text(value(doc)[2])).toBe("The door  left was open. Rain fell.");
    expect(value(doc)[2].children?.some((c) => c.type === "wikilink")).toBe(true);
  }
});

test("Undo run puts back only the blocks the run changed, so the others (and comments in them) stay where they are", () => {
  const doc = scene();
  const saved = value(doc);
  const elements = () => (rootOf(doc).toDelta() as Array<{ insert: unknown }>).map((op) => op.insert).filter((insert) => insert instanceof Y.XmlText);
  const [, untouched] = elements();
  applyEdits(doc, [{ op: "replace", blockId: "c", text: "The door was **shut**." }, { op: "insert", after: "c", text: "She knocked." }], direct);
  restoreValue(doc, saved);
  expect(value(doc)).toEqual(saved);
  expect(elements()[1]).toBe(untouched);
});
