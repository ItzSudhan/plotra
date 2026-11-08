"use client";

import { yTextToSlateElement } from "@slate-yjs/core";
import { Icon } from "@plotra/icons";
import { confirm } from "@plotra/ui/components/dialogs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@plotra/ui/components/dialog";
import { cn } from "@plotra/ui/lib/utils";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import * as Y from "yjs";
import { useNodeReview } from "@/components/editorial/data";
import { useStore } from "@/components/workspace/stores";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import type { DocNode } from "@/lib/doc-index";
import { read } from "@/lib/read";
import { createVersion, deleteVersion, renameVersion, type VersionContent, type VersionRow } from "@/lib/workflow-actions";
import { Avatar, timeAgo, usePeople } from "./data";
import { DocDiff, StaticValue } from "./static-doc";
import { isDocumentKind } from "@/lib/story";
import { errorText } from "@/lib/errors";

// Version history (plan.md 2.6): named snapshots, automatic ones every half
// hour of editing, preview, compare with now, and restore.

const versionsNotice = (nodeId: string) => `versions:${nodeId}`;


function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** The document as it is now: from the open editor, else as last synced to the server. */
async function currentValue(projectId: string, nodeId: string, snapshot: Uint8Array | null): Promise<DocNode[]> {
  if (snapshot) {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, snapshot);
    const value = (yTextToSlateElement(doc.get("content", Y.XmlText)).children ?? []) as unknown as DocNode[];
    doc.destroy();
    return value;
  }
  const [section] = await read("getManuscript", projectId, nodeId);
  return section?.value ?? [];
}

