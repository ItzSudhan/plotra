"use client";

import { useEffect, useState } from "react";
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";
import { openRoom } from "./party-provider";
import type { SyncState } from "./use-collab-editor";

/**
 * A bare Yjs doc bound to one collab room, for things that aren't Plate
 * documents (storyboard canvases). Same rules as the editor: the server
 * decides who may write, and an IndexedDB copy is kept unless the content is
 * classified.
 */
export function useRoomDoc({ projectId, room, offline = true }: { projectId: string; room: string; offline?: boolean }) {
  const [state, setState] = useState<{
    doc: Y.Doc;
    provider: ReturnType<typeof openRoom>;
  } | null>(null);
  const [sync, setSync] = useState<SyncState>("connecting");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const doc = new Y.Doc();
    const local = offline ? new IndexeddbPersistence(`plotra:${room}`, doc) : null;
    const provider = openRoom(doc, { projectId, room });
    let loaded = false;
    const markReady = () => {
      if (loaded) return;
      loaded = true;
      setReady(true);
    };
    local?.once("synced", markReady);
    provider.on("sync", (synced: boolean) => {
      setSync(synced ? "synced" : "connecting");
      if (synced) markReady();
    });
    provider.on("status", ({ status }: { status: string }) => status !== "connected" && setSync("offline"));
    provider.on("connection-error", () => setSync("offline"));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one doc per room for the component's lifetime
    setState({ doc, provider });
    return () => {
      provider.destroy();
      void local?.destroy();
      doc.destroy();
      setState(null);
      setReady(false);
      setSync("connecting");
    };
  }, [offline, projectId, room]);

  return { doc: state?.doc ?? null, provider: state?.provider ?? null, ready, sync };
}
