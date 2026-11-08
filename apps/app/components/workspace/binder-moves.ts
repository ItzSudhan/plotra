import type { ModuleId, NodeKind, ProjectType } from "@plotra/db/schema";
import { generateKeyBetween } from "fractional-indexing";
import { containerKinds, isDescendant, liveChildren, type BinderNode, type NodeIndex } from "@/lib/tree";

// Moving notes in the binder without a mouse (Alt+arrows, "Move to…") and
// what the "+ New" menu offers first. Pure, so the tests can check it.

/** Where a note goes: its new parent and position key. */
export type Place = { parentId: string | null; position: string };

/** A key after every child of `parentId`, trashed ones included (they keep their keys). */
const endOf = (index: NodeIndex, parentId: string | null) => generateKeyBetween((index.children.get(parentId) ?? []).at(-1)?.position ?? null, null);

/** One place up among its visible siblings (Alt+↑); null at the top. */
export function moveUp(index: NodeIndex, id: string): Place | null {
  const node = index.byId.get(id);
  if (!node) return null;
  const live = liveChildren(index, node.parentId);
  const at = live.findIndex((n) => n.id === id);
  if (at <= 0) return null;
  const prev = live[at - 1];
  const all = (index.children.get(node.parentId) ?? []).filter((n) => n.id !== id);
  const beforePrev = all[all.findIndex((n) => n.id === prev.id) - 1];
  return { parentId: node.parentId, position: generateKeyBetween(beforePrev?.position ?? null, prev.position) };
}

/** One place down among its visible siblings (Alt+↓); null at the bottom. */
export function moveDown(index: NodeIndex, id: string): Place | null {
  const node = index.byId.get(id);
  if (!node) return null;
  const live = liveChildren(index, node.parentId);
  const at = live.findIndex((n) => n.id === id);
  if (at < 0 || at >= live.length - 1) return null;
  const next = live[at + 1];
  const all = (index.children.get(node.parentId) ?? []).filter((n) => n.id !== id);
  const afterNext = all[all.findIndex((n) => n.id === next.id) + 1];
  return { parentId: node.parentId, position: generateKeyBetween(next.position, afterNext?.position ?? null) };
}

/** Inside the note just above it, at the end (Alt+→); null when nothing is above it. */
export function indent(index: NodeIndex, id: string): Place | null {
  const node = index.byId.get(id);
  if (!node) return null;
  const live = liveChildren(index, node.parentId);
  const at = live.findIndex((n) => n.id === id);
  if (at <= 0) return null;
  const parent = live[at - 1];
  return { parentId: parent.id, position: endOf(index, parent.id) };
}

/** Out of its parent, just after it (Alt+←); null at the top level. */
export function outdent(index: NodeIndex, id: string): Place | null {
  const node = index.byId.get(id);
  const parent = node?.parentId ? index.byId.get(node.parentId) : undefined;
  if (!node || !parent) return null;
  const all = (index.children.get(parent.parentId) ?? []).filter((n) => n.id !== id);
  const after = all[all.findIndex((n) => n.id === parent.id) + 1];
  return { parentId: parent.parentId, position: generateKeyBetween(parent.position, after?.position ?? null) };
}

/** At the end of another note or folder, or of the top level (`null`); null if that's inside the note itself. */
export function moveInto(index: NodeIndex, id: string, parentId: string | null): Place | null {
  if (parentId === id || (parentId && isDescendant(index, parentId, id))) return null;
  const node = index.byId.get(id);
  if (!node || node.parentId === parentId) return null;
  return { parentId, position: endOf(index, parentId) };
}

/**
 * Where "Move to…" can send a note: the folders and chapters (and any note
 * that already holds others) outside it, in binder order, with their depth.
 */
export function moveTargets(index: NodeIndex, id: string): Array<{ node: BinderNode; depth: number }> {
  const out: Array<{ node: BinderNode; depth: number }> = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const n of liveChildren(index, parentId)) {
      if (n.id === id) continue;
      if (containerKinds.includes(n.kind) || liveChildren(index, n.id).length > 0) out.push({ node: n, depth });
      walk(n.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** How many notes go with this one: itself and everything inside it, trashed or not. */
export function countWithin(index: NodeIndex, id: string): number {
  let count = 1;
  for (const child of index.children.get(id) ?? []) count += countWithin(index, child.id);
  return count;
}

/**
 * The kinds the "+ New" menu offers, most-used first for this kind of
 * project: scenes and chapters for prose and scripts, people and places for
 * a game world. The rest follow in their usual order.
 */
export function newMenuKinds(type: ProjectType, modules: ReadonlySet<ModuleId>): { main: NodeKind[]; rest: NodeKind[] } {
  const all: NodeKind[] = ["scene", "chapter", "folder", "note", "character", "location", "research", "canvas", "timeline"];
  if (modules.has("interactive")) all.push("dialogue");
  const main: NodeKind[] =
    type === "ttrpg" || type === "franchise"
      ? ["chapter", "location", "character"]
      : type === "game"
        ? (["scene", "dialogue", "character"] as NodeKind[]).filter((kind) => all.includes(kind))
        : type === "nonfiction"
          ? ["chapter", "research"]
          : ["scene", "chapter"];
  return { main, rest: all.filter((kind) => !main.includes(kind)) };
}

/**
 * What the quick "New …" command (⌘⌥N) makes: the first of the "+ New"
 * menu's top kinds, so a novel gets a scene and a campaign a session.
 */
export const quickKind = (type: ProjectType, modules: ReadonlySet<ModuleId>): NodeKind => newMenuKinds(type, modules).main[0];
