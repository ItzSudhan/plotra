"use client";

import { Tooltip } from "@plotra/ui/components/tooltip";
import { Icon, type IconName } from "@plotra/icons";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@plotra/ui/components/dialog";
import { confirm } from "@plotra/ui/components/dialogs";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { EmptyState, errorText, ToolbarSelect } from "@/components/views/view-ui";
import { DocDiff } from "@/components/workflow/static-doc";
import { useStore } from "@/components/workspace/stores";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { useWorld, WORLD_NOTICE } from "@/components/world/data";
import type { DocNode } from "@/lib/doc-index";
import { wordDelta } from "@/lib/editorial";
import { cutRelease, type Changelog, type ChangelogEntry } from "@/lib/editorial-actions";
import { read } from "@/lib/read";
import { nodeKindMeta } from "@/lib/tree";
import { canonMeta } from "@/lib/world";
import { plural } from "@/lib/plural";

// Changelog per release (plan.md 2.8): "what changed in the canon since Book
// 2". Cutting a release keeps a snapshot of every note; the changelog compares
// those with the notes as they are now, or as they were at a later release.

const NOW = "now";
const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });
const sectionTitle = "text-ui-sm font-medium";

const groups: Array<{ change: ChangelogEntry["change"]; label: string; icon: IconName; className: string }> = [
  { change: "added", label: "Added", icon: "add-square-linear", className: "text-teal-ink" },
  { change: "changed", label: "Changed", icon: "pen-linear", className: "text-gold-ink" },
  { change: "removed", label: "Removed", icon: "trash-bin-minimalistic-linear", className: "text-destructive" },
];

/** A changed note then and now, paragraph by paragraph. */
function DiffDialog({ entry, sinceTitle, untilTitle, onClose }: { entry: ChangelogEntry; sinceTitle: string; untilTitle: string | null; onClose: () => void }) {
  const { project } = useWorkspace();
  const [sides, setSides] = useState<{ before: DocNode[]; after: DocNode[] } | "board" | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const before = await read("getVersionContent", project.id, entry.versionId!);
      if (before.kind !== "document") return "board" as const;
      let after: DocNode[];
      if (entry.untilVersionId) {
        const later = await read("getVersionContent", project.id, entry.untilVersionId);
        after = later.kind === "document" ? later.value : [];
      } else {
        // As last synced to the server: the same text the changelog compared.
        const [section] = await read("getManuscript", project.id, entry.nodeId);
        after = section?.value ?? [];
      }
      return { before: before.value, after };
    };
    load()
      .then((s) => !cancelled && setSides(s))
      .catch((error) => {
        toast.error(errorText(error));
        if (!cancelled) onClose();
      });
    return () => {
      cancelled = true;
    };
    // onClose is the parent's state setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.nodeId, entry.untilVersionId, entry.versionId, project.id]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-3 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{entry.title}</DialogTitle>
          <DialogDescription>
            Since {sinceTitle}
            {untilTitle ? `, up to ${untilTitle}` : ""} · {wordDelta(entry)}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-40 flex-1 overflow-y-auto rounded-md border bg-background px-5 py-4 font-prose text-[0.97rem] leading-[1.7]">
          {!sides ? (
            <div className="h-24 animate-pulse rounded bg-muted" />
          ) : sides === "board" ? (
            <p className="font-sans text-sm text-muted-foreground">This is a board, not a text: open its version history to compare the cards.</p>
          ) : (
            <DocDiff before={sides.before} after={sides.after} />
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          <ins className="bg-teal/15 text-teal-ink no-underline">Green</ins> was added since the release,{" "}
          <del className="bg-destructive/10 text-destructive">red</del> was removed.
        </p>
      </DialogContent>
    </Dialog>
  );
}

