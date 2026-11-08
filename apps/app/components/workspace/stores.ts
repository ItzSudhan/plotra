"use client";

import { useSyncExternalStore } from "react";
import type { Suggestion } from "@/components/editor/review";
import { indexNodes, type BinderNode, type NodeIndex } from "@/lib/tree";

/** A tiny observable value; components read it with `useStore`. */
export class Store<T> {
  private listeners = new Set<() => void>();
  constructor(private value: T) {}

  get = () => this.value;

  set = (next: T | ((prev: T) => T)) => {
    this.value = typeof next === "function" ? (next as (prev: T) => T)(this.value) : next;
    for (const listener of this.listeners) listener();
  };

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

/** All binder nodes of the open project, with a derived tree index. */
export class BinderStore extends Store<{ nodes: BinderNode[]; index: NodeIndex }> {
  constructor(nodes: BinderNode[]) {
    super({ nodes, index: indexNodes(nodes) });
  }

  private replace(nodes: BinderNode[]) {
    this.set({ nodes, index: indexNodes(nodes) });
  }

  /** Replaces everything, e.g. after refetching the binder. */
  replaceAll(nodes: BinderNode[]) {
    this.replace(nodes);
  }

  upsert(...changed: BinderNode[]) {
    const ids = new Set(changed.map((n) => n.id));
    this.replace([...this.get().nodes.filter((n) => !ids.has(n.id)), ...changed]);
  }

  patch(id: string, patch: Partial<BinderNode>) {
    this.replace(this.get().nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  }

  /** Removes a node and everything under it. */
  removeTree(id: string) {
    const { index, nodes } = this.get();
    const doomed = new Set<string>();
    const visit = (nodeId: string) => {
      doomed.add(nodeId);
      for (const child of index.children.get(nodeId) ?? []) visit(child.id);
    };
    visit(id);
    this.replace(nodes.filter((n) => !doomed.has(n.id)));
  }
}

export type SyncState = "connecting" | "synced" | "offline";
export type Heading = { id: string; level: number; text: string };
export type DocStats = {
  words: number;
  characters: number;
  headings: Heading[];
  tags: string[];
  /** Links out of the note; absent until the open editor has indexed it. */
  links?: number;
  sync: SyncState;
  /** Pending tracked changes (plan.md 2.6 suggestions). */
  suggestions: Suggestion[];
};

export const emptyStats: DocStats = { words: 0, characters: 0, headings: [], tags: [], sync: "synced", suggestions: [] };

/** Someone else in the project right now (plan.md 2.6 presence). */
export type Peer = { clientId: number; id: string; name: string; color: string; image?: string | null; nodeId: string | null };
