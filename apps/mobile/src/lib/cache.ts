import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import { isOffline } from "./api";

// What the phone last saw, kept so screens open at once and still work
// offline: a screen shows the cached copy straight away, then asks the server
// and shows what comes back. Changes made in the app refresh what they touch
// through `invalidate`.

const PREFIX = "cache:";
const listeners = new Map<string, Set<() => void>>();

export async function readCache<T>(key: string): Promise<T | undefined> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

export async function writeCache(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(PREFIX + key, JSON.stringify(value)).catch(() => {});
}

/** Asks every screen showing a key that starts with `prefix` to fetch again. */
export function invalidate(prefix: string) {
  for (const [key, set] of listeners) if (key.startsWith(prefix)) for (const fn of set) fn();
}

export type Resource<T> = {
  data: T | undefined;
  error: Error | null;
  /** Showing the saved copy because the server couldn't be reached. */
  offline: boolean;
  loading: boolean;
  refreshing: boolean;
  refresh: () => Promise<void>;
  /** Changes what's shown (and saved) without asking the server, for changes made here. */
  mutate: (fn: (current: T | undefined) => T | undefined) => void;
};

type State<T> = { key: string | null; data: T | undefined; error: Error | null; offline: boolean; loading: boolean };

const initial = <T,>(key: string | null): State<T> => ({ key, data: undefined, error: null, offline: false, loading: !!key });

export function useResource<T>(key: string | null, fetcher: () => Promise<T>): Resource<T> {
  const [state, setState] = useState<State<T>>(() => initial<T>(key));
  const [refreshing, setRefreshing] = useState(false);
  // A new key starts afresh (React's "adjust state while rendering").
  if (state.key !== key) setState(initial<T>(key));

  const fetcherRef = useRef(fetcher);
  const keyRef = useRef(key);
  useEffect(() => {
    fetcherRef.current = fetcher;
    keyRef.current = key;
  });

  const load = useCallback(async () => {
    const at = keyRef.current;
    if (!at) return;
    try {
      const fresh = await fetcherRef.current();
      setState((s) => (s.key === at ? { ...s, data: fresh, error: null, offline: false, loading: false } : s));
      void writeCache(at, fresh);
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      setState((s) => (s.key === at ? { ...s, error, offline: isOffline(e), loading: false } : s));
    }
  }, []);

  useEffect(() => {
    if (!key) return;
    keyRef.current = key;
    void readCache<T>(key).then((cached) => {
      if (cached !== undefined) setState((s) => (s.key === key && s.data === undefined ? { ...s, data: cached, loading: false } : s));
    });
    void load();
    const set = listeners.get(key) ?? new Set();
    const fn = () => void load();
    set.add(fn);
    listeners.set(key, set);
    return () => {
      set.delete(fn);
      if (!set.size) listeners.delete(key);
    };
  }, [key, load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const mutate = useCallback((fn: (current: T | undefined) => T | undefined) => {
    setState((s) => {
      const next = fn(s.data);
      if (s.key && next !== undefined) void writeCache(s.key, next);
      return { ...s, data: next };
    });
  }, []);

  return { data: state.data, error: state.error, offline: state.offline, loading: state.loading, refreshing, refresh, mutate };
}

export const keys = {
  me: "me",
  projects: "projects",
  notes: (projectId: string) => `notes:${projectId}`,
  note: (projectId: string, noteId: string, asOf?: string | null) => `note:${projectId}:${noteId}${asOf ? `@${asOf}` : ""}`,
  releases: (projectId: string) => `releases:${projectId}`,
  notifications: "notifications",
};
