"use client";

import { Icon } from "@plotra/icons";
import { Tooltip } from "@plotra/ui/components/tooltip";
import { cn } from "@plotra/ui/lib/utils";
import { errorText, OFFLINE } from "@/lib/errors";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { parseContext } from "@/lib/doc-index";
import type { Backlink, OutgoingLink, UnlinkedMention, WorldBacklink } from "@/lib/knowledge-actions";
import { read } from "@/lib/read";
import { nodeIcon, type NodeIndex } from "@/lib/tree";
import { useStore } from "./stores";
import { useWorkspace } from "./workspace-provider";

// What mentions the active note, what it links to, and where it's named but not
// linked (backlinks, outgoing links and unlinked mentions; plan.md 2.4).

const REFRESH = 10_000;

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="border-b border-sidebar-border last:border-none">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex h-9 w-full items-center gap-1.5 px-3 text-ui-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset"
      >
        <Icon name={open ? "alt-arrow-down-linear" : "alt-arrow-right-linear"} className="size-3" />
        {title}
        <span className="ml-auto font-normal tabular-nums">
          {count}
          <span className="sr-only">{count === 1 ? " note" : " notes"}</span>
        </span>
      </button>
      {open && <div className="pb-2">{children}</div>}
    </section>
  );
}

function Context({ text, index }: { text: string; index: NodeIndex }) {
  return (
    <>
      {parseContext(text).map((part, i) =>
        "text" in part ? (
          <span key={i}>{part.text}</span>
        ) : (
          <span key={i} className="font-medium text-ember-ink">
            {part.alias ?? index.byId.get(part.nodeId)?.title ?? "…"}
          </span>
        ),
      )}
    </>
  );
}

function NodeRow({ id, index, onOpen, children }: { id: string; index: NodeIndex; onOpen: (e: React.MouseEvent) => void; children?: React.ReactNode }) {
  const node = index.byId.get(id);
  if (!node) return null;
  return (
    <div className="px-3 py-1">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-7 w-full min-w-0 items-center gap-1.5 rounded-sm text-left text-ui-sm outline-none hover:text-ember-ink focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <Icon name={nodeIcon(node)} className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate font-medium">{node.title}</span>
      </button>
      {children}
    </div>
  );
}

