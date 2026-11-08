"use client";

import type { NodeKind, PropertyValue } from "@plotra/db/schema";
import { Icon } from "@plotra/icons";
import { IconButton } from "@plotra/ui/components/icon-button";
import { Tooltip } from "@plotra/ui/components/tooltip";
import { cn } from "@plotra/ui/lib/utils";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ReadOnlyDocument } from "@/components/editor/embedded-document";
import { entityDefs, PropertyDisplay, useNodeDefs } from "@/components/workspace/properties";
import { useStore } from "@/components/workspace/stores";
import { nodeTags } from "@/components/workspace/tags-pane";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { useHorizon, useSharedWorld, useWorld, useWorldLinks } from "@/components/world/data";
import { EntityIcon } from "@/components/world/entity-icon";
import { useVocabulary } from "@/components/workspace/vocabulary";
import { EntityTypeDialog } from "@/components/world/entity-type-dialog";
import { nav } from "@/components/transitions";
import type { Backlink, WorldBacklink } from "@/lib/knowledge-actions";
import { read } from "@/lib/read";
import { flatten, nodeKindMeta, type BinderNode } from "@/lib/tree";
import type { EntityTypeRow, SharedEntry, SharedWorld } from "@/lib/world-actions";
import { canonMeta } from "@/lib/world";
import { EmptyState } from "./view-ui";

// Codex / world bible (plan.md 2.5, 2.8): the story's world as browsable
// pages, with properties, the page itself and what links to it. Characters
// and places are built-in kinds; the World bible module adds custom types
// ("Faction", "Costume", "Case"…), and a project can browse the world of
// another project it shares one with.

const codexKinds: NodeKind[] = ["character", "location", "research", "note"];

/** A section of the codex: a built-in kind or a custom type. */
type Section = { key: string; label: string; singular: string; kind: NodeKind; type?: EntityTypeRow };

const sectionOf = (n: { kind: NodeKind; entityTypeId: string | null }) => (n.kind === "entity" ? `type:${n.entityTypeId ?? ""}` : n.kind);

function useSections(types: EntityTypeRow[], kinds: NodeKind[]): Section[] {
  const words = useVocabulary();
  return useMemo(
    () => [
      // "Research" reads better than "Researches", unless the project has its own word for it.
      ...kinds.map((kind) => ({ key: kind as string, label: kind === "research" && words.label(kind) === "Research" ? "Research" : words.plural(kind), singular: words.label(kind), kind })),
      ...types.map((type) => ({ key: `type:${type.id}`, label: type.plural, singular: type.name, kind: "entity" as const, type })),
    ],
    [kinds, types, words],
  );
}

/** Canon status in words, with what it means on hover and focus. */
function CanonBadge({ canon }: { canon: BinderNode["canon"] }) {
  const meta = canonMeta[canon];
  return (
    <Tooltip content={meta.description}>
      <span
        tabIndex={0}
        className="flex items-center gap-1 rounded bg-muted px-1.5 py-px text-meta font-medium text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <span aria-hidden className="size-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
        {meta.label}
        <span className="sr-only">: {meta.description}</span>
      </span>
    </Tooltip>
  );
}

