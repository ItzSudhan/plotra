"use client";

import { claimStatuses, type ClaimStatus } from "@plotra/db/schema";
import { Icon } from "@plotra/icons";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@plotra/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@plotra/ui/components/dropdown-menu";
import { cn } from "@plotra/ui/lib/utils";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Attachments, useAttachments } from "@/components/research/attachments";
import { Reference, useCitationStyle, useSources } from "@/components/research/cite";
import { sharedResource } from "@/components/workflow/data";
import { PropertyInput, useKindDefs } from "@/components/workspace/properties";
import { useStore } from "@/components/workspace/stores";
import { useWorkspace, type BlockTagPatch } from "@/components/workspace/workspace-provider";
import { useWorld, WORLD_NOTICE } from "@/components/world/data";
import {
  bibliographyBibtex,
  bibliographyText,
  bibtexEntry,
  citationStyles,
  formatReference,
  missingFields,
  researchKeys,
  runsToText,
  sortSources,
  type CitationStyle,
  type Source,
  type SourceSort,
} from "@/lib/citations";
import { parseContext } from "@/lib/doc-index";
import type { Backlink } from "@/lib/knowledge-actions";
import { updateProjectSettings } from "@/lib/project-actions";
import { read } from "@/lib/read";
import { clipWebPage, ensureResearchDefaults } from "@/lib/research-actions";
import { flatten, nodeKindMeta, type BinderNode, type NodeIndex } from "@/lib/tree";
import type { FactRow } from "@/lib/world-actions";
import { claimMeta } from "@/lib/world";
import { CommitInput, EmptyState, errorText, fieldClass, Segmented, Toolbar, ToolbarSelect, ToolButton } from "./view-ui";
import { SelectField } from "@plotra/ui/components/select-field";
import { IconButton } from "@plotra/ui/components/icon-button";
import { Tooltip } from "@plotra/ui/components/tooltip";
import { plural } from "@/lib/plural";

// Sources (plan.md 2.8 "Research & sources"): every research note as a
// reference in the project's citation style, with where it's cited, its files
// and the claims that rest on it; fact-check status across the project; and
// the bibliography to export.

type Link = { source: string; target: string; kind: string };
const useLinksResource = sharedResource<Link[]>();

/** How often, and from how many notes, each note is linked to. A citation is a link to its source. */
function useCitationCounts() {
  const { project } = useWorkspace();
  const { data } = useLinksResource(project.id, () => read("getProjectLinks", project.id), null);
  return useMemo(() => {
    const counts = new Map<string, { times: number; notes: Set<string> }>();
    for (const link of data ?? []) {
      if (link.source === link.target || link.kind === "property") continue;
      const entry = counts.get(link.target) ?? { times: 0, notes: new Set<string>() };
      entry.times++;
      entry.notes.add(link.source);
      counts.set(link.target, entry);
    }
    return data ? counts : null;
  }, [data]);
}

