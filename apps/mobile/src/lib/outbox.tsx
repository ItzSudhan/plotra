import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { ApiError, isOffline, type Client } from "./api";
import { invalidate, keys } from "./cache";
import { useSession } from "./session";
import type { NewNote, NotePatch } from "./types";

// Changes made with no connection wait here, on the phone, and go to the
// server in order once it can be reached: when the connection comes back, when
// the app comes to the front, or when another change is queued. One the server
// turns down (the note was deleted, you lost access) is kept with the reason,
// so its text is never lost: Account shows it, to copy or let go.

export type Change =
  | { type: "text"; projectId: string; noteId: string; title: string; mode: "append" | "update"; markdown: string }
  | { type: "create"; projectId: string; title: string; input: NewNote }
  | { type: "patch"; projectId: string; noteId: string; title: string; patch: NotePatch };

export type Queued = Change & { id: string; queuedAt: number; error?: string };

const KEY = "plotra.outbox";

type Value = {
  pending: Queued[];
  failed: Queued[];
  enqueue: (change: Change) => void;
  flush: () => Promise<void>;
  discard: (id: string) => void;
};

const Context = createContext<Value>({ pending: [], failed: [], enqueue: () => {}, flush: async () => {}, discard: () => {} });

async function send(client: Client, change: Change) {
  if (change.type === "text") await client.writeText(change.projectId, change.noteId, change.mode, change.markdown);
  else if (change.type === "create") await client.createNote(change.projectId, change.input);
  else await client.updateNote(change.projectId, change.noteId, change.patch);
  invalidate(keys.notes(change.projectId));
  if (change.type !== "create") invalidate(keys.note(change.projectId, change.noteId));
}

export function OutboxProvider({ children }: { children: ReactNode }) {
  const { client } = useSession();
  const [items, setItems] = useState<Queued[]>([]);
  const itemsRef = useRef<Queued[]>([]);
  const flushing = useRef(false);

  const save = useCallback((next: Queued[]) => {
    itemsRef.current = next;
    setItems(next);
    void AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!raw) return;
        const saved = JSON.parse(raw) as Queued[];
        itemsRef.current = saved;
        setItems(saved);
      })
      .catch(() => {});
  }, [client]);

  const flush = useCallback(async () => {
    if (!client || flushing.current) return;
    flushing.current = true;
    try {
      for (const item of itemsRef.current.filter((i) => !i.error)) {
        try {
          await send(client, item);
          save(itemsRef.current.filter((i) => i.id !== item.id));
        } catch (e) {
          if (isOffline(e)) break;
          const reason = e instanceof ApiError ? e.message : "Something went wrong.";
          save(itemsRef.current.map((i) => (i.id === item.id ? { ...i, error: reason } : i)));
        }
      }
    } finally {
      flushing.current = false;
    }
  }, [client, save]);

  const enqueue = useCallback(
    (change: Change) => {
      // A newer version of the same note's text makes an older waiting one pointless.
      const rest = change.type === "text" && change.mode === "update" ? itemsRef.current.filter((i) => i.error || !(i.type === "text" && i.mode === "update" && i.noteId === change.noteId)) : itemsRef.current;
      save([...rest, { ...change, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, queuedAt: Date.now() }]);
      void flush();
    },
    [flush, save],
  );

  const discard = useCallback((id: string) => save(itemsRef.current.filter((i) => i.id !== id)), [save]);

  useEffect(() => {
    const net = NetInfo.addEventListener((s) => {
      if (s.isConnected) void flush();
    });
    const app = AppState.addEventListener("change", (s) => {
      if (s === "active") void flush();
    });
    void flush();
    return () => {
      net();
      app.remove();
    };
  }, [flush]);

  return (
    <Context.Provider value={{ pending: items.filter((i) => !i.error), failed: items.filter((i) => i.error), enqueue, flush, discard }}>{children}</Context.Provider>
  );
}

export const useOutbox = () => useContext(Context);
