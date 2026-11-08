"use client";

import { releaseKinds, type ReleaseKind } from "@plotra/db/schema";
import { Icon } from "@plotra/icons";
import { cn } from "@plotra/ui/lib/utils";
import { generateKeyBetween } from "fractional-indexing";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/components/workspace/stores";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { useWorld, WORLD_NOTICE } from "@/components/world/data";
import { NodeIcon } from "@/components/world/entity-icon";
import { revealMap } from "@/lib/horizon";
import { ancestors, containerKinds, flatten, type BinderNode } from "@/lib/tree";
import { createRelease, deleteRelease, setNodeReveal, updateRelease, type FactRow, type ReleaseRow } from "@/lib/world-actions";
import { NEVER, releaseKindMeta } from "@/lib/world";
import { CommitInput, Divider, EmptyState, errorText, ToolButton, Toolbar, ToolbarSelect } from "./view-ui";
import { SelectField } from "@plotra/ui/components/select-field";
import { confirm } from "@plotra/ui/components/dialogs";
import { IconButton } from "@plotra/ui/components/icon-button";
import { plural } from "@/lib/plural";

// Release roadmap (plan.md 2.8 "Releases & reveal planning"): what the story
// ships in, down the side, and where reveals happen, across the top. Each cell
// lists what the audience learns there. The "World as of" switch sets the
// spoiler horizon for the whole workspace.

const NO_CHANNEL = "";

type Reveal = { key: string; node: BinderNode; fact?: FactRow; belief: boolean };

