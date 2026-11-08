"use client";

import { useEffect, useState } from "react";
import { recordMyWriting } from "@/lib/stats-actions";
import { emptyStats, Store, useStore } from "@/components/workspace/stores";
import { useWorkspace } from "@/components/workspace/workspace-provider";

// The writing session (plan.md 2.3 "session goals"): words you have typed in
// this browser tab since you opened the project, or since you last reset it.
//
// This is the per-person half of the stats. The collab sync only knows a
// project's words per hour (lib/collab/sync.ts): a sync doesn't say who typed.
// Here we can tell, near enough: a note's word count going up or down while
// the caret is in that note's editor is your typing. A collaborator typing in
// the very note you're typing in is counted as you; nothing else is. A paste or
// a drop isn't typing, and neither is a restored version (its dialog has the
// focus), so they don't count.
//
// What counts is also reported to the server now and then (`recordMyWriting`),
// for the "You" side of the Stats view.

type Session = { words: number; startedAt: number };

const sessions = new Map<string, Store<Session>>();
const key = (projectId: string) => `plotra:session:${projectId}`;

function sessionFor(projectId: string): Store<Session> {
  let store = sessions.get(projectId);
  if (!store) {
    let initial: Session = { words: 0, startedAt: Date.now() };
    try {
      // sessionStorage, so a reload keeps the session and a new tab starts one.
      const saved = JSON.parse(sessionStorage.getItem(key(projectId)) ?? "null") as Session | null;
      if (saved && Number.isFinite(saved.words) && Number.isFinite(saved.startedAt)) initial = saved;
    } catch {}
    store = new Store(initial);
    store.subscribe(() => {
      try {
        sessionStorage.setItem(key(projectId), JSON.stringify(store!.get()));
      } catch {}
    });
    sessions.set(projectId, store);
  }
  return store;
}

const fresh: Session = { words: 0, startedAt: 0 };
const blank = new Store<Session>(fresh);

/** The current session's net words, and a way to start over. */
export function useSession() {
  const { project } = useWorkspace();
  // Read after mount: the server render has no sessionStorage.
  const [store, setStore] = useState<Store<Session>>(blank);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from sessionStorage after mount
  useEffect(() => setStore(sessionFor(project.id)), [project.id]);
  const session = useStore(store);
  return { ...session, reset: () => sessionFor(project.id).set({ words: 0, startedAt: Date.now() }) };
}

/** How long after a paste or a drop a change in the word count is taken to be it. */
const PASTE_WINDOW_MS = 2000;
/** How often what was typed is reported to the server. */
const REPORT_EVERY_MS = 60_000;

/** Counts the session's words, and reports them. Mounted once, by the status bar. */
export function useSessionCounter() {
  const { project, docs, activeNodeId } = useWorkspace();
  useEffect(() => {
    const session = sessionFor(project.id);
    // Word counts as last seen, per note, once its document has loaded.
    const seen = new Map<string, number>();
    let pastedAt = 0;
    const pending = { added: 0, removed: 0 };
    const report = () => {
      if (!pending.added && !pending.removed) return;
      const { added, removed } = pending;
      pending.added = 0;
      pending.removed = 0;
      // Lost if the report fails: a stat isn't worth retrying for.
      void recordMyWriting(project.id, added, removed).catch(() => {});
    };
    const pasted = (event: Event) => {
      if ((event.target as Element | null)?.closest?.("[data-slate-editor]")) pastedAt = Date.now();
    };
    const hidden = () => document.visibilityState === "hidden" && report();
    document.addEventListener("paste", pasted, true);
    document.addEventListener("drop", pasted, true);
    document.addEventListener("visibilitychange", hidden);
    const timer = setInterval(report, REPORT_EVERY_MS);
    const unsubscribe = docs.subscribe(() => {
      for (const [nodeId, stats] of Object.entries(docs.get())) {
        // Until the editor has indexed the document, the count is a placeholder zero.
        if (stats.headings === emptyStats.headings) continue;
        const before = seen.get(nodeId);
        seen.set(nodeId, stats.words);
        if (before === undefined || before === stats.words) continue;
        const typing = nodeId === activeNodeId.get() && document.activeElement?.closest("[data-slate-editor]") != null;
        if (!typing || Date.now() - pastedAt < PASTE_WINDOW_MS) continue;
        const delta = stats.words - before;
        session.set((s) => ({ ...s, words: s.words + delta }));
        if (delta > 0) pending.added += delta;
        else pending.removed -= delta;
      }
    });
    return () => {
      unsubscribe();
      clearInterval(timer);
      document.removeEventListener("paste", pasted, true);
      document.removeEventListener("drop", pasted, true);
      document.removeEventListener("visibilitychange", hidden);
      report();
    };
  }, [activeNodeId, docs, project.id]);
}
