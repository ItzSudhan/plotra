"use client";

import { canonStatuses, type CanonStatus, type KnowledgeLayer } from "@plotra/db/schema";
import { Icon } from "@plotra/icons";
import { cn } from "@plotra/ui/lib/utils";
import { Tooltip } from "@plotra/ui/components/tooltip";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Field, fieldClass } from "@/components/views/view-ui";
import { timeAgo } from "@/components/workflow/data";
import { useStore } from "@/components/workspace/stores";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { releaseOrder, revealMap } from "@/lib/horizon";
import { read } from "@/lib/read";
import type { BinderNode } from "@/lib/tree";
import { setNodeCanon, setNodeReveal, type RetconRow } from "@/lib/world-actions";
import { canonMeta, claimMeta, layerMeta, NEVER } from "@/lib/world";
import { useWorld, WORLD_NOTICE } from "./data";
import { SelectField } from "@plotra/ui/components/select-field";

/**
 * The inspector's Story tab (plan.md 2.8): a note's canon status and retcon
 * history, when and where the audience learns it, and the tagged blocks inside it.
 */
export function StoryPanel({ nodeId }: { nodeId: string }) {
  const { binder, modules } = useWorkspace();
  const node = useStore(binder).index.byId.get(nodeId);
  if (!node) return null;
  return (
    <div className="grid gap-5 p-4">
      {modules.has("world") && <Canon node={node} />}
      {modules.has("releases") && <Reveal node={node} />}
      <TaggedBlocks node={node} />
    </div>
  );
}