export function ChangelogTab() {
  const { project, binder, modules, notify, openNode, openView } = useWorkspace();
  const { index } = useStore(binder);
  const { data: world, refresh: refreshWorld } = useWorld();
  const canManage = project.actions.includes("manage");
  const releases = useMemo(
    () => [...(world?.releases ?? [])].sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0)),
    [world?.releases],
  );
  const [picked, setPicked] = useState("");
  const [until, setUntil] = useState(NOW);
  const [log, setLog] = useState<{ key: string; changelog: Changelog } | null>(null);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<ChangelogEntry | null>(null);

  // The latest release that has been cut, unless one is picked.
  const release = releases.find((r) => r.id === picked) ?? releases.findLast((r) => r.releasedAt) ?? releases[0];
  const later = release ? releases.slice(releases.indexOf(release) + 1).filter((r) => r.releasedAt) : [];
  const untilRelease = later.find((r) => r.id === until);
  const key = release ? `${release.id}:${untilRelease?.id ?? NOW}:${release.releasedAt ? new Date(release.releasedAt).getTime() : 0}:${tick}` : null;

  useEffect(() => {
    if (!release || !key) return;
    let cancelled = false;
    read("getChangelog", project.id, release.id, untilRelease?.id ?? null)
      .then((changelog) => !cancelled && setLog({ key, changelog }))
      .catch((error) => toast.error(errorText(error)));
    return () => {
      cancelled = true;
    };
    // `key` stands for the release, what it's compared with and when it was cut.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, project.id]);

  if (!world) return <div className="m-4 h-24 animate-pulse rounded-lg bg-muted" />;
  if (!release) {
    return (
      <EmptyState icon="rocket-linear" title="No releases yet">
        <p>A changelog compares the project with how it stood at a release: a book, an episode, a patch.</p>
        {modules.has("releases") ? (
          <button type="button" onClick={() => openView("roadmap")} className="mt-3 underline underline-offset-2 hover:text-foreground">
            Add releases in the roadmap
          </button>
        ) : (
          <p className="mt-2">Switch on the Releases tool in Project settings → Tools to add some.</p>
        )}
      </EmptyState>
    );
  }

  const changelog = log?.key === key ? log.changelog : null;
  const cut = async () => {
    const count = changelog?.cuttable ?? 0;
    const again = release.releasedAt ? ` This replaces the snapshots taken on ${dateFormat.format(new Date(release.releasedAt))}.` : "";
    const ok = await confirm({
      title: `Cut “${release.title}”?`,
      description: `A snapshot of ${count.toLocaleString()} ${plural(count, "note")} is kept as they stand now.${again}`,
      confirmLabel: release.releasedAt ? "Cut again" : "Cut release",
      destructive: Boolean(release.releasedAt),
    });
    if (!ok) return;
    setBusy(true);
    try {
      const done = await cutRelease(project.id, release.id);
      toast.success(`“${release.title}” cut: ${done.snapshots.toLocaleString()} ${plural(done.snapshots, "note")} snapshotted.`);
      notify(WORLD_NOTICE);
      refreshWorld();
      setTick((t) => t + 1);
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const total = changelog ? changelog.entries.length + changelog.retcons.length : 0;

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-5 p-4">
      <div className="flex flex-wrap items-center gap-2 text-ui-sm">
        <ToolbarSelect label="Since" value={release.id} onChange={setPicked} options={releases.map((r) => ({ value: r.id, label: r.releasedAt ? r.title : `${r.title} (not cut)` }))} />
        {release.releasedAt && (
          <ToolbarSelect
            label="compared with"
            value={untilRelease?.id ?? NOW}
            onChange={setUntil}
            options={[{ value: NOW, label: "Now" }, ...later.map((r) => ({ value: r.id, label: r.title }))]}
          />
        )}
        <span className="flex-1" />
        {canManage && (
          <button
            type="button"
            disabled={busy || !changelog}
            onClick={() => void cut()}
            className="flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-ui-sm hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
          >
            <Icon name="rocket-linear" className="size-3.5" />
            {busy ? "Cutting…" : release.releasedAt ? "Cut again" : "Cut release"}
          </button>
        )}
      </div>

      {!changelog ? (
        <div className="h-24 animate-pulse rounded-lg bg-muted" />
      ) : !changelog.releasedAt ? (
        <p className="rounded-lg border border-dashed px-3 py-6 text-center text-ui-sm text-muted-foreground">
          “{release.title}” hasn&apos;t been cut yet, so there&apos;s nothing to compare with. Cutting it keeps a snapshot of all{" "}
          {changelog.cuttable.toLocaleString()} written {plural(changelog.cuttable, "note")} as they stand
          {canManage ? "." : "; someone who can manage the project can do that."}
        </p>
      ) : (
        <>
          <p className="text-ui-sm text-muted-foreground">
            Cut {dateFormat.format(new Date(changelog.releasedAt))}.{" "}
            {total === 0
              ? `Nothing has changed since: ${changelog.unchanged.toLocaleString()} notes are as they were.`
              : `${changelog.entries.length} ${plural(changelog.entries.length, "note")} changed, ${changelog.unchanged.toLocaleString()} unchanged.`}
            {changelog.truncated && " The project has more changed notes than one changelog compares; the rest are left out."}
          </p>

          {groups.map((group) => {
            const entries = changelog.entries.filter((e) => e.change === group.change);
            if (!entries.length) return null;
            return (
              <section key={group.change} className="grid gap-2">
                <h3 className={sectionTitle}>
                  {group.label} · {entries.length}
                </h3>
                <ul className="divide-y rounded-lg border text-ui-sm">
                  {entries.map((entry) => {
                    const canDiff = entry.change === "changed" && entry.versionId;
                    return (
                      <li key={entry.nodeId} className="flex items-center gap-2.5 px-3 py-2">
                        <Icon name={group.icon} className={`size-4 shrink-0 ${group.className}`} />
                        <Icon name={nodeKindMeta[entry.kind].icon} className="size-4 shrink-0 text-muted-foreground" />
                        <Tooltip content={canDiff ? "See what changed" : "Open"}>
                          <button
                            type="button"
                            onClick={() => (canDiff ? setViewing(entry) : index.byId.get(entry.nodeId) && openNode(entry.nodeId, "tab"))}
                            className="min-w-0 flex-1 truncate text-left hover:underline"
                          >
                            {entry.title}
                            {entry.renamedFrom && <span className="ml-1.5 text-xs text-muted-foreground">was “{entry.renamedFrom}”</span>}
                          </button>
                        </Tooltip>
                        <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="size-1.5 rounded-full" style={{ backgroundColor: canonMeta[entry.canon].color }} />
                          {canonMeta[entry.canon].label}
                        </span>
                        <span className="w-24 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                          {entry.change === "removed" ? `${entry.wordsBefore.toLocaleString()} words` : wordDelta(entry)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}

          {changelog.retcons.length > 0 && (
            <section className="grid gap-2">
              <h3 className={sectionTitle}>Retcons · {changelog.retcons.length}</h3>
              <ul className="divide-y rounded-lg border text-ui-sm">
                {changelog.retcons.map((r) => (
                  <li key={r.id} className="grid gap-0.5 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Icon name="history-linear" className="size-4 shrink-0 text-muted-foreground" />
                      <button type="button" onClick={() => openNode(r.nodeId, "tab")} className="min-w-0 flex-1 truncate text-left font-medium hover:underline">
                        {r.title}
                      </button>
                      <span className="shrink-0 text-xs text-faint">
                        {r.previousCanon ? `was ${canonMeta[r.previousCanon].label.toLowerCase()} · ` : ""}
                        {dateFormat.format(new Date(r.createdAt))}
                      </span>
                    </div>
                    <p className="ml-6 break-words whitespace-pre-wrap text-muted-foreground">{r.reason}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {viewing && <DiffDialog entry={viewing} sinceTitle={release.title} untilTitle={untilRelease?.title ?? null} onClose={() => setViewing(null)} />}
    </div>
  );
}