export function LinksPanel({ nodeId }: { nodeId: string }) {
  const { project, binder, openNode, withEditor } = useWorkspace();
  const { index } = useStore(binder);
  const [links, setLinks] = useState<{ backlinks: Backlink[]; outgoing: OutgoingLink[]; fromSharers: WorldBacklink[] } | null>(null);
  const [mentions, setMentions] = useState<UnlinkedMention[] | null>(null);
  const [tick, setTick] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => document.visibilityState === "visible" && setTick((t) => t + 1), REFRESH);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Links show as soon as they arrive; mentions (a slower search) fill in after.
    read("getUnlinkedMentions", project.id, nodeId)
      .then((m) => !cancelled && setMentions(m))
      .catch(() => !cancelled && setMentions((current) => current ?? []));
    read("getNodeLinks", project.id, nodeId)
      .then((l) => {
        if (cancelled) return;
        setLinks(l);
        setFailed(null);
      })
      .catch((error) => {
        // What was shown stays; only a first load that fails says so.
        if (!cancelled) setFailed(typeof navigator !== "undefined" && !navigator.onLine ? OFFLINE : errorText(error, "Couldn't load this note's links."));
      });
    return () => {
      cancelled = true;
    };
  }, [nodeId, project.id, tick]);

  const openFrom = (e: React.MouseEvent, id: string, heading?: string | null) =>
    openNode(id, e.metaKey || e.ctrlKey ? "tab" : "replace", heading ? { heading } : undefined);

  if (!links) {
    if (failed) {
      return (
        <div role="alert" className="grid justify-items-center gap-3 px-4 py-6 text-center">
          <p className="text-sm text-muted-foreground">{failed}</p>
          <button
            type="button"
            onClick={() => setTick((t) => t + 1)}
            className="h-8 rounded-md border px-3 text-ui-sm outline-none hover:bg-sidebar-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            Try again
          </button>
        </div>
      );
    }
    return (
      <div className="space-y-2 p-4" aria-busy aria-label="Loading links">
        <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
        <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  // One row per source note, with every place it links here.
  const bySource = new Map<string, Backlink[]>();
  for (const l of links.backlinks) bySource.set(l.sourceNodeId, [...(bySource.get(l.sourceNodeId) ?? []), l]);
  const outgoing = [...new Map(links.outgoing.map((l) => [l.targetNodeId, l])).values()];
  const target = index.byId.get(nodeId);
  const canLinkFrom = (id: string) => index.byId.get(id)?.actions.includes("edit");

  return (
    <div className="text-ui-sm">
      <Section title="Mentioned in" count={bySource.size}>
        {bySource.size === 0 && <p className="px-3 py-1 text-sm text-muted-foreground">No note links here yet. Type [[ in another note to link to this one.</p>}
        {[...bySource].map(([source, rows]) => (
          <NodeRow key={source} id={source} index={index} onOpen={(e) => openFrom(e, source)}>
            <ul className="mt-0.5 grid gap-1 pl-5">
              {rows.map((row, i) => (
                <li key={i} className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                  {row.kind === "property" ? (
                    <span className="italic">in its ‘{row.context}’ field</span>
                  ) : row.kind === "embed" ? (
                    <span className="italic">shown inside it{row.targetHeading ? ` (the ‘${row.targetHeading}’ part)` : ""}</span>
                  ) : row.context ? (
                    <Context text={row.context} index={index} />
                  ) : null}
                </li>
              ))}
            </ul>
          </NodeRow>
        ))}
      </Section>

      {links.fromSharers.length > 0 && (
        // This project is a shared world: links into it from the projects that use it, which its own binder doesn't hold.
        <Section title="From projects using this world" count={new Set(links.fromSharers.map((l) => l.sourceNodeId)).size}>
          {[...new Map(links.fromSharers.map((l) => [l.projectId, l.projectTitle])).entries()].map(([id, title]) => (
            <div key={id} className="px-3 py-1">
              <p className="text-meta text-muted-foreground">{title}</p>
              <ul className="grid gap-1">
                {[...new Map(links.fromSharers.filter((l) => l.projectId === id).map((l) => [l.sourceNodeId, l])).values()].map((l) => (
                  <li key={l.sourceNodeId}>
                    <a href={l.href} className="block truncate rounded-sm text-ui-sm outline-none hover:text-ember-ink focus-visible:ring-[3px] focus-visible:ring-ring/50">
                      {l.sourceTitle || "Untitled"}
                    </a>
                    {l.context && l.kind === "wiki" && (
                      <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        <Context text={l.context} index={index} />
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Section>
      )}

      <Section title="This note links to" count={outgoing.length}>
        {outgoing.length === 0 && <p className="px-3 py-1 text-sm text-muted-foreground">No links in this note yet. Type [[ to link another note.</p>}
        {outgoing.map((l) => (
          <NodeRow key={l.targetNodeId} id={l.targetNodeId} index={index} onOpen={(e) => openFrom(e, l.targetNodeId, l.targetHeading)} />
        ))}
      </Section>

      <Section title="Named but not linked" count={mentions?.length ?? 0}>
        {!mentions && <p className="px-3 py-1 text-sm text-muted-foreground">Looking for mentions…</p>}
        {mentions?.length === 0 && (
          <p className="px-3 py-1 text-sm text-muted-foreground">
            No other note names ‘{target?.title}’{target?.aliases.length ? " or its other names" : ""} without linking it.
          </p>
        )}
        {mentions?.map((m, i) => (
          <NodeRow key={`${m.sourceNodeId}-${i}`} id={m.sourceNodeId} index={index} onOpen={(e) => openFrom(e, m.sourceNodeId)}>
            <div className="mt-0.5 flex items-start gap-2 pl-5">
              <p className="line-clamp-2 flex-1 text-xs leading-relaxed text-muted-foreground">
                …{m.before}
                <mark className="rounded-[2px] bg-gold/25 px-px text-foreground">{m.match}</mark>
                {m.after}…
              </p>
              <Tooltip content={canLinkFrom(m.sourceNodeId) ? "Turn this mention into a link" : "You can't edit that note"}>
                <button
                  type="button"
                  aria-disabled={!canLinkFrom(m.sourceNodeId)}
                  onClick={() => {
                    if (!canLinkFrom(m.sourceNodeId)) return;
                    openNode(m.sourceNodeId, "tab");
                    withEditor(m.sourceNodeId, (handle) => {
                      if (handle.linkMention(m.match, nodeId)) {
                        setMentions((all) => all?.filter((_, j) => j !== i) ?? null);
                        toast.success("Linked.");
                      } else toast.error("That mention has changed. Try again in a moment.");
                    });
                  }}
                  className={cn(
                    "flex h-7 shrink-0 items-center gap-1 rounded px-2 text-xs text-muted-foreground outline-none hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-disabled:opacity-50",
                  )}
                >
                  <Icon name="link-round-linear" className="size-3.5" />
                  Link
                </button>
              </Tooltip>
            </div>
          </NodeRow>
        ))}
      </Section>
    </div>
  );
}
