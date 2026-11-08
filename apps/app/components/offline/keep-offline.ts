"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";
import { openRoom } from "@/components/collab/party-provider";
import { Store, useStore } from "@/components/workspace/stores";
import { boardKinds, documentKinds } from "@/lib/story";
import type { BinderNode } from "@/lib/tree";
import { plural } from "@/lib/plural";

// "Keep on this device" (beat-the-competitors.md, step 2). The editor already
// keeps a copy of each note you open (components/collab); this fetches every
// note in a project into the same place, so notes you've never opened on this
// device are there offline too. Which projects are kept is this browser's
// choice, not the account's: a laptop might keep everything, a borrowed
// computer nothing.

const STORAGE_KEY = "plotra:kept-projects";
/** How long a kept project goes before it's brought up to date again, on the next visit. */
const REFRESH_MS = 30 * 60 * 1000;
const AT_ONCE = 4;
const ROOM_TIMEOUT_MS = 30_000;

type Kept = Record<string, { at: number }>;

function readKept(): Kept {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Kept) : {};
  } catch {
    return {};
  }
}

function writeKept(kept: Kept) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(kept));
  } catch {
    // Private mode or full storage: it stays on for this visit only.
  }
  keptStore.set(kept);
}

const keptStore = new Store<Kept>({});
let loaded = false;
const kept = () => {
  if (!loaded && typeof window !== "undefined") {
    loaded = true;
    keptStore.set(readKept());
  }
  return keptStore.get();
};

/** Progress of a download or a removal, for the status bar. */
export type KeepProgress = { projectId: string; mode: "keep" | "remove"; done: number; total: number; failed: number };
export const keepProgress = new Store<KeepProgress | null>(null);

/** The notes that have a document of their own to keep. */
export const keptNodes = (nodes: BinderNode[]) =>
  nodes.filter((node) => !node.deletedAt && (documentKinds.includes(node.kind) || (boardKinds.includes(node.kind) && node.kind !== "timeline")));

/**
 * Opens one note's room long enough to bring its copy on this device up to
 * date both ways: the server's changes come down, and anything written here
 * offline goes up. With `remove`, the copy is then deleted.
 */
async function syncRoom(projectId: string, room: string, remove: boolean) {
  const doc = new Y.Doc();
  const local = new IndexeddbPersistence(`plotra:${room}`, doc);
  await local.whenSynced;
  const provider = openRoom(doc, { projectId, room });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error(`No answer for ${room}`)), ROOM_TIMEOUT_MS);
      provider.on("sync", (synced: boolean) => {
        if (!synced) return;
        window.clearTimeout(timer);
        resolve();
      });
    });
    // Let what this device sent on connecting reach the server before closing.
    await new Promise((resolve) => window.setTimeout(resolve, 300));
  } finally {
    provider.destroy();
  }
  if (remove) await local.clearData();
  else await local.destroy();
  doc.destroy();
}

let running: Promise<void> | null = null;
/** Notes the last run couldn't reach. */
let lastFailed = 0;

async function run(projectId: string, nodes: BinderNode[], mode: "keep" | "remove") {
  const queue = keptNodes(nodes).map((node) => `node-${node.id}`);
  const progress: KeepProgress = { projectId, mode, done: 0, total: queue.length, failed: 0 };
  keepProgress.set({ ...progress });
  const worker = async () => {
    for (let room = queue.shift(); room; room = queue.shift()) {
      try {
        await syncRoom(projectId, room, mode === "remove");
      } catch {
        progress.failed++;
      }
      progress.done++;
      keepProgress.set({ ...progress });
    }
  };
  await Promise.all(Array.from({ length: AT_ONCE }, worker));
  keepProgress.set(null);
  lastFailed = progress.failed;
  return progress;
}

/** Brings a kept project's copy up to date, if it's due. Called when the project opens. */
export function refreshKept(projectId: string, nodes: BinderNode[]) {
  const entry = kept()[projectId];
  if (!entry || running || !navigator.onLine || Date.now() - entry.at < REFRESH_MS) return;
  running = run(projectId, nodes, "keep")
    .then((result) => {
      // Only a run that reached every note counts; a partial one tries again next time.
      if (!result.failed && kept()[projectId]) writeKept({ ...kept(), [projectId]: { at: Date.now() } });
    })
    .finally(() => (running = null));
}

/** Starts keeping a project on this device and fetches all of it now. */
export async function keepProject(projectId: string, nodes: BinderNode[]) {
  writeKept({ ...kept(), [projectId]: { at: 0 } });
  await running;
  refreshKept(projectId, nodes);
  await running;
}

/**
 * Stops keeping a project, and deletes its notes from this device once each
 * has sent up anything written here offline. A note that can't be reached
 * keeps its copy, so nothing is lost; it goes the next time this is chosen.
 */
export async function removeProject(projectId: string, nodes: BinderNode[]) {
  writeKept(Object.fromEntries(Object.entries(kept()).filter(([id]) => id !== projectId)));
  await running;
  running = run(projectId, nodes, "remove").then(() => {}).finally(() => (running = null));
  await running;
}

/** Forgets which projects this browser keeps, on sign-out. Their copies stay until removed, so nothing unsent is lost. */
export function forgetKeptProjects() {
  writeKept({});
}

/** Whether this project is kept on this device, and what's happening to it now. */
export function useKept(projectId: string) {
  // Read after the first render, which has to match the server's (it can't see this browser's list).
  useEffect(() => void kept(), []);
  const all = useStore(keptStore);
  const progress = useStore(keepProgress);
  return { kept: projectId in all, progress: progress?.projectId === projectId ? progress : null };
}

/** Keeps a project on this device or removes it, saying how it went. */
export async function setKept(projectId: string, title: string, nodes: BinderNode[], on: boolean) {
  if (on && !navigator.onLine) return toast.error("You're offline. Keep a project on this device while you're online.");
  const id = toast.loading(on ? `Keeping “${title}” on this device…` : `Removing “${title}” from this device…`);
  if (on) await keepProject(projectId, nodes);
  else await removeProject(projectId, nodes);
  const failed = lastFailed;
  if (on) {
    toast.success(
      failed
        ? `“${title}” is on this device, except ${failed} ${plural(failed, "note")} that couldn't be fetched. ${failed === 1 ? "It's" : "They're"} tried again next time you open it.`
        : `“${title}” is on this device. Every note opens offline now.`,
      { id },
    );
  } else {
    toast.success(
      failed
        ? `“${title}” is no longer kept here. ${failed} ${plural(failed, "note")} couldn't be reached and stay${failed === 1 ? "s" : ""} on this device until you remove it again.`
        : `“${title}” is no longer kept on this device.`,
      { id },
    );
  }
}