/** Where new sources go: a top-level "Research" (or "Sources") folder if the project has one. */
function researchFolder(index: NodeIndex) {
  return flatten(index).find((n) => n.kind === "folder" && /^(research|sources|references|bibliography)$/i.test(n.title.trim()) && n.actions.includes("edit"))?.id ?? null;
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const fileSlug = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";

const sectionTitle = "mb-1.5 text-meta font-medium text-muted-foreground";

// ---- Claims ----------------------------------------------------------------------------

type ClaimPatch = { claim?: ClaimStatus; claimSourceId?: string | null };
const claimKey = (fact: Pick<FactRow, "nodeId" | "blockId">) => `${fact.nodeId}:${fact.blockId}`;

/**
 * Fact-check claims, with changes made here shown at once. A claim is a tag on
 * a block of a note, so changing it means editing that note; the server only
 * hears of it when the note's content next syncs.
 */
function useClaims() {
  const { editors, openNode, openView, withEditor, notify, binder } = useWorkspace();
  const { index } = useStore(binder);
  const world = useWorld().data;
  const [pending, setPending] = useState<Record<string, ClaimPatch>>({});

  const claims = useMemo(
    () =>
      (world?.facts ?? [])
        .filter((f) => f.claim && index.byId.has(f.nodeId))
        .map((f) => ({ ...f, ...pending[claimKey(f)] })) as Array<FactRow & { claim: ClaimStatus }>,
    [index, pending, world],
  );

  const change = (fact: FactRow, patch: ClaimPatch) => {
    const tags: BlockTagPatch = {
      ...(patch.claim && { claim: patch.claim }),
      ...(patch.claimSourceId !== undefined && { claimSource: patch.claimSourceId }),
    };
    const apply = (handle: Parameters<Parameters<typeof withEditor>[1]>[0]) => handle.setBlockTags?.([fact.blockId], tags);
    const handle = editors.current.get(fact.nodeId);
    if (handle) apply(handle);
    else {
      // The note has to be open to be edited: open it in a tab behind this view.
      openNode(fact.nodeId, "tab");
      withEditor(fact.nodeId, apply);
      openView("sources");
    }
    const key = claimKey(fact);
    setPending((all) => ({ ...all, [key]: { ...all[key], ...patch } }));
    setTimeout(() => notify(WORLD_NOTICE), 4000);
    // By now the server's copy has caught up; stop overriding it.
    setTimeout(() => setPending((all) => Object.fromEntries(Object.entries(all).filter(([k]) => k !== key))), 20_000);
  };

  return { claims, loaded: world !== null, change };
}

type Claims = ReturnType<typeof useClaims>;

function ClaimRow({ fact, change, showSource = true }: { fact: Claims["claims"][number]; change: Claims["change"]; showSource?: boolean }) {
  const { binder, openNode } = useWorkspace();
  const { index } = useStore(binder);
  const { nodes: sources } = useSources();
  const note = index.byId.get(fact.nodeId);
  const canEdit = Boolean(note?.actions.includes("edit"));
  const sourceKnown = !fact.claimSourceId || sources.some((s) => s.id === fact.claimSourceId);

  return (
    <li className="rounded-lg border bg-card p-3">
      <p className="font-prose text-[14px] leading-relaxed">{fact.excerpt || <span className="text-faint">Empty block.</span>}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-ui-sm">
        {note && (
          <button type="button" onClick={(e) => openNode(note.id, e.metaKey || e.ctrlKey ? "split" : "tab")} className="flex min-w-0 items-center gap-1.5 text-muted-foreground hover:text-ember-ink">
            <Icon name={nodeKindMeta[note.kind].icon} className="size-3.5 shrink-0" />
            <span className="truncate">{note.title}</span>
          </button>
        )}
        {showSource && (
          <label className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
            <Icon name="square-academic-cap-linear" className="size-3.5 shrink-0" />
            <span className="sr-only">Source</span>
            <SelectField
              value={sourceKnown ? (fact.claimSourceId ?? "") : ""}
              disabled={!canEdit}
              onValueChange={(v) => change(fact, { claimSourceId: v || null })}
              className="h-7 max-w-56 min-w-0 truncate rounded-md border border-transparent bg-transparent px-1 hover:border-input disabled:hover:border-transparent"
            >
              <option value="">No source yet</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </SelectField>
          </label>
        )}
        <div className="ml-auto flex shrink-0 rounded-md border border-input p-0.5">
          {claimStatuses.map((status) => (
            <Tooltip key={status} content={canEdit ? `Mark as ${claimMeta[status].label.toLowerCase()}` : "You can't edit this note"}>
              <button
                type="button"
                disabled={!canEdit}
                aria-pressed={fact.claim === status}
                onClick={() => fact.claim !== status && change(fact, { claim: status })}
                className={cn("flex h-7 items-center gap-1.5 rounded px-2 text-meta text-muted-foreground disabled:opacity-60", fact.claim === status && "bg-accent text-foreground")}
              >
                <span className="size-2 rounded-full" style={{ backgroundColor: claimMeta[status].color }} aria-hidden />
                {claimMeta[status].label}
              </button>
            </Tooltip>
          ))}
        </div>
      </div>
    </li>
  );
}

function ClaimsTab({ claims, loaded, change }: Claims) {
  if (!loaded) return <div className="m-6 h-4 w-1/3 animate-pulse rounded bg-muted" />;
  if (!claims.length) {
    return (
      <EmptyState icon="verified-check-linear" title="No claims to check">
        Select a passage in a note and tag it as a claim (⌘⌥T). It shows here until it&apos;s verified against a source.
      </EmptyState>
    );
  }
  // What still needs work comes first.
  const order: ClaimStatus[] = ["unverified", "disputed", "verified"];
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto grid w-full max-w-3xl gap-6 px-6 py-6">
        {order.map((status) => {
          const group = claims.filter((c) => c.claim === status);
          if (!group.length) return null;
          return (
            <section key={status}>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-medium">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: claimMeta[status].color }} />
                {claimMeta[status].label}
                <span className="text-faint">{group.length}</span>
              </h2>
              <ul className="grid gap-2">
                {group.map((fact) => (
                  <ClaimRow key={claimKey(fact)} fact={fact} change={change} />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

// ---- One source --------------------------------------------------------------------------

function SourceDetail({ node, source, style, suffix, claims, onClose }: { node: BinderNode; source: Source; style: CitationStyle; suffix?: string; claims: Claims; onClose: () => void }) {
  const { project, binder, openNode, actions } = useWorkspace();
  const { index } = useStore(binder);
  const defs = useKindDefs("research");
  const canEdit = node.actions.includes("edit");
  const [backlinks, setBacklinks] = useState<Backlink[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    read("getNodeLinks", project.id, node.id)
      .then((links) => !cancelled && setBacklinks(links.backlinks))
      .catch(() => !cancelled && setBacklinks([]));
    return () => {
      cancelled = true;
    };
  }, [node.id, project.id]);

  const cited = (backlinks ?? []).filter((b) => b.kind !== "property" && index.byId.has(b.sourceNodeId));
  const resting = claims.claims.filter((c) => c.claimSourceId === node.id);

  const copy = (text: string, what: string) =>
    navigator.clipboard.writeText(text).then(
      () => toast.success(`${what} copied.`),
      () => toast.error("Couldn't copy."),
    );

  return (
    <aside className="flex w-[26rem] max-w-[55%] shrink-0 flex-col overflow-y-auto border-l bg-sidebar/40">
      <div className="grid gap-5 p-4">
        <div>
          <div className="flex items-center gap-1">
            <label className="min-w-0 flex-1">
              <span className="sr-only">Title of the work</span>
              <CommitInput
                value={node.title}
                disabled={!canEdit}
                placeholder="Title of the work"
                className="h-8 border-transparent px-1 font-display text-xl hover:border-input"
                onCommit={(title) => title.trim() && void actions.update(node.id, { title: title.trim() })}
              />
            </label>
            <IconButton icon="square-arrow-right-up-linear" label="Open the note" onClick={(e) => openNode(node.id, e.metaKey || e.ctrlKey ? "split" : "tab")} />
            <IconButton icon="close-linear" label="Close" onClick={onClose} />
          </div>
          <p className="mt-2 rounded-lg border bg-card p-3 font-prose text-[14px] leading-relaxed">
            <Reference source={source} style={style} suffix={suffix} links />
          </p>
          <div className="mt-1.5 flex gap-1">
            <button
              type="button"
              onClick={() => void copy(runsToText(formatReference(source, style, { suffix })), "Reference")}
              className="flex h-7 items-center gap-1.5 rounded-md px-1.5 text-ui-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Icon name="copy-linear" className="size-3.5" />
              Copy reference
            </button>
            <button
              type="button"
              onClick={() => void copy(bibtexEntry(source), "BibTeX")}
              className="flex h-7 items-center gap-1.5 rounded-md px-1.5 text-ui-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Icon name="copy-linear" className="size-3.5" />
              Copy BibTeX
            </button>
          </div>
        </div>

        <section>
          <h2 className={sectionTitle}>Details</h2>
          <div className="grid gap-0.5">
            {defs.map((def) => (
              <div key={def.id} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-start gap-1">
                <span className="flex h-7 items-center truncate text-ui-sm text-muted-foreground" title={def.key === researchKeys.authors ? "Last, First; Last, First" : def.label}>
                  {def.label}
                </span>
                <PropertyInput def={def} node={node} disabled={!canEdit} />
              </div>
            ))}
            {defs.length === 0 && <p className="text-xs text-faint">Research notes have no properties in this project.</p>}
          </div>
          {defs.some((d) => d.key === researchKeys.authors) && (
            <p className="mt-1.5 text-xs text-faint">Authors as “Last, First; Last, First”. Put an organisation in {"{braces}"}. Year also takes a full date, 2019-03-04.</p>
          )}
        </section>

        <section>
          <h2 className={sectionTitle}>Cited in {backlinks ? `(${cited.length})` : ""}</h2>
          {backlinks === null ? (
            <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
          ) : cited.length === 0 ? (
            <p className="text-xs text-faint">Not cited yet. Type [@ in a note to cite it.</p>
          ) : (
            <ul className="grid gap-1.5">
              {cited.map((b, i) => {
                const from = index.byId.get(b.sourceNodeId)!;
                const context = parseContext(b.context ?? "")
                  .map((part) => ("text" in part ? part.text : `[${part.alias ?? index.byId.get(part.nodeId)?.title ?? "…"}]`))
                  .join("");
                return (
                  <li key={i}>
                    <button type="button" onClick={(e) => openNode(from.id, e.metaKey || e.ctrlKey ? "split" : "tab")} className="grid w-full gap-0.5 rounded-md px-1.5 py-1 text-left hover:bg-accent">
                      <span className="flex items-center gap-1.5 text-ui-sm">
                        <Icon name={nodeKindMeta[from.kind].icon} className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{from.title}</span>
                      </span>
                      {context && <span className="line-clamp-2 text-xs text-muted-foreground">{context}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section>
          <h2 className={sectionTitle}>Files</h2>
          <Attachments node={node} />
        </section>

        <section>
          <h2 className={sectionTitle}>Claims resting on it {claims.loaded ? `(${resting.length})` : ""}</h2>
          {resting.length === 0 ? (
            <p className="text-xs text-faint">No claim names this source yet.</p>
          ) : (
            <ul className="grid gap-2">
              {resting.map((fact) => (
                <ClaimRow key={claimKey(fact)} fact={fact} change={claims.change} showSource={false} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </aside>
  );
}

// ---- Clipping -----------------------------------------------------------------------------

function ClipDialog({ onClose, onClipped }: { onClose: () => void; onClipped: (node: BinderNode) => void }) {
  const { project, binder, announce, track } = useWorkspace();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clip = async () => {
    const address = url.trim();
    if (!address || busy) return;
    setBusy(true);
    setError(null);
    try {
      const node = await track(clipWebPage(project.id, /^[a-z][a-z0-9+.-]*:/i.test(address) ? address : `https://${address}`, researchFolder(binder.get().index)));
      binder.upsert(node);
      announce();
      toast.success(`Clipped “${node.title}”.`);
      onClipped(node);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Clip a web page</DialogTitle>
          <DialogDescription>Saves the page&apos;s text as a research note, with its title, site, author and date filled in where the page gives them.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void clip();
          }}
        >
          <input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" inputMode="url" aria-label="Web address" className={cn(fieldClass, "h-9")} />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={busy} className="h-9 rounded-md px-3 text-sm hover:bg-accent disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={busy || !url.trim()} className="h-9 rounded-md bg-foreground px-4 text-sm text-background disabled:opacity-50">
              {busy ? "Clipping…" : "Clip"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---- The view -----------------------------------------------------------------------------

export function SourcesView() {
  const { project, binder, propertyDefs, actions, projectChanged, activeNodeId } = useWorkspace();
  const { index } = useStore(binder);
  const { sources, byId, suffixes: citedSuffixes } = useSources();
  const projectStyle = useCitationStyle();
  const counts = useCitationCounts();
  const attachments = useAttachments().data;
  const claims = useClaims();
  const canEdit = project.actions.includes("edit");

  const [tab, setTab] = useState<"sources" | "claims">("sources");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SourceSort>("author");
  const [onlyCited, setOnlyCited] = useState(false);
  const [clipping, setClipping] = useState(false);
  // The style picked here shows at once; the project's own catches up when it reloads.
  const [pickedStyle, setPickedStyle] = useState<CitationStyle | null>(null);
  const style = pickedStyle ?? projectStyle;
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const active = activeNodeId.get();
    return active && index.byId.get(active)?.kind === "research" ? active : null;
  });

  // A project from before research notes had bibliography fields gets them when the
  // module is switched on; a workspace that was already open learns of them here.
  useEffect(() => {
    if (propertyDefs.get().some((d) => d.nodeKind === "research" && d.key === researchKeys.type)) return;
    let cancelled = false;
    ensureResearchDefaults(project.id)
      .then(({ defs }) => {
        if (cancelled) return;
        const fresh = defs.filter((def) => !propertyDefs.get().some((d) => d.id === def.id));
        if (fresh.length) propertyDefs.set((all) => [...all, ...fresh]);
      })
      .catch(() => {
        // The fields can still be added by hand from the inspector.
      });
    return () => {
      cancelled = true;
    };
  }, [project.id, propertyDefs]);

  const attachmentCounts = useMemo(() => {
    const byNode = new Map<string, number>();
    for (const a of attachments ?? []) byNode.set(a.nodeId, (byNode.get(a.nodeId) ?? 0) + 1);
    return byNode;
  }, [attachments]);

  const shown = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const haystack = (s: Source) => [s.title, s.container, s.publisher, String(s.date?.year ?? ""), ...s.authors.map((a) => `${a.given} ${a.family}`)].join(" ").toLowerCase();
    return sortSources(words.length ? sources.filter((s) => words.every((w) => haystack(s).includes(w))) : sources, sort);
  }, [query, sort, sources]);

  const selectedNode = selectedId ? index.byId.get(selectedId) : undefined;
  const selected = selectedNode && byId.get(selectedNode.id);
  const uncited = counts ? sources.filter((s) => !counts.has(s.id)).length : 0;

  const changeStyle = async (next: CitationStyle) => {
    setPickedStyle(next);
    try {
      await updateProjectSettings(project.id, { citationStyle: next });
      projectChanged();
    } catch (error) {
      setPickedStyle(null);
      toast.error(errorText(error));
    }
  };

  const newSource = async () => {
    const created = await actions.create("research", researchFolder(index) ?? undefined, "Untitled source", { open: false });
    if (created) {
      setTab("sources");
      setSelectedId(created.id);
    }
  };

  const exportAs = (format: "md" | "txt" | "bib") => {
    const list = onlyCited && counts ? sources.filter((s) => counts.has(s.id)) : sources;
    if (!list.length) {
      toast.message(onlyCited ? "No source is cited yet." : "There are no sources to export.");
      return;
    }
    const name = `${fileSlug(project.title)}-bibliography.${format}`;
    if (format === "bib") download(name, bibliographyBibtex(list), "application/x-bibtex");
    else download(name, bibliographyText(list, style, format), format === "md" ? "text/markdown" : "text/plain");
  };

  return (
    <div className="flex h-full flex-col">
      <Toolbar>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "sources", label: `Sources ${sources.length}` },
            { value: "claims", label: `Claims ${claims.claims.length}` },
          ]}
        />
        {tab === "sources" && (
          <>
            <div className="flex h-7 w-52 shrink-0 items-center gap-1.5 rounded-md border border-input px-2 focus-within:ring-[3px] focus-within:ring-ring/50">
              <Icon name="magnifer-linear" className="size-3.5 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search author, title, year"
                aria-label="Search sources"
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-faint"
              />
            </div>
            <ToolbarSelect
              label="Sort"
              value={sort}
              onChange={setSort}
              options={[
                { value: "author", label: "Author" },
                { value: "year", label: "Year" },
                { value: "title", label: "Title" },
              ]}
            />
          </>
        )}
        <ToolbarSelect label="Style" value={style} disabled={!canEdit} onChange={(next) => void changeStyle(next)} options={citationStyles.map((s) => ({ value: s.id, label: s.label }))} />
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {canEdit && (
            <>
              <ToolButton icon="add-linear" label="New source" onClick={() => void newSource()}>
                New source
              </ToolButton>
              <ToolButton icon="global-linear" label="Clip a web page" onClick={() => setClipping(true)}>
                Clip a web page
              </ToolButton>
            </>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger className="flex h-7 shrink-0 items-center gap-1.5 rounded-md px-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
              <Icon name="download-linear" className="size-4" />
              Bibliography
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => exportAs("md")}>Markdown (.md)</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => exportAs("txt")}>Plain text (.txt)</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => exportAs("bib")}>BibTeX (.bib)</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem checked={onlyCited} onCheckedChange={(checked) => setOnlyCited(Boolean(checked))} onSelect={(e) => e.preventDefault()}>
                Only cited sources
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Toolbar>

      {tab === "claims" ? (
        <ClaimsTab {...claims} />
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1 overflow-y-auto">
            {sources.length === 0 ? (
              <EmptyState icon="square-academic-cap-linear" title="No sources yet" action={project.actions.includes("edit") && { label: "New source", onClick: () => void newSource() }}>
                A source is a research note with its bibliography details. Add one, or clip a web page, then cite it in any note by typing [@.
              </EmptyState>
            ) : (
              <>
                <ul>
                  {shown.map((source) => {
                    const node = index.byId.get(source.id);
                    if (!node) return null;
                    const cited = counts?.get(source.id);
                    const files = attachmentCounts.get(source.id) ?? 0;
                    const missing = missingFields(source);
                    return (
                      <li key={source.id}>
                        <button
                          type="button"
                          aria-current={selectedId === source.id}
                          onClick={() => setSelectedId(selectedId === source.id ? null : source.id)}
                          className={cn("grid w-full gap-1 border-b px-4 py-2.5 text-left hover:bg-accent/40", selectedId === source.id && "bg-accent/60")}
                        >
                          <span className="font-prose text-[15px] leading-relaxed">
                            <Reference source={source} style={style} suffix={citedSuffixes.get(source.id)} />
                          </span>
                          <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                            <span>{source.type === "other" ? "Source" : source.type[0].toUpperCase() + source.type.slice(1)}</span>
                            {counts && (
                              <span className={cn("flex items-center gap-1", !cited && "text-faint")}>
                                <Icon name="quote-linear" className="size-3.5" />
                                {cited ? `Cited ${cited.times}× in ${cited.notes.size} ${plural(cited.notes.size, "note")}` : "Not cited"}
                              </span>
                            )}
                            {files > 0 && (
                              <span className="flex items-center gap-1">
                                <Icon name="paperclip-linear" className="size-3.5" />
                                {files}
                                <span className="sr-only">{files === 1 ? "attached file" : "attached files"}</span>
                              </span>
                            )}
                            {Boolean(node.properties.verified) && (
                              <span className="flex items-center gap-1 text-teal-ink">
                                <Icon name="verified-check-linear" className="size-3.5" />
                                Fact-checked
                              </span>
                            )}
                            {missing.length > 0 && (
                              <span className="flex items-center gap-1 text-gold-ink">
                                <Icon name="danger-circle-linear" className="size-3.5" />
                                Missing {missing.join(", ")}
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <p className="px-4 py-2 text-xs text-muted-foreground">
                  {shown.length === sources.length ? `${sources.length} ${plural(sources.length, "source")}` : `${shown.length} of ${sources.length} sources`}
                  {counts && uncited > 0 && ` · ${uncited} not cited`}
                </p>
              </>
            )}
          </div>
          {selectedNode && selected && (
            <SourceDetail key={selectedNode.id} node={selectedNode} source={selected} style={style} suffix={citedSuffixes.get(selectedNode.id)} claims={claims} onClose={() => setSelectedId(null)} />
          )}
        </div>
      )}

      {clipping && (
        <ClipDialog
          onClose={() => setClipping(false)}
          onClipped={(node) => {
            setClipping(false);
            setTab("sources");
            setSelectedId(node.id);
          }}
        />
      )}
    </div>
  );
}
