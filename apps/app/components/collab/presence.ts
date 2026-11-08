"use client";

import * as Y from "yjs";
import { Store, type Peer } from "@/components/workspace/stores";
import { openRoom } from "./party-provider";

type LocalState = { user: { id: string; name: string; color: string; image?: string | null }; nodeId: string | null };

/**
 * Project-wide presence over an awareness-only room: who's here and which note
 * each person has open. It also relays "binder changed" notices so every
 * client refetches the tree (with its own permissions) when someone edits it.
 */
export class Presence {
  readonly peers = new Store<Peer[]>([]);
  private provider: ReturnType<typeof openRoom>;
  private doc = new Y.Doc();
  private listeners = new Set<(notice: string) => void>();

  constructor(projectId: string, user: LocalState["user"]) {
    this.provider = openRoom(this.doc, { projectId, room: `presence-${projectId}` });
    const awareness = this.provider.awareness;
    awareness.setLocalState({ user, nodeId: null } satisfies LocalState);
    awareness.on("change", () => {
      const peers: Peer[] = [];
      awareness.getStates().forEach((state, clientId) => {
        const s = state as Partial<LocalState>;
        if (clientId === awareness.clientID || !s.user) return;
        peers.push({ clientId, ...s.user, nodeId: s.nodeId ?? null });
      });
      this.peers.set(peers);
    });
    this.provider.on("custom-message", (message: string) => {
      for (const listener of this.listeners) listener(message);
    });
  }

  setNode(nodeId: string | null) {
    this.provider.awareness.setLocalStateField("nodeId", nodeId);
  }

  notify(notice: string) {
    if (this.provider.wsconnected) this.provider.sendMessage(notice);
  }

  onNotice(listener: (notice: string) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  destroy() {
    this.provider.awareness.setLocalState(null);
    this.provider.destroy();
    this.doc.destroy();
  }
}
