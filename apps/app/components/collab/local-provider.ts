"use client";

import { applyAwarenessUpdate, Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import type { CollabRole } from "@/lib/collab/rooms";
import { roomHeld } from "./room-hold";

/**
 * Local mode's room connection (local-mode-plan.md, phase 3), in place of the
 * WebSocket to the collab server: the same surface as y-partyserver's provider,
 * so the editor, the canvases and presence don't know the difference.
 *
 * Changes made here are posted to /api/collab/local in small batches; changes
 * made elsewhere (another window, the agent) arrive over a Server-Sent Events
 * stream. Each time the stream opens, the two copies are brought level: the
 * app sends what this copy lacks, and this copy sends what the app lacks
 * (whatever was written while the app couldn't be reached, kept meanwhile in
 * IndexedDB).
 */

const BATCH_MS = 150;
const RETRY_MS = 2000;

type Listener = (...args: never[]) => void;

const toBase64 = (bytes: Uint8Array) => {
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
};
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

/** An update that changes nothing: no structs, no deletions. */
const isEmptyUpdate = (update: Uint8Array) => update.length <= 2;

export type LocalProviderOptions = { projectId: string; room: string; awareness?: Awareness; connect?: boolean };

export class LocalProvider {
  readonly doc: Y.Doc;
  readonly awareness: Awareness;
  readonly room: string;
  shouldConnect = false;
  wsconnected = false;
  synced = false;
  role: CollabRole = "viewer";

  private readonly projectId: string;
  private readonly client = crypto.randomUUID();
  private readonly ownAwareness: boolean;
  private listeners = new Map<string, Set<Listener>>();
  private events: EventSource | null = null;
  private pending: Uint8Array[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private syncing: Promise<void> | null = null;
  private destroyed = false;

  constructor(doc: Y.Doc, options: LocalProviderOptions) {
    this.doc = doc;
    this.room = options.room;
    this.projectId = options.projectId;
    this.ownAwareness = !options.awareness;
    this.awareness = options.awareness ?? new Awareness(doc);
    doc.on("update", this.onUpdate);
    if (typeof window !== "undefined") window.addEventListener("pagehide", this.flushNow);
    if (options.connect ?? true) void this.connect();
  }

  on(name: string, listener: Listener) {
    let set = this.listeners.get(name);
    if (!set) this.listeners.set(name, (set = new Set()));
    set.add(listener);
  }

  off(name: string, listener: Listener) {
    this.listeners.get(name)?.delete(listener);
  }

  private emit(name: string, ...args: unknown[]) {
    for (const listener of this.listeners.get(name) ?? []) (listener as (...a: unknown[]) => void)(...args);
  }

  private url(path: string, extra: Record<string, string> = {}) {
    return `${path}?${new URLSearchParams({ project: this.projectId, room: this.room, client: this.client, ...extra })}`;
  }

  private setStatus(connected: boolean) {
    if (this.wsconnected === connected) return;
    this.wsconnected = connected;
    this.emit("status", { status: connected ? "connected" : "disconnected" });
    if (!connected) this.setSynced(false);
  }

  private setSynced(synced: boolean) {
    if (this.synced === synced) return;
    this.synced = synced;
    this.emit("sync", synced);
    this.emit("synced", synced);
  }

  async connect(): Promise<void> {
    if (this.destroyed || this.events) return;
    this.shouldConnect = true;
    // A note this window just created: wait until the app has it.
    await roomHeld(this.room);
    if (this.destroyed || !this.shouldConnect || this.events) return;
    this.emit("status", { status: "connecting" });
    const events = new EventSource(this.url("/api/collab/local/events"));
    this.events = events;
    events.addEventListener("ready", (event) => {
      this.role = (JSON.parse((event as MessageEvent<string>).data) as { role: CollabRole }).role;
      void this.resync();
    });
    events.addEventListener("update", (event) => {
      Y.applyUpdate(this.doc, fromBase64((event as MessageEvent<string>).data), this);
    });
    events.addEventListener("awareness", (event) => {
      applyAwarenessUpdate(this.awareness, fromBase64((event as MessageEvent<string>).data), this);
    });
    events.addEventListener("message", (event) => {
      this.emit("custom-message", JSON.parse((event as MessageEvent<string>).data) as string);
    });
    // The note was locked or unlocked: ask again what this window may do.
    events.addEventListener("recheck", () => void this.resync());
    events.onerror = () => {
      // EventSource tries again by itself, and "ready" brings the copies level when it's back.
      this.setStatus(false);
      this.emit("connection-error", new Event("error"));
      if (events.readyState === EventSource.CLOSED && this.events === events) {
        this.events = null;
        this.retry();
      }
    };
  }

  /** Brings this copy and the app's level, both ways. */
  private resync(): Promise<void> {
    this.syncing ??= (async () => {
      try {
        const sv = toBase64(Y.encodeStateVector(this.doc));
        const res = await fetch(this.url("/api/collab/local", { sv }), { cache: "no-store" });
        if (!res.ok) throw new Error(`Couldn't open ${this.room} (${res.status}).`);
        this.role = (res.headers.get("x-plotra-role") as CollabRole | null) ?? "viewer";
        const update = new Uint8Array(await res.arrayBuffer());
        if (!isEmptyUpdate(update)) Y.applyUpdate(this.doc, update, this);
        // What was written here while the app couldn't be reached (or before the
        // queue's last batch went out) goes up now, as one update. The queue is
        // emptied in the same step, so nothing is in both.
        const theirs = res.headers.get("x-plotra-sv");
        const missing = theirs !== null ? Y.encodeStateAsUpdate(this.doc, fromBase64(theirs)) : null;
        this.pending = [];
        if (this.role === "editor" && missing && !isEmptyUpdate(missing) && !this.room.startsWith("presence-")) await this.post(missing);
        this.setStatus(true);
        this.setSynced(true);
        // Typed while that was on its way: it goes in the next batch.
        if (this.pending.length) this.flushTimer ??= setTimeout(() => void this.flush(), BATCH_MS);
      } catch {
        this.setStatus(false);
        this.retry();
      } finally {
        this.syncing = null;
      }
    })();
    return this.syncing;
  }

  private retry() {
    if (this.destroyed || !this.shouldConnect || this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.events) void this.resync();
      else void this.connect();
    }, RETRY_MS);
  }

  private onUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === this || this.role !== "editor" || this.room.startsWith("presence-")) return;
    this.pending.push(update);
    // Not level with the app yet: the next resync sends everything it lacks.
    if (!this.synced) return;
    this.flushTimer ??= setTimeout(() => void this.flush(), BATCH_MS);
  };

  private async post(update: Uint8Array, keepalive = false) {
    const res = await fetch(this.url("/api/collab/local"), {
      method: "POST",
      body: update as BodyInit,
      headers: { "content-type": "application/octet-stream" },
      keepalive,
    });
    if (!res.ok) throw new Error(`Couldn't save ${this.room} (${res.status}).`);
  }

  private async flush() {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    if (!this.pending.length) return;
    const update = Y.mergeUpdates(this.pending);
    this.pending = [];
    try {
      await this.post(update);
    } catch {
      // The resync after reconnecting sends it again, with anything since.
      this.setStatus(false);
      this.retry();
    }
  }

  /** The window is closing: send what's waiting, in a request that outlives the page. */
  private flushNow = () => {
    if (!this.pending.length) return;
    const update = Y.mergeUpdates(this.pending);
    this.pending = [];
    // Requests that outlive the page are capped at 64 KB; anything bigger is in IndexedDB until next time.
    if (update.length < 60_000) void this.post(update, true).catch(() => {});
  };

  /** A notice for the project's other windows ("binder changed"). */
  sendMessage(message: string) {
    void fetch(this.url("/api/collab/local", { message: "" }), { method: "POST", body: message }).catch(() => {});
  }

  disconnect() {
    this.shouldConnect = false;
    void this.flush();
    this.events?.close();
    this.events = null;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.setStatus(false);
    this.emit("connection-close", { code: 1000 });
  }

  destroy() {
    if (this.destroyed) return;
    this.flushNow();
    this.disconnect();
    this.destroyed = true;
    this.doc.off("update", this.onUpdate);
    if (typeof window !== "undefined") window.removeEventListener("pagehide", this.flushNow);
    if (this.ownAwareness) this.awareness.destroy();
    this.listeners.clear();
  }
}
