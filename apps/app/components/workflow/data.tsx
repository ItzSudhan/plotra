"use client";

import { useEffect, useState } from "react";
import { Store, useStore } from "@/components/workspace/stores";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import type { StoryData } from "@/lib/story-actions";
import type { CommentThreadRow, Person } from "@/lib/workflow-actions";
import { read } from "@/lib/read";

// Shared, self-refreshing client copies of server data that several parts of
// the shell show at once (an editor's highlights and the comments panel, say).
// Each refetches when another client announces a change, and now and then.

const POLL_MS = 30_000;

type Entry<T> = { store: Store<T | null>; users: number; timer?: ReturnType<typeof setInterval>; refresh: () => void };

export function sharedResource<T>() {
  const entries = new Map<string, Entry<T>>();
  return function useResource(key: string | null, load: () => Promise<T>, notice: string | null): { data: T | null; refresh: () => void } {
    const { onNotice } = useWorkspace();
    const [entry, setEntry] = useState<Entry<T> | null>(null);

    useEffect(() => {
      if (!key) return;
      let e = entries.get(key);
      if (!e) {
        const store = new Store<T | null>(null);
        let seq = 0;
        const refresh = () => {
          const mine = ++seq;
          load()
            .then((value) => mine === seq && store.set(value))
            .catch(() => {
              // Offline or lost access: keep what we have.
            });
        };
        e = { store, users: 0, refresh };
        entries.set(key, e);
        refresh();
        e.timer = setInterval(refresh, POLL_MS);
      }
      e.users++;
       
      setEntry(e);
      const unsub = notice ? onNotice((n) => n === notice && e.refresh()) : () => {};
      return () => {
        unsub();
        e.users--;
        if (!e.users) {
          clearInterval(e.timer);
          entries.delete(key);
        }
      };
      // The loader is tied to the key.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, notice, onNotice]);

    const data = useStore((entry?.store ?? emptyStore) as Store<T | null>);
    return { data, refresh: entry?.refresh ?? noop };
  };
}

const emptyStore = new Store<null>(null);
const noop = () => {};

const useCommentsResource = sharedResource<CommentThreadRow[]>();
const usePeopleResource = sharedResource<Person[]>();

const useStoryResource = sharedResource<StoryData>();

/** Announced after any change to threads, plot grid cells, relationships or calendars. */
export const STORY_NOTICE = "story";

/** Project-wide story data (threads, plot grid, relationships, calendars), shared by every story view. */
export function useStory() {
  const { project } = useWorkspace();
  return useStoryResource(project.id, () => read("getStory", project.id), STORY_NOTICE);
}

export const commentsNotice = (nodeId: string) => `comments:${nodeId}`;

/** Comment threads on a note, shared by its editor and the comments panel. */
export function useComments(nodeId: string | null) {
  const { project } = useWorkspace();
  return useCommentsResource(
    nodeId ? `${project.id}/${nodeId}` : null,
    () => read("listComments", project.id, nodeId!),
    nodeId ? commentsNotice(nodeId) : null,
  );
}

/** The project's people by id, guests included: names for comment authors, suggestions and versions. */
export function usePeople() {
  const { project, user } = useWorkspace();
  const { data } = usePeopleResource(project.id, () => read("listPeople", project.id), null);
  const byId = new Map((data ?? []).map((p) => [p.id, p]));
  if (!byId.has(user.id)) byId.set(user.id, { id: user.id, name: user.name, image: user.image ?? null, guest: false });
  return byId;
}

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

/** "3 minutes ago", or a date for anything older than a week. */
export function timeAgo(date: Date) {
  const seconds = (new Date(date).getTime() - Date.now()) / 1000;
  const abs = Math.abs(seconds);
  if (abs < 45) return "just now";
  if (abs < 3600) return relative.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return relative.format(Math.round(seconds / 3600), "hour");
  if (abs < 7 * 86400) return relative.format(Math.round(seconds / 86400), "day");
  return dateFormat.format(new Date(date));
}

export function Avatar({ person, className }: { person?: { name: string; image: string | null; id: string }; className?: string }) {
  const name = person?.name ?? "Someone";
  return (
    <span
      title={name}
      className={`grid shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-meta font-semibold text-muted-foreground ${className ?? "size-5"}`}
    >
      {person?.image ? (
        // eslint-disable-next-line @next/next/no-img-element -- avatars from the auth provider
        <img src={person.image} alt="" className="size-full object-cover" />
      ) : (
        name.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}
