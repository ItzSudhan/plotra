import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useState } from "react";
import { keys, useResource } from "./cache";
import { computeHorizon, type Horizon } from "./horizon";
import { useClient } from "./session";
import type { Note, Release } from "./types";

// "As of" a release, per project, remembered on the phone: the binder dims
// what the audience doesn't know yet, the reader leaves out passages revealed
// later, and the editor marks them.

const storeKey = (projectId: string) => `plotra.asOf:${projectId}`;
const listeners = new Map<string, Set<(id: string | null) => void>>();

export function useHorizon(projectId: string, notes: Note[] | undefined) {
  const client = useClient();
  const releases = useResource(keys.releases(projectId), () => client.releases(projectId));
  const [asOf, setAsOfState] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void AsyncStorage.getItem(storeKey(projectId)).then((id) => live && setAsOfState(id));
    const set = listeners.get(projectId) ?? new Set();
    set.add(setAsOfState);
    listeners.set(projectId, set);
    return () => {
      live = false;
      set.delete(setAsOfState);
    };
  }, [projectId]);

  const setAsOf = useCallback(
    (id: string | null) => {
      if (id) void AsyncStorage.setItem(storeKey(projectId), id);
      else void AsyncStorage.removeItem(storeKey(projectId));
      for (const fn of listeners.get(projectId) ?? []) fn(id);
    },
    [projectId],
  );

  const list = useMemo(() => releases.data ?? [], [releases.data]);
  // A release that was removed means "everything" again.
  const release: Release | null = (asOf && list.find((r) => r.id === asOf)) || null;
  const horizon: Horizon | null = useMemo(
    () => (release && notes ? computeHorizon(notes.map((n) => ({ id: n.id, parentId: n.parentId, revealReleaseId: n.revealReleaseId })), list, release.id) : null),
    [release, notes, list],
  );

  return { releases: list, release, horizon, setAsOf };
}