export function HistoryPanel({ nodeId }: { nodeId: string }) {
  const { project, binder, editors, notify, onNotice, withEditor, openNode } = useWorkspace();
  const node = useStore(binder).index.byId.get(nodeId);
  const review = useNodeReview(nodeId);
  const people = usePeople();
  const [versions, setVersions] = useState<VersionRow[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<VersionRow | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    read("listVersions", project.id, nodeId)
      .then((v) => !cancelled && setVersions(v))
      .catch(() => !cancelled && setVersions([]));
    return () => {
      cancelled = true;
    };
  }, [nodeId, project.id, tick]);
  useEffect(() => onNotice((n) => n === versionsNotice(nodeId) && setTick((t) => t + 1)), [nodeId, onNotice]);

  if (!node) return null;
  const canEdit = node.actions.includes("edit");
  const changed = () => {
    notify(versionsNotice(nodeId));
    setTick((t) => t + 1);
  };

  const save = async (label: string | null, restoring?: string) => {
    const snapshot = editors.current.get(nodeId)?.snapshot() ?? null;
    return createVersion(project.id, nodeId, label, snapshot ? toBase64(snapshot) : undefined, restoring);
  };

  return (
    <div className="grid gap-4 p-3">
      {canEdit && (
        <form
          className="flex gap-1.5"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await save(name.trim() || null);
              setName("");
              changed();
              toast.success("Version saved.");
            } catch (error) {
              toast.error(errorText(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name this version (optional)"
            aria-label="Name this version (optional)"
            className="h-8 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2.5 text-ui-sm outline-none placeholder:text-faint focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          <button type="submit" disabled={busy} className="h-8 shrink-0 rounded-md bg-foreground px-3 text-ui-sm text-background disabled:opacity-50">
            Save
          </button>
        </form>
      )}
      {versions === null ? (
        <div className="h-16 animate-pulse rounded-lg bg-muted" />
      ) : versions.length === 0 ? (
        <p className="py-3 text-center text-xs text-muted-foreground">
          No versions yet. Plotra keeps one automatically every half hour while people write, and you can save named ones any time.
        </p>
      ) : (
        <ol className="grid gap-1">
          {versions.map((v) => {
            const author = v.createdById ? people.get(v.createdById) : undefined;
            return (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => setViewing(v)}
                  className="grid w-full gap-0.5 rounded-md px-2.5 py-2 text-left hover:bg-sidebar-accent"
                >
                  <span className="flex items-center gap-1.5 text-ui-sm">
                    <Icon name={v.auto ? "clock-circle-linear" : "bookmark-linear"} className={cn("size-3.5 shrink-0", v.auto ? "text-faint" : "text-ember-ink")} />
                    <span className={cn("truncate", v.auto ? "text-muted-foreground" : "font-medium")}>{v.name ?? "Automatic snapshot"}</span>
                  </span>
                  <span className="flex items-center gap-1.5 pl-5 text-xs text-muted-foreground">
                    {author && <Avatar person={author} className="size-4" />}
                    {timeAgo(v.createdAt)} · {v.wordCount.toLocaleString()} words
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
      {viewing && (
        <VersionDialog
          version={viewing}
          nodeId={nodeId}
          canEdit={canEdit}
          canRestore={canEdit && !review.readOnly}
          isCanvas={!isDocumentKind(node.kind)}
          onClose={() => setViewing(null)}
          onChanged={changed}
          onRestore={async (content) => {
            try {
              await save(`Before restoring “${viewing.name ?? "automatic snapshot"}”`, viewing.name ?? "an automatic snapshot");
              const value =
                content.kind === "document"
                  ? content.value
                  : content.kind === "canvas"
                    ? { cards: content.cards, edges: content.edges, marks: content.marks, map: content.map }
                    : { nodes: content.nodes, edges: content.edges, variables: content.variables };
              if (!editors.current.get(nodeId)) openNode(nodeId, "tab");
              withEditor(nodeId, (handle) => handle.replaceContent(value));
              setViewing(null);
              changed();
              toast.success("Restored. The version before it was saved, so you can undo this from history.");
            } catch (error) {
              toast.error(errorText(error));
            }
          }}
        />
      )}
    </div>
  );
}

function VersionDialog({
  version,
  nodeId,
  canEdit,
  canRestore,
  isCanvas,
  onClose,
  onChanged,
  onRestore,
}: {
  version: VersionRow;
  nodeId: string;
  canEdit: boolean;
  /** False while the note is locked in review for this user. */
  canRestore: boolean;
  isCanvas: boolean;
  onClose: () => void;
  onChanged: () => void;
  onRestore: (content: VersionContent) => Promise<void>;
}) {
  const { project, binder, editors, user } = useWorkspace();
  const { index } = useStore(binder);
  const [content, setContent] = useState<VersionContent | null>(null);
  const [now, setNow] = useState<DocNode[] | null>(null);
  const [mode, setMode] = useState<"version" | "compare">("compare");
  const [renaming, setRenaming] = useState(version.name ?? "");

  useEffect(() => {
    let cancelled = false;
    read("getVersionContent", project.id, version.id)
      .then((c) => !cancelled && setContent(c))
      .catch((error) => toast.error(errorText(error)));
    if (!isCanvas) {
      currentValue(project.id, nodeId, editors.current.get(nodeId)?.snapshot() ?? null)
        .then((v) => !cancelled && setNow(v))
        .catch(() => !cancelled && setNow([]));
    }
    return () => {
      cancelled = true;
    };
  }, [editors, isCanvas, nodeId, project.id, version.id]);

  const canDelete = canEdit && (version.createdById === user.id || version.auto);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-3 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{version.name ?? "Automatic snapshot"}</DialogTitle>
          <DialogDescription>
            Saved {new Date(version.createdAt).toLocaleString()} · {version.wordCount.toLocaleString()} words
          </DialogDescription>
        </DialogHeader>
        {!isCanvas && (
          <div className="flex gap-1">
            {(["compare", "version"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={cn("h-8 rounded-md px-2.5 text-ui-sm text-muted-foreground hover:text-foreground", mode === m && "bg-accent text-foreground")}
              >
                {m === "compare" ? "Changes since" : "This version"}
              </button>
            ))}
          </div>
        )}
        <div className="min-h-40 flex-1 overflow-y-auto rounded-md border bg-background px-5 py-4 font-prose text-[0.97rem] leading-[1.7]">
          {!content ? (
            <div className="h-24 animate-pulse rounded bg-muted" />
          ) : content.kind === "canvas" ? (
            <p className="font-sans text-sm text-muted-foreground">
              {Object.keys(content.marks).length || content.map.fileId
                ? `${Object.keys(content.marks).length} pins, regions and paths. Restore to see them on the map.`
                : `${Object.keys(content.cards).length} cards and ${Object.keys(content.edges).length} connections. Restore to see it on the canvas.`}
            </p>
          ) : content.kind === "dialogue" ? (
            <p className="font-sans text-sm text-muted-foreground">
              {Object.keys(content.nodes).length} lines and choices, {Object.keys(content.edges).length} connections. Restore to see it in the dialogue.
            </p>
          ) : mode === "version" ? (
            <StaticValue value={content.value} ctx={{ index, citationStyle: project.settings.citationStyle }} />
          ) : now ? (
            <DocDiff before={content.value} after={now} />
          ) : (
            <div className="h-24 animate-pulse rounded bg-muted" />
          )}
        </div>
        {mode === "compare" && !isCanvas && (
          <p className="text-xs text-muted-foreground">
            <ins className="bg-teal/15 text-teal-ink no-underline">Green</ins> was added since this version,{" "}
            <del className="bg-destructive/10 text-destructive">red</del> was removed.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <form
              className="flex min-w-0 flex-1 gap-1.5"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await renameVersion(project.id, version.id, renaming);
                  onChanged();
                  toast.success("Renamed.");
                } catch (error) {
                  toast.error(errorText(error));
                }
              }}
            >
              <input
                value={renaming}
                onChange={(e) => setRenaming(e.target.value)}
                placeholder="Name it to keep it for good"
                aria-label="Version name. Named versions are kept for good."
                className="h-8 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2.5 text-ui-sm outline-none placeholder:text-faint focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
              <button type="submit" className="h-8 rounded-md border px-3 text-ui-sm hover:bg-accent">
                Rename
              </button>
            </form>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={async () => {
                const ok = await confirm({
                  title: `Delete “${version.name ?? "Automatic snapshot"}”?`,
                  description: "This version of the note is gone for good. The note itself isn't changed.",
                });
                if (!ok) return;
                try {
                  await deleteVersion(project.id, version.id);
                  onChanged();
                  onClose();
                } catch (error) {
                  toast.error(errorText(error));
                }
              }}
              className="h-8 rounded-md px-3 text-ui-sm text-destructive hover:bg-destructive/10"
            >
              Delete
            </button>
          )}
          {canRestore && (
            <button
              type="button"
              disabled={!content}
              onClick={() => content && void onRestore(content)}
              className="ml-auto flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-ui-sm text-background disabled:opacity-50"
            >
              <Icon name="undo-left-round-linear" className="size-3.5" />
              Restore this version
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
