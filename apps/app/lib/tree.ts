import type { NodeKind } from "@plotra/db/schema";
import type { IconName } from "@plotra/icons";
import { generateKeyBetween } from "fractional-indexing";
import type { BinderNode } from "./binder";

export type { BinderNode };

export const nodeKindMeta: Record<NodeKind, { label: string; icon: IconName }> = {
  folder: { label: "Folder", icon: "folder-linear" },
  chapter: { label: "Chapter", icon: "book-bookmark-linear" },
  scene: { label: "Scene", icon: "clapperboard-text-linear" },
  note: { label: "Note", icon: "document-text-linear" },
  character: { label: "Character", icon: "user-rounded-linear" },
  location: { label: "Location", icon: "map-point-linear" },
  research: { label: "Research", icon: "library-linear" },
  canvas: { label: "Canvas", icon: "widget-4-linear" },
  timeline: { label: "Timeline", icon: "calendar-mark-linear" },
  entity: { label: "World entry", icon: "earth-linear" },
  dialogue: { label: "Dialogue", icon: "dialog-2-linear" },
};

/** Kinds that hold other nodes. Every kind can, but these are shown as containers. */
export const containerKinds: NodeKind[] = ["folder", "chapter"];

// Fractional-index keys sort by code unit, so never use localeCompare here.
export const byPosition = (a: BinderNode, b: BinderNode) =>
  a.position < b.position ? -1 : a.position > b.position ? 1 : a.id < b.id ? -1 : 1;

export function indexNodes(nodes: BinderNode[]) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const children = new Map<string | null, BinderNode[]>();
  for (const n of nodes) {
    const list = children.get(n.parentId);
    if (list) list.push(n);
    else children.set(n.parentId, [n]);
  }
  for (const list of children.values()) list.sort(byPosition);
  return { byId, children };
}

export type NodeIndex = ReturnType<typeof indexNodes>;

/** True if the node, or any folder above it, is in the trash. */
export function isTrashed(index: NodeIndex, id: string) {
  for (let n = index.byId.get(id); n; n = n.parentId ? index.byId.get(n.parentId) : undefined) {
    if (n.deletedAt) return true;
  }
  return false;
}

/** Live (not trashed) children of a parent, in binder order. */
export function liveChildren(index: NodeIndex, parentId: string | null) {
  return (index.children.get(parentId) ?? []).filter((n) => !n.deletedAt);
}

/** Ancestors from the root down to the node's parent. */
export function ancestors(index: NodeIndex, id: string) {
  const path: BinderNode[] = [];
  for (let n = index.byId.get(id); n?.parentId; ) {
    n = index.byId.get(n.parentId);
    if (n) path.unshift(n);
  }
  return path;
}

export function isDescendant(index: NodeIndex, id: string, ancestorId: string) {
  for (let n = index.byId.get(id); n?.parentId; n = index.byId.get(n.parentId)) {
    if (n.parentId === ancestorId) return true;
  }
  return false;
}

/** Every live node in binder (depth-first) order. */
export function flatten(index: NodeIndex, parentId: string | null = null, out: BinderNode[] = []) {
  for (const n of liveChildren(index, parentId)) {
    out.push(n);
    flatten(index, n.id, out);
  }
  return out;
}

/** A position key that sorts after every current child of `parentId`. */
export function lastPosition(index: NodeIndex, parentId: string | null) {
  const siblings = index.children.get(parentId) ?? [];
  return generateKeyBetween(siblings.at(-1)?.position ?? null, null);
}

/** A position key directly after `id` among its siblings. */
export function positionAfter(index: NodeIndex, id: string) {
  const n = index.byId.get(id);
  if (!n) return lastPosition(index, null);
  const siblings = index.children.get(n.parentId) ?? [];
  const next = siblings[siblings.findIndex((s) => s.id === id) + 1];
  return generateKeyBetween(n.position, next?.position ?? null);
}

/** A position key directly before `id` among its siblings. */
export function positionBefore(index: NodeIndex, id: string) {
  const n = index.byId.get(id);
  if (!n) return lastPosition(index, null);
  const siblings = index.children.get(n.parentId) ?? [];
  const prev = siblings[siblings.findIndex((s) => s.id === id) - 1];
  return generateKeyBetween(prev?.position ?? null, n.position);
}

/** A note's icon: its kind's, except a canvas made as a map (lib/canvas.ts). */
export const nodeIcon = (node: { kind: NodeKind; settings?: Record<string, unknown> | null }) =>
  node.kind === "canvas" && node.settings?.board === "map" ? ("map-linear" as const) : nodeKindMeta[node.kind].icon;