function Canon({ node }: { node: BinderNode }) {
  const { project, patchNode, notify, setUi } = useWorkspace();
  const world = useWorld().data;
  const canEdit = node.actions.includes("edit");
  const [retconning, setRetconning] = useState(false);
  const [reason, setReason] = useState("");
  const [releaseId, setReleaseId] = useState("");
  const [retcons, setRetcons] = useState<RetconRow[] | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    read("listRetcons", project.id, node.id)
      .then((rows) => !cancelled && setRetcons(rows))
      .catch(() => !cancelled && setRetcons([]));
    return () => {
      cancelled = true;
    };
  }, [node.id, project.id, tick]);

  const change = (canon: CanonStatus, why?: string) =>
    patchNode(node.id, { canon }, () => setNodeCanon(project.id, node.id, { canon, reason: why, releaseId: releaseId || null })).then(() => {
      notify(WORLD_NOTICE);
      setTick((t) => t + 1);
    });

  return (
    <Field label="Canon">
      <div className="grid gap-2">
        <div className="flex flex-wrap gap-1">
          {canonStatuses.map((c) => (
            <Tooltip key={c} content={canonMeta[c].description}>
              <button
                type="button"
                disabled={!canEdit}
                aria-pressed={node.canon === c}
                onClick={() => {
                  if (c === node.canon) return;
                  // A retcon needs its reason first; everything else applies at once.
                  if (c === "retconned") setRetconning(true);
                  else void change(c);
                }}
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded-full border px-2 text-xs text-muted-foreground hover:text-foreground disabled:pointer-events-none",
                  node.canon === c && "border-transparent bg-accent text-foreground",
                )}
              >
                <span className="size-1.5 rounded-full" style={{ backgroundColor: canonMeta[c].color }} aria-hidden />
                {canonMeta[c].label}
              </button>
            </Tooltip>
          ))}
        </div>
        {retconning && (
          <form
            className="grid gap-2 rounded-md border p-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (!reason.trim()) return;
              void change("retconned", reason).then(() => {
                setRetconning(false);
                setReason("");
              });
            }}
          >
            <textarea
              autoFocus
              value={reason}
              rows={3}
              onChange={(e) => setReason(e.target.value)}
              aria-label="Why the canon changed"
              placeholder="What changed, and why? e.g. “Her brother survives: Book 3 needs him.”"
              className="w-full resize-y rounded-md border border-input bg-transparent px-2 py-1.5 text-ui-sm outline-none placeholder:text-faint focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
            {(world?.releases.length ?? 0) > 0 && (
              <SelectField value={releaseId} onValueChange={(v) => setReleaseId(v)} className={fieldClass} aria-label="Changed in">
                <option value="">Changed in… (optional)</option>
                {world!.releases.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </SelectField>
            )}
            <p className="text-xs text-faint">The text as it stands now is kept as a version, so the old canon can always be read.</p>
            <div className="flex justify-end gap-1.5">
              <button type="button" onClick={() => setRetconning(false)} className="h-7 rounded-md px-2 text-xs hover:bg-accent">
                Cancel
              </button>
              <button type="submit" disabled={!reason.trim()} className="h-7 rounded-md bg-foreground px-2.5 text-xs text-background disabled:opacity-50">
                Retcon
              </button>
            </div>
          </form>
        )}
        {retcons && retcons.length > 0 && (
          <ol className="grid gap-2 border-l pl-3">
            {retcons.map((r) => {
              const release = world?.releases.find((x) => x.id === r.releaseId);
              return (
                <li key={r.id} className="text-ui-sm">
                  <p className="leading-snug">{r.reason}</p>
                  <p className="mt-0.5 text-xs text-faint">
                    {release ? `Changed in ${release.title} · ` : ""}
                    {r.previousCanon ? `was ${canonMeta[r.previousCanon].label.toLowerCase()} · ` : ""}
                    {r.createdBy ?? "Someone"}, {timeAgo(r.createdAt)}
                    {r.versionId && (
                      <>
                        {" · "}
                        <button type="button" onClick={() => setUi({ rightTab: "history" })} className="text-ember-ink hover:underline">
                          old text in History
                        </button>
                      </>
                    )}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </Field>
  );
}

function Reveal({ node }: { node: BinderNode }) {
  const { project, binder, patchNode, notify, openView } = useWorkspace();
  const { nodes, index } = useStore(binder);
  const world = useWorld().data;
  const canEdit = node.actions.includes("edit");
  const releases = world?.releases ?? [];

  // What reveals this note when it has no tag of its own: a folder above, or the release that ships it.
  const inherited = (() => {
    if (node.revealReleaseId) return null;
    const id = revealMap(nodes, releases).get(node.id);
    return id ? releases.find((r) => r.id === id) : null;
  })();
  const order = releaseOrder(releases);
  const run = (patch: { releaseId?: string | null; channel?: string | null; layer?: KnowledgeLayer }) =>
    patchNode(
      node.id,
      {
        ...(patch.releaseId !== undefined && { revealReleaseId: patch.releaseId }),
        ...(patch.channel !== undefined && { revealChannel: patch.channel }),
        ...(patch.layer !== undefined && { layer: patch.layer }),
      },
      () => setNodeReveal(project.id, node.id, patch),
    ).then(() => notify(WORLD_NOTICE));

  if (!world) return <div className="h-16 animate-pulse rounded-md bg-muted" />;

  return (
    <Field label="Revealed to the audience">
      <div className="grid gap-2">
        {releases.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No releases yet.{" "}
            <button type="button" onClick={() => openView("roadmap")} className="text-ember-ink hover:underline">
              Add your books, episodes or patches
            </button>{" "}
            to say what each one reveals.
          </p>
        ) : (
          <>
            <SelectField
              value={node.revealReleaseId ?? ""}
              disabled={!canEdit}
              onValueChange={(v) => void run({ releaseId: v || null })}
              className={fieldClass}
              aria-label="Revealed in"
            >
              <option value="">{inherited ? `With its folder (${inherited.title})` : "Not revealed yet"}</option>
              {releases.map((r) => (
                <option key={r.id} value={r.id}>
                  In {r.title}
                </option>
              ))}
            </SelectField>
            {(node.revealReleaseId || inherited) && (
              <SelectField
                value={node.revealChannel ?? ""}
                disabled={!canEdit}
                onValueChange={(v) => void run({ channel: v || null })}
                className={fieldClass}
                aria-label="Where it's revealed"
              >
                <option value="">Channel not specified</option>
                {world.channels.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </SelectField>
            )}
          </>
        )}
        <div className="flex gap-1">
          {(["truth", "belief"] as const).map((layer) => (
            <Tooltip key={layer} content={layerMeta[layer].description}>
              <button
                type="button"
                disabled={!canEdit}
                aria-pressed={node.layer === layer}
                onClick={() => node.layer !== layer && void run({ layer })}
                className={cn(
                  "flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md border text-xs text-muted-foreground hover:text-foreground disabled:pointer-events-none",
                  node.layer === layer && "border-transparent bg-accent text-foreground",
                )}
              >
                <Icon name={layer === "truth" ? "check-circle-linear" : "incognito-linear"} className="size-3.5" />
                {layerMeta[layer].label}
              </button>
            </Tooltip>
          ))}
        </div>
        {node.layer === "belief" && <p className="text-xs text-faint">A belief: what people are told or think is true, not what is.</p>}
        {releases.length > 1 && (node.revealReleaseId || inherited) && (
          <p className="text-xs text-faint">
            Hidden when the world is shown as of anything before{" "}
            {releases.find((r) => order.get(r.id) === order.get(node.revealReleaseId ?? inherited!.id))?.title}.
          </p>
        )}
        {index.children.get(node.id)?.some((c) => !c.deletedAt) && node.revealReleaseId && (
          <p className="text-xs text-faint">Everything inside is revealed with it, unless it has its own tag.</p>
        )}
      </div>
    </Field>
  );
}

/** Blocks of the note that carry their own tags, as last synced. */
function TaggedBlocks({ node }: { node: BinderNode }) {
  const { setUi, editors } = useWorkspace();
  const world = useWorld().data;
  const facts = (world?.facts ?? []).filter((f) => f.nodeId === node.id);
  const canEdit = node.actions.includes("edit");

  const describe = (f: (typeof facts)[number]) => {
    const parts: string[] = [];
    if (f.canon) parts.push(canonMeta[f.canon].label);
    if (f.reveal === NEVER) parts.push("never revealed");
    else if (f.reveal) parts.push(`revealed in ${world?.releases.find((r) => r.id === f.reveal)?.title ?? "a removed release"}`);
    if (f.layer === "belief") parts.push("belief");
    if (f.claim) parts.push(claimMeta[f.claim].label.toLowerCase());
    return parts.join(" · ");
  };

  return (
    <Field label="Tagged passages">
      {facts.length === 0 ? (
        <p className="text-xs text-faint">
          {canEdit
            ? "Select a paragraph and choose “Tag block” to give it its own canon status, reveal or fact-check."
            : "No passage of this note has its own tags."}
        </p>
      ) : (
        <ul className="grid gap-1.5">
          {facts.map((f) => (
            <li key={f.blockId}>
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => {
                  if (!editors.current.get(node.id)) toast.message("Open the note to edit its tags.");
                  else setUi({ tagging: { nodeId: node.id, blockIds: [f.blockId] } });
                }}
                className="block w-full rounded-md border px-2.5 py-1.5 text-left enabled:hover:bg-sidebar-accent"
              >
                <span className="line-clamp-2 text-ui-sm leading-snug">{f.excerpt || "(empty block)"}</span>
                <span className="mt-0.5 block text-meta text-faint">{describe(f)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <button
          type="button"
          onClick={() => editors.current.get(node.id)?.tagBlocks?.()}
          className="mt-1 flex h-7 items-center justify-center gap-1.5 rounded-md border text-ui-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
        >
          <Icon name="tag-linear" className="size-3.5" />
          Tag the selected block
        </button>
      )}
    </Field>
  );
}