export function RoadmapView() {
  const { project, binder, horizon, notify, openNode, patchNode, setUi } = useWorkspace();
  const { nodes, index } = useStore(binder);
  const { data: world, refresh } = useWorld();
  const horizonId = useStore(horizon);
  const canEdit = project.actions.includes("edit");
  const [adding, setAdding] = useState<{ releaseId: string; channel: string } | null>(null);

  const releases = useMemo(() => world?.releases ?? [], [world?.releases]);
  const channels = useMemo(() => world?.channels ?? [], [world?.channels]);
  const live = useMemo(() => flatten(index), [index]);

  // Reveals by release and channel: tagged notes, and tagged blocks inside notes.
  const cells = useMemo(() => {
    const map = new Map<string, Reveal[]>();
    const push = (releaseId: string, channel: string | null, reveal: Reveal) => {
      const key = `${releaseId}\n${channel && channels.includes(channel) ? channel : NO_CHANNEL}`;
      const list = map.get(key);
      if (list) list.push(reveal);
      else map.set(key, [reveal]);
    };
    for (const n of live) if (n.revealReleaseId) push(n.revealReleaseId, n.revealChannel, { key: n.id, node: n, belief: n.layer === "belief" });
    for (const f of world?.facts ?? []) {
      const n = index.byId.get(f.nodeId);
      if (n && !n.deletedAt && f.reveal && f.reveal !== NEVER) push(f.reveal, f.channel, { key: `${f.nodeId}:${f.blockId}`, node: n, fact: f, belief: f.layer === "belief" });
    }
    return map;
  }, [channels, index, live, world?.facts]);

  const revealedBy = useMemo(() => revealMap(nodes, releases), [nodes, releases]);
  const unrevealed = useMemo(
    () => live.filter((n) => !revealedBy.has(n.id) && !containerKinds.includes(n.kind) && n.kind !== "canvas" && n.kind !== "timeline"),
    [live, revealedBy],
  );
  const secrets = (world?.facts ?? []).filter((f) => f.reveal === NEVER && index.byId.has(f.nodeId));
  const folders = useMemo(() => live.filter((n) => containerKinds.includes(n.kind)), [live]);
  const hasUnsorted = releases.some((r) => cells.has(`${r.id}\n${NO_CHANNEL}`));

  const changed = () => {
    notify(WORLD_NOTICE);
    refresh();
  };
  const run = async (work: () => Promise<unknown>) => {
    try {
      await work();
      changed();
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  const move = (i: number, by: -1 | 1) => {
    const j = i + by;
    if (j < 0 || j >= releases.length) return;
    const [lo, hi] = by < 0 ? [releases[j - 1]?.position ?? null, releases[j].position] : [releases[j].position, releases[j + 1]?.position ?? null];
    void run(() => updateRelease(project.id, releases[i].id, { position: generateKeyBetween(lo, hi) }));
  };

  const setReveal = (node: BinderNode, releaseId: string | null, channel: string | null) =>
    patchNode(node.id, { revealReleaseId: releaseId, revealChannel: channel }, () => setNodeReveal(project.id, node.id, { releaseId, channel })).then(changed);

  if (!world) return <div className="m-6 h-40 animate-pulse rounded-lg bg-muted" />;

  const columns = [...channels, ...(hasUnsorted ? [NO_CHANNEL] : [])];

  return (
    <div className="flex h-full flex-col">
      <Toolbar>
        <span className="font-medium text-foreground">Release roadmap</span>
        <ToolButton icon="add-square-linear" label="Add a release" disabled={!canEdit} onClick={() => void run(() => createRelease(project.id))}>
          Release
        </ToolButton>
        <ToolButton icon="tuning-2-linear" label="Edit reveal channels" onClick={() => setUi({ projectSettings: true })}>
          Channels
        </ToolButton>
        <Divider />
        <Icon name="eye-linear" className="size-4 shrink-0 text-muted-foreground" />
        <ToolbarSelect
          label="World as of"
          value={horizonId && releases.some((r) => r.id === horizonId) ? horizonId : ""}
          onChange={(id) => horizon.set(id || null)}
          options={[{ value: "", label: "Everything (no spoiler filter)" }, ...releases.map((r) => ({ value: r.id, label: r.title }))]}
        />
        <span className="ml-auto text-xs text-faint">Tag a note in the inspector&apos;s Story tab, or here, to say when the audience learns it.</span>
      </Toolbar>
      {releases.length === 0 ? (
        <EmptyState icon="rocket-bold-duotone" title="No releases yet" action={canEdit && { label: "Add a release", onClick: () => void run(() => createRelease(project.id)) }}>
          Releases are whatever your story ships in: books, episodes, issues, patches, sessions. Add them in order, then say what each one reveals.
        </EmptyState>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="border-separate border-spacing-0 text-ui-sm">
            <thead className="sticky top-0 z-20">
              <tr>
                <th className="sticky left-0 z-30 w-72 min-w-72 border-r border-b bg-sidebar px-3 py-2 text-left text-meta font-medium text-muted-foreground">
                  Release
                </th>
                {columns.map((c) => (
                  <th key={c} className="w-60 min-w-60 border-r border-b bg-sidebar px-3 py-2 text-left text-meta font-medium text-muted-foreground">
                    {c || "No channel"}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {releases.map((r, i) => (
                <tr key={r.id} className={cn("align-top", horizonId === r.id && "bg-ember/[0.04]")}>
                  <ReleaseHeader
                    release={r}
                    folders={folders}
                    shipped={r.nodeId ? index.byId.get(r.nodeId) : undefined}
                    words={r.nodeId ? [index.byId.get(r.nodeId), ...flatten(index, r.nodeId)].reduce((sum, n) => sum + (n?.wordCount ?? 0), 0) : 0}
                    editable={canEdit}
                    isHorizon={horizonId === r.id}
                    onPatch={(patch) => void run(() => updateRelease(project.id, r.id, patch))}
                    onMove={(by) => move(i, by)}
                    onDelete={async () => {
                      const count =
                        live.filter((n) => n.revealReleaseId === r.id).length + (world?.facts ?? []).filter((f) => f.reveal === r.id).length;
                      const ok = await confirm({
                        title: `Delete ‘${r.title}’?`,
                        description:
                          count > 0
                            ? `${count} ${count === 1 ? "note or passage it reveals goes" : "notes and passages it reveals go"} back to not revealed yet. Your notes themselves stay as they are.`
                            : "Nothing is revealed in it yet, so no notes are affected.",
                        confirmLabel: "Delete release",
                      });
                      if (ok) void run(() => deleteRelease(project.id, r.id)).then(() => notify("binder"));
                    }}
                    onOpen={(id) => openNode(id, "tab")}
                  />
                  {columns.map((c) => {
                    const reveals = cells.get(`${r.id}\n${c}`) ?? [];
                    const isAdding = adding?.releaseId === r.id && adding.channel === c;
                    return (
                      <td key={c} className="group/cell border-r border-b px-2 py-2">
                        <ul className="grid gap-1">
                          {reveals.map((reveal) => (
                            <li key={reveal.key} className="group/reveal flex items-start gap-1">
                              <button
                                type="button"
                                onClick={() => openNode(reveal.node.id, "tab")}
                                className="flex min-w-0 flex-1 items-start gap-1.5 rounded-md px-1.5 py-1 text-left hover:bg-accent"
                              >
                                <NodeIcon node={reveal.node} className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                                <span className="min-w-0">
                                  <span className="block truncate font-medium">{reveal.node.title}</span>
                                  {reveal.fact && <span className="line-clamp-2 text-xs text-muted-foreground">{reveal.fact.excerpt}</span>}
                                  {reveal.belief && (
                                    <span className="mt-0.5 flex w-fit items-center gap-1 rounded bg-muted px-1 text-meta text-muted-foreground">
                                      <Icon name="incognito-linear" className="size-3" />
                                      Belief
                                    </span>
                                  )}
                                </span>
                              </button>
                              {canEdit && !reveal.fact && (
                                <IconButton
                                  icon="close-linear"
                                  size="xs"
                                  label={`Stop revealing ‘${reveal.node.title}’ here`}
                                  onClick={() => void setReveal(reveal.node, null, null)}
                                  className="mt-0.5 opacity-0 group-focus-within/reveal:opacity-100 group-hover/reveal:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
                                />
                              )}
                            </li>
                          ))}
                        </ul>
                        {isAdding ? (
                          <SelectField
                            defaultOpen
                            placeholder="Reveal which note?"
                            onOpenChange={(open) => !open && setAdding(null)}
                            onValueChange={(v) => {
                              const node = index.byId.get(v);
                              setAdding(null);
                              if (node) void setReveal(node, r.id, c || null);
                            }}
                            className="mt-1 h-7 w-full rounded-md border border-input bg-background px-1.5 text-ui-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                            aria-label="Note to reveal here"
                          >
                            {live
                              .filter((n) => n.revealReleaseId !== r.id && n.actions.includes("edit"))
                              .map((n) => (
                                <option key={n.id} value={n.id}>
                                  {[...ancestors(index, n.id).map((a) => a.title), n.title].join(" / ")}
                                </option>
                              ))}
                          </SelectField>
                        ) : (
                          canEdit &&
                          c !== NO_CHANNEL && (
                            <button
                              type="button"
                              onClick={() => setAdding({ releaseId: r.id, channel: c })}
                              className={cn(
                                "mt-1 flex h-7 items-center gap-1 rounded px-1.5 text-xs text-faint hover:bg-accent hover:text-foreground",
                                reveals.length > 0 &&
                                  "opacity-0 group-focus-within/cell:opacity-100 group-hover/cell:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100",
                              )}
                            >
                              <Icon name="add-linear" className="size-3" />
                              Reveal a note
                            </button>
                          )
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          <section className="max-w-4xl px-4 py-5">
            <h2 className="text-meta font-medium text-muted-foreground">
              Not revealed yet ({unrevealed.length}){secrets.length > 0 ? ` · ${secrets.length} ${plural(secrets.length, "passage")} never revealed` : ""}
            </h2>
            <p className="mt-1 text-xs text-faint">
              Notes no release reveals. They&apos;re hidden whenever the world is shown as of a release, and left out of the public wiki. Scenes inside a folder
              a release ships are revealed by it automatically.
            </p>
            <ul className="mt-2 grid gap-0.5 sm:grid-cols-2">
              {unrevealed.slice(0, 60).map((n) => (
                <li key={n.id} className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 hover:bg-accent/50">
                  <NodeIcon node={n} className="size-3.5 shrink-0 text-muted-foreground" />
                  <button type="button" onClick={() => openNode(n.id, "tab")} className="min-w-0 flex-1 truncate text-left hover:underline">
                    {n.title}
                  </button>
                  {n.actions.includes("edit") && (
                    <SelectField
                      value=""
                      onValueChange={(v) => v && void setReveal(n, v, null)}
                      className="h-6 w-28 shrink-0 rounded border border-transparent bg-transparent text-xs text-muted-foreground hover:border-input"
                      aria-label={`Reveal ${n.title} in`}
                    >
                      <option value="">Reveal in…</option>
                      {releases.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.title}
                        </option>
                      ))}
                    </SelectField>
                  )}
                </li>
              ))}
            </ul>
            {unrevealed.length > 60 && <p className="mt-1 text-xs text-faint">…and {unrevealed.length - 60} more.</p>}
          </section>
        </div>
      )}
    </div>
  );
}

function ReleaseHeader({
  release,
  folders,
  shipped,
  words,
  editable,
  isHorizon,
  onPatch,
  onMove,
  onDelete,
  onOpen,
}: {
  release: ReleaseRow;
  folders: BinderNode[];
  shipped: BinderNode | undefined;
  words: number;
  editable: boolean;
  isHorizon: boolean;
  onPatch: (patch: { title?: string; kind?: ReleaseKind; date?: string | null; nodeId?: string | null }) => void;
  onMove: (by: -1 | 1) => void;
  onDelete: () => void | Promise<void>;
  onOpen: (nodeId: string) => void;
}) {
  const small = "h-6 rounded border border-transparent bg-transparent px-1 text-xs text-muted-foreground hover:border-input disabled:hover:border-transparent";
  return (
    <td className="sticky left-0 z-10 w-72 min-w-72 border-r border-b bg-background px-2 py-2">
      <div className="flex items-center gap-1">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Release title</span>
          <CommitInput value={release.title} disabled={!editable} className="h-7 border-transparent font-medium hover:border-input" onCommit={(title) => title.trim() && onPatch({ title })} />
        </label>
        {isHorizon && (
          <span className="flex shrink-0 items-center text-ember-ink">
            <Icon name="eye-linear" className="size-4" />
            <span className="sr-only">The world is shown as of this release</span>
          </span>
        )}
        {editable && (
          <div className="flex shrink-0">
            <IconButton size="xs" label="Move earlier" icon="alt-arrow-up-linear" onClick={() => onMove(-1)} />
            <IconButton size="xs" label="Move later" icon="alt-arrow-down-linear" onClick={() => onMove(1)} />
            <IconButton size="xs" variant="destructive" label="Delete release" icon="trash-bin-minimalistic-linear" onClick={onDelete} />
          </div>
        )}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        <SelectField value={release.kind} disabled={!editable} onValueChange={(v) => onPatch({ kind: v as ReleaseKind })} className={small} aria-label="Type of release">
          {releaseKinds.map((k) => (
            <option key={k} value={k}>
              {releaseKindMeta[k].label}
            </option>
          ))}
        </SelectField>
        <input
          type="date"
          value={release.date ?? ""}
          disabled={!editable}
          onChange={(e) => onPatch({ date: e.target.value || null })}
          className={small}
          aria-label="Release date"
        />
        {release.releasedAt && <span className="rounded bg-teal/15 px-1.5 text-meta font-medium text-teal-ink">Released</span>}
      </div>
      <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
        <span className="shrink-0 pl-1">Ships</span>
        <SelectField
          value={release.nodeId ?? ""}
          disabled={!editable}
          onValueChange={(v) => onPatch({ nodeId: v || null })}
          className={cn(small, "min-w-0 flex-1")}
          aria-label="The folder this release ships"
        >
          <option value="">nothing from the binder</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.title}
            </option>
          ))}
        </SelectField>
        {shipped && (
          <IconButton size="xs" label={`Open ${shipped.title}`} icon="square-arrow-right-up-linear" onClick={() => onOpen(shipped.id)} />
        )}
      </div>
      {shipped && <p className="mt-0.5 pl-1 text-xs text-faint">{words.toLocaleString()} words, revealed by this release</p>}
    </td>
  );
}

