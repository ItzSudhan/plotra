"use client";

import { Icon } from "@plotra/icons";
import { Button } from "@plotra/ui/components/button";
import { confirm } from "@plotra/ui/components/dialogs";
import { Input } from "@plotra/ui/components/input";
import { SelectField } from "@plotra/ui/components/select-field";
import { Switch } from "@plotra/ui/components/switch";
import { cn } from "@plotra/ui/lib/utils";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useWorld } from "@/components/world/data";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { errorText } from "@/lib/errors";
import { publicPath } from "@/lib/public-link";
import { createShareLink, deleteShareLink, listShareLinks, resetShareLink, updateShareLink, type ShareLinkPatch, type ShareLinkState } from "@/lib/share-actions";

/**
 * The read-only links in the Share dialog (plan.md 2.9): a few per project,
 * each for an audience: everything, or the project as of a release (the
 * spoiler horizon) for players and readers who mustn't see what comes later;
 * canon only; in the public gallery or not; copyable as a template or not.
 * Shown to people who manage the project; for anyone else the links don't load
 * and the section stays away.
 */
export function ShareLinkSection({ projectId }: { projectId: string }) {
  const projectTitle = useWorkspace().project.title;
  const [links, setLinks] = useState<ShareLinkState[] | null>(null);
  const [busy, setBusy] = useState(false);
  const releases = useWorld().data?.releases ?? [];

  useEffect(() => {
    let current = true;
    listShareLinks(projectId)
      .then((rows) => current && setLinks(rows))
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [projectId]);

  if (!links) return null;

  const run = async <T,>(work: () => Promise<T>, done: (value: T) => void, message?: string) => {
    setBusy(true);
    try {
      done(await work());
      if (message) toast.success(message);
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(false);
    }
  };
  const replace = (row: ShareLinkState) => setLinks((all) => all?.map((l) => (l.id === row.id ? row : l)) ?? null);
  const add = (name: string | null) => void run(() => createShareLink(projectId, { name }), (row) => setLinks((all) => [...(all ?? []), row]));

  return (
    <section className="grid gap-3 border-t pt-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-ui-sm font-medium text-muted-foreground">Anyone with the link</h3>
        {links.length > 0 && links.length < 5 && (
          <button type="button" disabled={busy} onClick={() => add(`Link ${links.length + 1}`)} className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50">
            Add another link
          </button>
        )}
      </div>
      {links.length === 0 ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-faint">
            No link yet. Make one that opens without an account: for everything in the project, or for an audience as of a release, so players or readers see only what they know.
          </p>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => add(null)}>
            Make a link
          </Button>
        </div>
      ) : (
        links.map((link) => (
          <LinkCard
            key={link.id}
            link={link}
            releases={releases}
            busy={busy}
            several={links.length > 1}
            onPatch={(patch, message) => void run(() => updateShareLink(projectId, link.id, patch), replace, message)}
            onReset={async () => {
              const ok = await confirm({
                title: "Make a new link?",
                description: "The old link stops working at once, for everyone who has it. You'll need to send the new one to the people you want to keep reading.",
                confirmLabel: "Make a new link",
              });
              if (ok) void run(() => resetShareLink(projectId, link.id), replace, "New link made. The old one no longer works.");
            }}
            onDelete={async () => {
              const ok = await confirm({
                title: `Remove ${link.name ? `‘${link.name}’` : "this link"}?`,
                description: "It stops working at once, for good, for everyone who has it. Its settings go too.",
                confirmLabel: "Remove link",
              });
              if (ok) void run(() => deleteShareLink(projectId, link.id), () => setLinks((all) => all?.filter((l) => l.id !== link.id) ?? null), "Link removed.");
            }}
            onList={async () => {
              const ok = await confirm({
                title: `List ‘${projectTitle}’ in the public gallery?`,
                description: `Anyone on the internet will be able to find and read ‘${projectTitle}’, not only people you give the link to. You can take it out of the gallery at any time.`,
                confirmLabel: "List it",
                destructive: false,
              });
              if (ok) void run(() => updateShareLink(projectId, link.id, { listed: true }), replace, "Listed in the gallery.");
            }}
          />
        ))
      )}
    </section>
  );
}

