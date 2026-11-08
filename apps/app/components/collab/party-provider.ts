"use client";

import { registerProviderType, type ProviderConstructorProps, type UnifiedProvider } from "@platejs/yjs";
import YProvider from "y-partyserver/provider";
import type { Awareness } from "y-protocols/awareness";
import type * as Y from "yjs";
import { COLLAB_PARTY, type CollabRole } from "@/lib/collab/rooms";
import { isLocalMode } from "@/lib/local-mode";
import { LocalProvider } from "./local-provider";
import { holdRoom, roomHeld } from "./room-hold";

export { holdRoom };

const collabUrl = new URL(process.env.NEXT_PUBLIC_COLLAB_URL || "http://localhost:8787");

export type PartyProviderOptions = { projectId: string; room: string };

type Token = { token: string; role: CollabRole };

// Tokens last ten minutes (lib/collab/token.ts). Reusing one for a while makes
// reconnects and reopened tabs skip the round trip to the app.
const TOKEN_REUSE_MS = 4 * 60 * 1000;
const tokens = new Map<string, { at: number; token: Promise<Token> }>();

/** A collab token for a room, fetched from a route handler so it never queues behind server actions. */
async function collabToken(projectId: string, room: string): Promise<Token> {
  await roomHeld(room);
  const key = `${projectId}/${room}`;
  const cached = tokens.get(key);
  if (cached && Date.now() - cached.at < TOKEN_REUSE_MS) return cached.token;
  const token = fetch(`/api/collab/token?${new URLSearchParams({ project: projectId, room })}`, { cache: "no-store" }).then(
    async (res) => {
      if (!res.ok) throw new Error(`Couldn't get a collab token (${res.status}).`);
      return (await res.json()) as Token;
    },
  );
  tokens.set(key, { at: Date.now(), token });
  token.catch(() => tokens.get(key)?.token === token && tokens.delete(key));
  return token;
}

/** Close codes from the collab server after which a cached token mustn't be reused: expired, and access changed. */
const STALE_TOKEN = new Set([4001, 4003]);

/**
 * What a room connection offers the editor, the canvases and presence: the
 * part of y-partyserver's provider they use, which local mode's provider has too.
 */
export type RoomProvider = Pick<YProvider, "doc" | "awareness" | "shouldConnect" | "wsconnected" | "connect" | "disconnect" | "destroy" | "sendMessage"> & {
  on(name: string, listener: (...args: never[]) => void): void;
  off(name: string, listener: (...args: never[]) => void): void;
};

/**
 * Opens a room: a y-partyserver connection to the collab server, fetching a
 * fresh token for every (re)connect; in local mode, the app's own route
 * (./local-provider.ts).
 */
export function openRoom(doc: Y.Doc, options: PartyProviderOptions & { awareness?: Awareness; connect?: boolean }): RoomProvider {
  if (isLocalMode) return new LocalProvider(doc, options) as unknown as RoomProvider;
  const provider = new YProvider(collabUrl.host, options.room, doc, {
    party: COLLAB_PARTY,
    protocol: collabUrl.protocol === "https:" ? "wss" : "ws",
    connect: options.connect ?? true,
    awareness: options.awareness,
    // Each tab already syncs through the server; BroadcastChannel would let a
    // read-only tab's state leak into an editable one.
    disableBc: true,
    params: async () => {
      const { token } = await collabToken(options.projectId, options.room);
      return { token };
    },
  });
  // The note was locked (or the token ran out): the reconnect asks the app again, and gets the role it now allows.
  provider.on("connection-close", (event: CloseEvent) => {
    if (STALE_TOKEN.has(event.code)) tokens.delete(`${options.projectId}/${options.room}`);
  });
  return provider;
}

/** Plate's YjsPlugin adapter for the Plotra collab server. */
class PartyProvider implements UnifiedProvider {
  readonly type = "partyserver";
  readonly provider: RoomProvider;
  private connected = false;
  private synced = false;
  private pending = false;
  private destroyed = false;

  constructor({ awareness, doc, options, onConnect, onDisconnect, onError, onSyncChange }: ProviderConstructorProps<PartyProviderOptions>) {
    if (!doc) throw new Error("PartyProvider needs a Y.Doc");
    this.provider = openRoom(doc, { ...options, awareness, connect: false });
    this.provider.on("status", ({ status }: { status: string }) => {
      const connected = status === "connected";
      if (connected === this.connected) return;
      this.connected = connected;
      if (connected) onConnect?.();
      else {
        onDisconnect?.();
        this.setSynced(false, onSyncChange);
      }
    });
    this.provider.on("sync", (isSynced: boolean) => this.setSynced(isSynced, onSyncChange));
    this.provider.on("connection-error", () => onError?.(new Error(isLocalMode ? "Couldn't reach the app's server." : "Couldn't reach the collaboration server.")));
  }

  private setSynced(value: boolean, onSyncChange?: (synced: boolean) => void) {
    if (value === this.synced) return;
    this.synced = value;
    onSyncChange?.(value);
  }

  get awareness() {
    return this.provider.awareness;
  }
  get document() {
    return this.provider.doc;
  }
  get isConnected() {
    return this.connected;
  }
  get isSynced() {
    return this.synced;
  }
  /** Plate only destroys providers that are connected or pending: count the token fetch and reconnect loop. */
  get isConnectionPending() {
    return !this.connected && (this.pending || this.provider.shouldConnect);
  }
  connect = () => {
    if (this.destroyed) return;
    this.pending = true;
    // connect() fetches a token before opening the socket; if we were destroyed
    // meanwhile, close the socket it just opened.
    void this.provider
      .connect()
      .then(() => this.destroyed && this.provider.disconnect())
      .catch(() => {})
      .finally(() => (this.pending = false));
  };
  disconnect = () => {
    this.pending = false;
    this.provider.disconnect();
  };
  destroy = () => {
    this.destroyed = true;
    this.pending = false;
    this.provider.destroy();
  };
}

registerProviderType("partyserver", PartyProvider);
