"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar, timeAgo } from "@/components/workflow/data";
import { useStore } from "@/components/workspace/stores";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import type { ActivityRow } from "@/lib/notify-actions";
import { describeActivity } from "@/lib/notify-text";
import { read } from "@/lib/read";
import { EmptyState, Toolbar } from "./view-ui";

// Activity (plan.md 2.6 "Activity feed"): who did what in the project, newest
// first. Titles are as they were at the time; a row opens its note if it's
// still there.

const REFRESH_MS = 30_000;
const dayFormat = new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" });

export function ActivityView() {
  const { project, binder, openNode, onNotice } = useWorkspace();
  const { index } = useStore(binder);
  const [rows, setRows] = useState<ActivityRow[] | null>(null);
  const [more, setMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const latest = useRef<ActivityRow[]>([]);

  // Fetches the newest page and puts it in front of what's already shown.
  const refresh = useCallback(() => {
    read("getActivity", project.id)
      .then((fresh) => {
        const ids = new Set(fresh.map((r) => r.id));
        latest.current = [...fresh, ...latest.current.filter((r) => !ids.has(r.id))];
        setRows(latest.current);
        if (latest.current.length === fresh.length) setMore(fresh.length >= 40);
      })
      .catch(() => setRows((prev) => prev ?? []));
  }, [project.id]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    // Any announced change in the project is probably a new row here.
    let soon: ReturnType<typeof setTimeout> | undefined;
    const unsub = onNotice(() => {
      clearTimeout(soon);
      soon = setTimeout(refresh, 800);
    });
    return () => {
      clearInterval(timer);
      clearTimeout(soon);
      unsub();
    };
  }, [onNotice, refresh]);

  const loadMore = async () => {
    const last = latest.current.at(-1);
    if (!last) return;
    setLoading(true);
    try {
      const older = await read("getActivity", project.id, last.createdAt);
      latest.current = [...latest.current, ...older];
      setRows(latest.current);
      setMore(older.length >= 40);
    } catch {
      // Offline: the button stays, to try again.
    } finally {
      setLoading(false);
    }
  };

  // Rows under a heading per day.
  const days: Array<{ day: string; rows: ActivityRow[] }> = [];
  for (const row of rows ?? []) {
    const day = dayFormat.format(new Date(row.createdAt));
    if (days.at(-1)?.day === day) days.at(-1)!.rows.push(row);
    else days.push({ day, rows: [row] });
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <Toolbar>
        <span className="font-medium">Activity</span>
        <span className="text-muted-foreground">in {project.title}</span>
      </Toolbar>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows === null ? (
          <div className="mx-auto grid max-w-2xl gap-2 p-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon="history-linear" title="Nothing has happened yet">
            New notes, renames, comments, named versions, releases and sharing are listed here as they happen.
          </EmptyState>
        ) : (
          <div className="mx-auto max-w-2xl px-4 py-4">
            {days.map((group) => (
              <section key={group.day} aria-label={group.day} className="mb-5">
                <h2 className="mb-1 text-meta font-medium text-muted-foreground">{group.day}</h2>
                <ul className="grid">
                  {group.rows.map((row) => {
                    const exists = row.nodeId !== null && index.byId.has(row.nodeId);
                    const name = row.actorName ?? "Someone";
                    const text = (
                      <>
                        <span className="font-medium text-foreground">{name}</span> {describeActivity(row.verb, row.payload)}
                      </>
                    );
                    return (
                      <li key={row.id} className="flex items-start gap-2.5 py-1.5 text-ui-sm leading-snug text-muted-foreground">
                        <Avatar person={{ id: row.actorId ?? "", name, image: row.actorImage }} className="mt-px size-5 shrink-0" />
                        {exists ? (
                          <button type="button" onClick={() => openNode(row.nodeId!, "tab")} className="min-w-0 flex-1 rounded text-left hover:text-foreground">
                            {text}
                          </button>
                        ) : (
                          <span className="min-w-0 flex-1">{text}</span>
                        )}
                        <time dateTime={new Date(row.createdAt).toISOString()} className="shrink-0 text-xs">
                          {timeAgo(row.createdAt)}
                        </time>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
            {more && (
              <button type="button" disabled={loading} onClick={() => void loadMore()} className="h-8 rounded-md border px-3 text-ui-sm text-muted-foreground hover:text-foreground disabled:opacity-50">
                {loading ? "Loading…" : "Show earlier activity"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
