"use client";

import { YjsPlugin } from "@platejs/yjs/react";
import { usePlateEditor, type PlateEditor } from "platejs/react";
import type { Kit } from "@/components/editor/kit-registry";
import { useEffect, useMemo, useState } from "react";
import * as Y from "yjs";
import { seedUpdate } from "@/lib/collab/seed";
import "./party-provider";

// Rooms of notes this tab just created, with the body they start with.
const seeds = new Map<string, unknown[]>();

/**
 * Lets the editor for a note this tab just created open at once, with its
 * starting body, instead of waiting for the server to have the note.
 */
export function seedNewDocument(room: string, value: unknown[]) {
  seeds.set(room, value);
}

/** Where a document's copy stands relative to the collab server. */
export type SyncState = "connecting" | "synced" | "offline";

export type CollabEditorOptions = {
  projectId: string;
  room: string;
  plugins: Kit;
  user: { name: string; color: string };
  readOnly?: boolean;
  /** Keep an offline copy in IndexedDB. */
  offline?: boolean;
  /** Draw other people's cursors. */
  cursors?: boolean;
};

/**
 * A Plate editor bound to one collab room (plan.md 2.6): Yjs sync through the
 * collab server, an optional IndexedDB copy for offline editing, and remote
 * cursors. Content comes from the server (or the offline copy). The one
 * exception is a note this tab just created (`seedNewDocument`): it starts from
 * the same deterministic first state the server seeds (lib/collab/seed), so the
 * two copies merge instead of doubling up.
 */
export function useCollabEditor({ projectId, room, plugins, user, readOnly, offline = true, cursors = true }: CollabEditorOptions) {
  const [sync, setSync] = useState<SyncState>("connecting");
  const [ready, setReady] = useState(false);

  const yjs = useMemo(
    () =>
      YjsPlugin.configure({
        options: {
          cursors: cursors ? { data: user } : null,
          providers: [
            ...(offline ? [{ type: "indexeddb" as const, options: { docName: `plotra:${room}` } }] : []),
            // Registered in ./party-provider; the plugin's types only know the built-in ones.
            { type: "partyserver", options: { projectId, room } } as never,
          ],
          onConnect: ({ type }) => type === "partyserver" && setSync((s) => (s === "synced" ? s : "connecting")),
          onDisconnect: ({ type }) => type === "partyserver" && setSync("offline"),
          onSyncChange: ({ type, isSynced }) => type === "partyserver" && setSync(isSynced ? "synced" : "connecting"),
          onError: ({ type }) => type === "partyserver" && setSync("offline"),
        },
      }),
    // The room decides the doc; the rest is fixed for the editor's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [room],
  );

  const editor = usePlateEditor({ plugins: [...plugins, yjs], skipInitialization: true, readOnly }, [room]) as PlateEditor;

  useEffect(() => {
    let cancelled = false;
    let initializing: Promise<void> | null = null;
    const api = editor.getApi(YjsPlugin).yjs;
    // Deferred a tick so StrictMode's mount → unmount → mount never starts a
    // second init on the same editor (that double-connects it: "already connected").
    const start = setTimeout(() => {
      const seed = seeds.get(room);
      seeds.delete(room);
      initializing = seed
        ? // Ready now; sync once connected rather than waiting for the server first.
          seedUpdate(room, seed)
            .then((update) => Y.applyUpdate(editor.getOptions(YjsPlugin).ydoc!, update))
            .then(() => api.init({ id: room, value: null, autoConnect: false }))
            .then(() => {
              if (!cancelled) setReady(true);
              api.connect();
            })
        : api.init({ id: room, value: null }).then(() => {
            if (!cancelled) setReady(true);
          });
    });
    return () => {
      cancelled = true;
      setReady(false);
      clearTimeout(start);
      // Destroying mid-init would unbind an editor Yjs hasn't bound yet, and init
      // would still bind it afterwards — so wait for init to finish first.
      void initializing?.finally(() => api.destroy());
    };
  }, [editor, room]);

  return { editor, ready, sync };
}