function LinkCard({
  link,
  releases,
  busy,
  several,
  onPatch,
  onReset,
  onDelete,
  onList,
}: {
  link: ShareLinkState;
  releases: Array<{ id: string; title: string }>;
  busy: boolean;
  several: boolean;
  onPatch: (patch: ShareLinkPatch, message?: string) => void;
  onReset: () => void;
  onDelete: () => void;
  onList: () => void;
}) {
  const [open, setOpen] = useState(false);
  const url = `${window.location.origin}${publicPath(link.token)}`;
  const limited = Boolean(link.horizonReleaseId) || link.canonOnly;
  const asOf = releases.find((r) => r.id === link.horizonReleaseId);
  const [name, setName] = useState(link.name ?? "");

  return (
    <div className={cn("grid gap-2 rounded-lg border p-3", !link.enabled && "opacity-80")}>
      <div className="flex items-center gap-2">
        {several || link.name ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() !== (link.name ?? "") && onPatch({ name })}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            placeholder="Name it: Players, Patrons"
            maxLength={60}
            aria-label="What this link is for"
            className="h-8 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 text-ui-sm font-medium outline-none hover:border-input focus-visible:border-input focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        ) : (
          <span className="flex-1 text-ui-sm font-medium">{link.enabled ? "On" : "Off"}</span>
        )}
        <Switch checked={link.enabled} disabled={busy} aria-label={link.enabled ? "Switch the link off" : "Switch the link on"} onCheckedChange={(enabled) => onPatch({ enabled }, enabled ? undefined : "The link is off.")} />
      </div>

      {link.enabled ? (
        <>
          <p className="flex items-start gap-1.5 text-ui-sm text-foreground">
            <Icon name={limited ? "shield-check-linear" : "danger-circle-linear"} className={cn("mt-0.5 size-4 shrink-0", limited ? "text-teal-ink" : "text-ember-ink")} />
            {limited
              ? `Anyone with the link can read the project without an account, ${[asOf ? `only as far as ${asOf.title}` : "", link.canonOnly ? "only what's canon" : ""].filter(Boolean).join(" and ")}. Anything revealed later, and anything you marked to never show, stays hidden.`
              : "Anyone with the link can read everything in this project, spoilers included, without an account. They can't edit or comment."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Input readOnly value={url} aria-label="Read-only link" onFocus={(e) => e.currentTarget.select()} className="h-8 min-w-48 flex-1 font-mono text-xs" />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                navigator.clipboard.writeText(url).then(
                  () => toast.success("Link copied."),
                  () => toast.error("Couldn't copy. Select the link and copy it."),
                )
              }
            >
              <Icon name="copy-linear" />
              Copy
            </Button>
          </div>
        </>
      ) : (
        <p className="text-xs text-faint">Off: the link doesn&apos;t open. Switch it back on and the same link works again.</p>
      )}

      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <Icon name={open ? "alt-arrow-up-linear" : "alt-arrow-down-linear"} className="size-3.5" />
        What it shows, and more
      </button>
      {open && (
        <div className="grid gap-2.5 border-t pt-2.5 text-ui-sm">
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">How far readers can see</span>
            <SelectField
              value={link.horizonReleaseId ?? ""}
              disabled={busy || !releases.length}
              onValueChange={(v) => onPatch({ horizonReleaseId: v || null })}
              className="h-8 rounded-md border border-input bg-transparent px-2"
            >
              <option value="">Everything, spoilers included</option>
              {releases.map((r) => (
                <option key={r.id} value={r.id}>
                  Up to {r.title}: nothing revealed after it
                </option>
              ))}
            </SelectField>
            {!releases.length && <span className="text-xs text-faint">To hide spoilers, add releases in the Release roadmap (a book, an episode, a game session), then pick one here: readers see only what&apos;s been revealed by then.</span>}
          </label>
          <Toggle id={`${link.id}-canon`} label="Only what's canon" hint="Only notes and passages you marked as canon. Drafts and alternative versions stay hidden." checked={link.canonOnly} disabled={busy} onChange={(canonOnly) => onPatch({ canonOnly })} />
          <Toggle
            id={`${link.id}-listed`}
            label="List it in the public gallery"
            hint="Anyone on the internet can find it in the gallery of worlds and stories, not only people you give the link to."
            checked={link.listed}
            disabled={busy || !link.enabled}
            onChange={(listed) => (listed ? onList() : onPatch({ listed }, "Taken out of the gallery."))}
          />
          <Toggle
            id={`${link.id}-copy`}
            label="Let readers copy it"
            hint={
              limited
                ? "Only on a link that shows everything: a copy holds the whole project, spoilers and all."
                : "A Copy this project button, so a reader can start their own project from this one, as a template. Copies get the notes and story tools, not comments, version history or the trash."
            }
            checked={link.allowCopy}
            disabled={busy || limited}
            onChange={(allowCopy) => onPatch({ allowCopy }, allowCopy ? "Readers can copy this project." : "Readers can no longer copy it.")}
          />
          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onReset}>
              <Icon name="refresh-linear" />
              Make a new link (old one stops working)
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onDelete} className="text-destructive">
              <Icon name="trash-bin-minimalistic-linear" />
              Remove link
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Toggle({ id, label, hint, checked, disabled, onChange }: { id: string; label: string; hint: string; checked: boolean; disabled?: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <label htmlFor={id} className="grid gap-0.5">
        <span className="text-ui-sm text-foreground">{label}</span>
        <span className="text-xs text-faint">{hint}</span>
      </label>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}