function Page({ node, section }: { node: BinderNode; section: Section }) {
  const { project, binder, openNode, modules } = useWorkspace();
  const { index } = useStore(binder);
  const defs = useNodeDefs(node);
  const releases = useWorld().data?.releases;
  const [backlinks, setBacklinks] = useState<Backlink[] | null>(null);
  // In a world other projects share: the notes of theirs that mention this entry.
  const [elsewhere, setElsewhere] = useState<WorldBacklink[]>([]);

  useEffect(() => {
    let cancelled = false;
    read("getNodeLinks", project.id, node.id)
      .then((l) => {
        if (cancelled) return;
        setBacklinks(l.backlinks);
        setElsewhere([...new Map(l.fromSharers.map((b) => [b.sourceNodeId, b])).values()]);
      })
      .catch(() => !cancelled && setBacklinks([]));
    return () => {
      cancelled = true;
    };
  }, [node.id, project.id]);

  const sources = [...new Set((backlinks ?? []).map((b) => b.sourceNodeId))].filter((id) => index.byId.has(id));
  const tags = nodeTags(node);
  const revealed = releases?.find((r) => r.id === node.revealReleaseId);

  return (
    <article className="mx-auto w-full max-w-3xl px-6 py-8 sm:px-10">
      <p className="flex flex-wrap items-center gap-1.5 text-meta text-faint">
        {section.type ? <EntityIcon type={section.type} className="size-3.5" /> : <Icon name={nodeKindMeta[node.kind].icon} className="size-3.5" />}
        {section.singular}
        {node.aliases.length > 0 && <span>· also {node.aliases.join(", ")}</span>}
        {modules.has("world") && <CanonBadge canon={node.canon} />}
        {revealed && <span>· revealed in {revealed.title}</span>}
      </p>
      <div className="mt-2 flex items-start justify-between gap-4">
        <h1 className="font-display text-4xl leading-tight tracking-tight">{node.title}</h1>
        <button
          type="button"
          onClick={(e) => openNode(node.id, e.metaKey || e.ctrlKey ? "split" : "tab")}
          className="mt-2 flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-ui-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Icon name="pen-linear" className="size-3.5" />
          Edit
        </button>
      </div>
      {node.synopsis && <p className="mt-3 text-muted-foreground italic">{node.synopsis}</p>}
      {tags.length > 0 && (
        <p className="mt-3 flex flex-wrap gap-1">
          {tags.map((t) => (
            <span key={t} className="rounded bg-muted px-1.5 py-px text-meta text-muted-foreground">
              #{t}
            </span>
          ))}
        </p>
      )}

      <div className="mt-6 grid gap-8 md:grid-cols-[minmax(0,1fr)_14rem]">
        <div className="min-w-0 border-t pt-4">
          <ReadOnlyDocument key={node.id} room={`node-${node.id}`} />
        </div>
        <aside className="order-first grid content-start gap-5 md:order-none">
          {defs.length > 0 && (
            <dl className="grid gap-2 rounded-lg border bg-card p-3 text-ui-sm">
              {defs.map((def) => (
                <div key={def.id} className="grid gap-0.5">
                  <dt className="text-meta font-medium text-muted-foreground">{def.label}</dt>
                  <dd className="min-w-0">
                    <PropertyDisplay def={def} value={node.properties[def.key]} />
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <div>
            <h2 className="mb-1.5 text-meta font-medium text-muted-foreground">Mentioned in {backlinks ? `(${sources.length})` : ""}</h2>
            {backlinks === null ? (
              <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
            ) : sources.length === 0 ? (
              <p className="text-meta text-faint">Nothing links here yet.</p>
            ) : (
              <ul className="grid gap-0.5">
                {sources.map((id) => {
                  const source = index.byId.get(id)!;
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        onClick={(e) => openNode(id, e.metaKey || e.ctrlKey ? "tab" : "replace")}
                        className="flex w-full items-center gap-1.5 truncate rounded-sm text-left text-ui-sm text-muted-foreground outline-none hover:text-ember-ink focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      >
                        <Icon name={nodeKindMeta[source.kind].icon} className="size-3.5 shrink-0" />
                        <span className="truncate">{source.title}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {elsewhere.length > 0 && (
            <div>
              <h2 className="mb-1.5 text-meta font-medium text-muted-foreground">Mentioned in projects using this world ({elsewhere.length})</h2>
              <ul className="grid gap-0.5">
                {elsewhere.map((b) => (
                  <li key={b.sourceNodeId}>
                    <a href={b.href} className="flex w-full items-center gap-1.5 truncate rounded-sm text-left text-ui-sm text-muted-foreground outline-none hover:text-ember-ink focus-visible:ring-[3px] focus-visible:ring-ring/50">
                      <Icon name="arrow-right-up-linear" className="size-3.5 shrink-0" />
                      <span className="truncate">{b.sourceTitle || "Untitled"}</span>
                      <span className="shrink-0 text-meta text-faint">· {b.projectTitle}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </article>
  );
}

/** A value from another project: note links show as the titles of that world's entries. */
function sharedValue(value: PropertyValue | undefined, world: SharedWorld, isNode: boolean) {
  if (value === undefined || value === null || value === "" || (Array.isArray(value) && !value.length)) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const values = Array.isArray(value) ? value : [String(value)];
  if (!isNode) return values.join(", ");
  const titles = values.map((id) => world.entries.find((e) => e.id === id)?.title).filter(Boolean);
  return titles.length ? titles.join(", ") : "—";
}

/** The notes of this project that link to an entry of the shared world. */
function MentionedHere({ entryId }: { entryId: string }) {
  const { binder, openNode } = useWorkspace();
  const { index } = useStore(binder);
  const links = useWorldLinks();
  const sources = [...new Map((links ?? []).filter((l) => l.target === entryId && index.byId.has(l.source)).map((l) => [l.source, l])).values()];
  if (!links) return null;
  return (
    <section className="mt-8 grid gap-2 border-t pt-4">
      <h2 className="text-meta font-medium text-muted-foreground">Mentioned here · {sources.length}</h2>
      {sources.length === 0 ? (
        <p className="text-ui-sm text-muted-foreground">No note in this project links to it yet.</p>
      ) : (
        <ul className="grid gap-1">
          {sources.map((l) => (
            <li key={l.source}>
              <button type="button" onClick={() => openNode(l.source, "tab")} className="grid w-full gap-0.5 rounded-md px-2 py-1.5 text-left outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50">
                <span className="text-ui-sm font-medium">{index.byId.get(l.source)!.title}</span>
                {l.context && <span className="line-clamp-2 text-meta text-muted-foreground">{l.context}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** An entry of the shared world: read-only here, edited in its own project. */
function SharedPage({ entry, world, section }: { entry: SharedEntry; world: SharedWorld; section: Section }) {
  const { workspace } = useWorkspace();
  const defs = section.type ? entityDefs(section.type) : [];

  return (
    <article className="mx-auto w-full max-w-3xl px-6 py-8 sm:px-10">
      <p className="flex flex-wrap items-center gap-1.5 text-meta text-faint">
        {section.type ? <EntityIcon type={section.type} className="size-3.5" /> : <Icon name={nodeKindMeta[entry.kind].icon} className="size-3.5" />}
        {section.singular} · from {world.title}
        {entry.aliases.length > 0 && <span>· also {entry.aliases.join(", ")}</span>}
        <CanonBadge canon={entry.canon} />
      </p>
      <div className="mt-2 flex items-start justify-between gap-4">
        <h1 className="font-display text-4xl leading-tight tracking-tight">{entry.title}</h1>
        <Link
          href={`/w/${workspace.slug}/p/${world.slug}`}
          transitionTypes={nav.open}
          className="mt-2 flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-ui-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Icon name="square-arrow-right-up-linear" className="size-3.5" />
          Open {world.title}
        </Link>
      </div>
      {entry.synopsis && <p className="mt-3 text-muted-foreground italic">{entry.synopsis}</p>}
      <p className="mt-3 rounded-md bg-muted px-3 py-2 text-meta text-muted-foreground">
        This page lives in the shared world. Link to it from any note here by typing <kbd className="font-sans">[[</kbd> and its name.
      </p>
      <div className="mt-6 grid gap-8 md:grid-cols-[minmax(0,1fr)_14rem]">
        <div className="min-w-0 border-t pt-4">
          <ReadOnlyDocument key={entry.id} room={`node-${entry.id}`} projectId={world.projectId} />
          <MentionedHere entryId={entry.id} />
        </div>
        {defs.length > 0 && (
          <aside className="order-first md:order-none">
            <dl className="grid gap-2 rounded-lg border bg-card p-3 text-ui-sm">
              {defs.map((def) => (
                <div key={def.id} className="grid gap-0.5">
                  <dt className="text-meta font-medium text-muted-foreground">{def.label}</dt>
                  <dd className="min-w-0">{sharedValue(entry.properties[def.key], world, def.type === "node")}</dd>
                </div>
              ))}
            </dl>
          </aside>
        )}
      </div>
    </article>
  );
}

const sharedKinds: NodeKind[] = ["character", "location"];
const noTypes: EntityTypeRow[] = [];

export function CodexView({ nodeId }: { nodeId?: string }) {
  const { project, binder, activeNodeId, actions, modules } = useWorkspace();
  const { index } = useStore(binder);
  const world = useWorld().data;
  const shared = useSharedWorld();
  const horizon = useHorizon();
  const canEdit = project.actions.includes("edit");

  // Opened on a shared entry (from a link to it): start in the shared world.
  const startShared = Boolean(nodeId && !index.byId.has(nodeId));
  const [source, setSource] = useState<"own" | "shared">(startShared ? "shared" : "own");
  const showShared = source === "shared" && shared !== null && shared !== undefined;

  const types = (showShared ? shared.entityTypes : world?.entityTypes) ?? noTypes;
  const sections = useSections(types, showShared ? sharedKinds : codexKinds);

  const initial = nodeId ?? activeNodeId.get();
  const [selectedId, setSelectedId] = useState<string | null>(initial);
  const [sectionKey, setSectionKey] = useState<string>(() => {
    const n = initial ? index.byId.get(initial) : undefined;
    return n && (codexKinds.includes(n.kind) || n.kind === "entity") ? sectionOf(n) : "character";
  });
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<{ type: EntityTypeRow | null } | null>(null);

  // A shared entry's section is only known once the shared world has loaded.
  const [located, setLocated] = useState(false);
  if (startShared && shared && !located) {
    setLocated(true);
    const entry = shared.entries.find((e) => e.id === nodeId);
    if (entry) setSectionKey(sectionOf(entry));
  }

  const ownEntries = useMemo(() => flatten(index).filter((n) => codexKinds.includes(n.kind) || n.kind === "entity"), [index]);
  const all: Array<BinderNode | SharedEntry> = showShared ? shared.entries : ownEntries;
  const visible = useMemo(
    () => (showShared || !horizon ? all : all.filter((n) => horizon.knows(n.id))),
    // `all` is derived from the first two.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showShared, ownEntries, shared, horizon],
  );
  const concealed = all.length - visible.length;

  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const n of visible) c.set(sectionOf(n), (c.get(sectionOf(n)) ?? 0) + 1);
    return c;
  }, [visible]);

  const section = sections.find((s) => s.key === sectionKey) ?? sections[0];
  const entries = useMemo(() => {
    const q = query.trim().toLowerCase();
    return visible
      .filter((n) => sectionOf(n) === section?.key)
      .filter((n) => !q || [n.title, ...n.aliases].some((name) => name.toLowerCase().includes(q)))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [query, section?.key, visible]);

  const page = entries.find((n) => n.id === selectedId) ?? entries[0];

  const createEntry = async () => {
    if (!section) return;
    const created = await actions.create(
      section.kind,
      undefined,
      `Untitled ${section.singular.toLowerCase()}`,
      section.type ? { entityTypeId: section.type.id } : {},
    );
    if (created) setSelectedId(created.id);
  };

  return (
    <div className="flex h-full min-h-0">
      <nav aria-label="Codex" className="flex w-60 shrink-0 flex-col border-r bg-sidebar">
        {shared && (
          <div className="flex gap-0.5 border-b border-sidebar-border p-1.5">
            {(["own", "shared"] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={source === s}
                onClick={() => {
                  setSource(s);
                  setSectionKey("character");
                }}
                className={cn(
                  "flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-1.5 text-meta text-muted-foreground outline-none hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  source === s && "bg-sidebar-accent text-foreground",
                )}
              >
                {s === "shared" && <Icon name="planet-linear" className="size-3.5 shrink-0" />}
                <span className="truncate">{s === "own" ? "This project" : shared.title}</span>
              </button>
            ))}
          </div>
        )}
        <ul className="max-h-[42%] shrink-0 overflow-y-auto border-b border-sidebar-border p-1.5">
          {sections.map((s) => (
            <li key={s.key} className="group/section flex items-center">
              <button
                type="button"
                aria-pressed={section?.key === s.key}
                onClick={() => setSectionKey(s.key)}
                className={cn(
                  "flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-ui-sm text-muted-foreground outline-none hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  section?.key === s.key && "bg-sidebar-accent text-foreground",
                )}
              >
                {s.type ? <EntityIcon type={s.type} className="size-4" /> : <Icon name={nodeKindMeta[s.kind].icon} className="size-4 shrink-0" />}
                <span className="truncate">{s.label}</span>
                <span className="ml-auto text-meta text-faint tabular-nums">{counts.get(s.key) ?? 0}</span>
              </button>
              {s.type && !showShared && canEdit && (
                <IconButton
                  icon="settings-minimalistic-linear"
                  label={`Edit the type ${s.type.name} and its fields`}
                  size="xs"
                  onClick={() => setEditing({ type: s.type! })}
                  className="opacity-0 group-focus-within/section:opacity-100 group-hover/section:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
                />
              )}
            </li>
          ))}
          {!showShared && canEdit && modules.has("world") && (
            <li>
              <button
                type="button"
                onClick={() => setEditing({ type: null })}
                className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-ui-sm text-muted-foreground outline-none hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <Icon name="add-linear" className="size-4" />
                New type…
              </button>
            </li>
          )}
        </ul>
        <div className="flex items-center gap-1 p-1.5">
          <input
            type="search"
            aria-label={`Find in ${section?.label.toLowerCase() ?? "codex"}`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Find in ${section?.label.toLowerCase() ?? "codex"}…`}
            className="h-8 w-full min-w-0 rounded-md border border-input bg-transparent px-2 text-ui-sm outline-none placeholder:text-faint focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          {!showShared && canEdit && section && (
            <IconButton icon="add-linear" label={`New ${section.singular.toLowerCase()}`} size="sm" onClick={() => void createEntry()} className="hover:bg-sidebar-accent" />
          )}
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
          {entries.length === 0 && (
            <li className="px-2 py-4 text-center text-meta text-faint">
              {query.trim() ? `Nothing in ${section?.label.toLowerCase() ?? "the codex"} matches “${query.trim()}”.` : `No ${section?.label.toLowerCase() ?? "entries"} yet.`}
            </li>
          )}
          {entries.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => setSelectedId(n.id)}
                className={cn(
                  "flex h-8 w-full items-center gap-1.5 rounded-md px-2 text-left text-ui-sm text-muted-foreground outline-none hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  page?.id === n.id && "bg-sidebar-accent text-foreground",
                )}
              >
                <span className="truncate">{n.title}</span>
                {modules.has("world") && n.canon !== "canon" && n.canon !== "draft" && (
                  <span className="ml-auto flex shrink-0 items-center gap-1 text-meta text-faint">
                    <span aria-hidden className="size-1.5 rounded-full" style={{ backgroundColor: canonMeta[n.canon].color }} />
                    {canonMeta[n.canon].label}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
        {concealed > 0 && (
          <p className="flex items-center gap-1.5 border-t border-sidebar-border px-3 py-2 text-meta text-faint">
            <Icon name="eye-closed-linear" className="size-3.5 shrink-0" />
            {concealed} not revealed yet at this point
          </p>
        )}
      </nav>
      <div className="min-w-0 flex-1 overflow-y-auto bg-background">
        {page && section ? (
          showShared ? (
            <SharedPage key={page.id} entry={page as SharedEntry} world={shared} section={section} />
          ) : (
            <Page key={page.id} node={page as BinderNode} section={section} />
          )
        ) : (
          <EmptyState
            icon="library-bold-duotone"
            title={showShared ? `Nothing here in ${shared.title}` : query.trim() ? "Nothing matches" : `No ${section?.label.toLowerCase() ?? "entries"} yet`}
            action={
              !showShared && canEdit && section && !query.trim()
                ? { label: `New ${section.singular.toLowerCase()}`, onClick: () => void createEntry() }
                : query.trim()
                  ? { label: "Clear the search", icon: "close-circle-linear", onClick: () => setQuery("") }
                  : false
            }
          >
            {showShared
              ? `Nothing of this kind in ${shared.title} yet.`
              : query.trim()
                ? `No ${section?.label.toLowerCase() ?? "entries"} have that name.`
                : `Each ${section?.singular.toLowerCase() ?? "entry"} gets a page here with its details and everywhere it's mentioned.`}
          </EmptyState>
        )}
      </div>
      {editing && (
        <EntityTypeDialog
          type={editing.type}
          onClose={(saved) => {
            setEditing(null);
            if (saved) setSectionKey(`type:${saved.id}`);
          }}
        />
      )}
    </div>
  );
}
