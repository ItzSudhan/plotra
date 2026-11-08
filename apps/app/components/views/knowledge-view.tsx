"use client";

import { setupKinds, setupStatuses, type KnowledgeLayer, type NodeKind, type SetupKind, type SetupStatus } from "@plotra/db/schema";
import { Icon } from "@plotra/icons";
import { cn } from "@plotra/ui/lib/utils";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { undoToast } from "@plotra/ui/components/sonner";
import { IconButton } from "@plotra/ui/components/icon-button";
import { useStore } from "@/components/workspace/stores";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { useHorizon, useWorld, WORLD_NOTICE } from "@/components/world/data";
import { NodeIcon } from "@/components/world/entity-icon";
import { NodeSelect } from "@/components/world/node-select";
import { revealMap } from "@/lib/horizon";
import { containerKinds, flatten, type BinderNode } from "@/lib/tree";
import {
  createKnowledge,
  createSetup,
  deleteKnowledge,
  deleteSetup,
  updateKnowledge,
  updateSetup,
  type KnowledgeRow,
  type SetupRow,
  type WorldData,
} from "@/lib/world-actions";
import { NEVER, setupKindMeta, setupStatusMeta } from "@/lib/world";
import { CommitInput, EmptyState, errorText, fieldClass, Segmented, ToolButton, Toolbar } from "./view-ui";
import { SelectField } from "@plotra/ui/components/select-field";
import { plural } from "@/lib/plural";

// Secrets & setups (plan.md 2.8): the three knowledge layers (what's true,
// what the audience has been told, what people believe), who knows which
// secret and from which scene, and setups with their payoffs.

type Tab = "layers" | "secrets" | "setups";

const characterKinds: NodeKind[] = ["character"];
const sceneKinds: NodeKind[] = ["scene", "chapter"];

export function KnowledgeView() {
  const { project, notify } = useWorkspace();
  const { data: world, refresh } = useWorld();
  const [tab, setTab] = useState<Tab>("layers");
  const canEdit = project.actions.includes("edit");

  const run = async (work: () => Promise<unknown>) => {
    try {
      await work();
      notify(WORLD_NOTICE);
      refresh();
      return true;
    } catch (error) {
      toast.error(errorText(error));
      return false;
    }
  };

  if (!world) return <div className="m-6 h-40 animate-pulse rounded-lg bg-muted" />;

  return (
    <div className="flex h-full flex-col">
      <Toolbar>
        <span className="font-medium text-foreground">Secrets &amp; setups</span>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "layers", label: "Knowledge layers" },
            { value: "secrets", label: `Who knows what (${world.knowledge.length})` },
            { value: "setups", label: `Setups & payoffs (${world.setups.length})` },
          ]}
        />
        {tab === "setups" && (
          <ToolButton icon="add-square-linear" label="Add a setup" disabled={!canEdit} onClick={() => void run(() => createSetup(project.id))}>
            Setup
          </ToolButton>
        )}
      </Toolbar>
      <div className="min-h-0 flex-1 overflow-auto">
        {tab === "layers" ? (
          <Layers world={world} />
        ) : tab === "secrets" ? (
          <Secrets rows={world.knowledge} editable={canEdit} run={run} />
        ) : (
          <Setups rows={world.setups} editable={canEdit} run={run} onAdd={() => void run(() => createSetup(project.id))} />
        )}
      </div>
    </div>
  );
}

// ---- Knowledge layers -------------------------------------------------------------

type LayerItem = { key: string; node: BinderNode; excerpt?: string; detail?: string };

function Layers({ world }: { world: WorldData }) {
  const { binder, openNode, openView } = useWorkspace();
  const { nodes, index } = useStore(binder);
  const horizon = useHorizon();

  const { untold, told, believed } = useMemo(() => {
    const untold: LayerItem[] = [];
    const told: LayerItem[] = [];
    const believed: LayerItem[] = [];
    const revealedBy = revealMap(nodes, world.releases);
    const releaseTitle = (id: string | undefined) => world.releases.find((r) => r.id === id)?.title;
    // Known to the audience: revealed at all, or by the horizon when one is set.
    const known = (id: string) => (horizon ? horizon.knows(id) : revealedBy.has(id));

    for (const n of flatten(index)) {
      if (containerKinds.includes(n.kind) || n.kind === "scene" || n.kind === "canvas" || n.kind === "timeline" || n.kind === "dialogue") continue;
      const detail = revealedBy.has(n.id) ? `revealed in ${releaseTitle(revealedBy.get(n.id))}` : undefined;
      if (n.layer === "belief") believed.push({ key: n.id, node: n, detail });
      else if (known(n.id)) told.push({ key: n.id, node: n, detail });
      else untold.push({ key: n.id, node: n, detail });
    }
    for (const f of world.facts) {
      const n = index.byId.get(f.nodeId);
      if (!n || n.deletedAt || (!f.reveal && !f.layer)) continue;
      const item = { key: `${f.nodeId}:${f.blockId}`, node: n, excerpt: f.excerpt };
      const blockKnown = f.reveal === NEVER ? false : f.reveal ? (horizon ? horizon.knowsBlock(f.reveal) : true) : known(n.id);
      const detail = f.reveal === NEVER ? "never revealed" : f.reveal ? `revealed in ${releaseTitle(f.reveal) ?? "a removed release"}` : undefined;
      if (f.layer === "belief") believed.push({ ...item, detail });
      else if (blockKnown) told.push({ ...item, detail });
      else untold.push({ ...item, detail });
    }
    return { untold, told, believed };
  }, [horizon, index, nodes, world.facts, world.releases]);

  const columns = [
    { title: "True, but untold", hint: "What's actually the case and the audience doesn't know yet.", icon: "lock-linear", items: untold },
    {
      title: horizon ? "Told by this point" : "Told to the audience",
      hint: horizon ? "What the audience knows as of the chosen release." : "Everything a release reveals.",
      icon: "eye-linear",
      items: told,
    },
    { title: "Believed", hint: "Lies, propaganda, unreliable narration: what people think is true.", icon: "incognito-linear", items: believed },
  ] as const;

  if (world.releases.length === 0 && believed.length === 0) {
    return (
      <EmptyState icon="eye-bold-duotone" title="Nothing revealed yet" action={{ label: "Open the roadmap", icon: "rocket-linear", onClick: () => openView("roadmap") }}>
        Add releases in the roadmap, then tag notes and passages with when they&apos;re revealed (the inspector&apos;s Story tab, or “Tag block”). This view then
        sorts your world into what&apos;s true, what the audience has been told, and what people believe.
      </EmptyState>
    );
  }

  return (
    <div className="grid min-h-full gap-px bg-border md:grid-cols-3">
      {columns.map((column) => (
        <section key={column.title} className="bg-background p-4">
          <h2 className="flex items-center gap-2 font-display text-xl">
            <Icon name={column.icon} className="size-4 text-muted-foreground" />
            {column.title}
            <span className="text-sm text-faint tabular-nums">{column.items.length}</span>
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{column.hint}</p>
          <ul className="mt-3 grid gap-1">
            {column.items.slice(0, 200).map((item) => (
              <li key={item.key}>
                <button type="button" onClick={() => openNode(item.node.id, "tab")} className="flex w-full items-start gap-1.5 rounded-md px-1.5 py-1 text-left text-ui-sm hover:bg-accent">
                  <NodeIcon node={item.node} className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{item.node.title}</span>
                    {item.excerpt && <span className="line-clamp-2 text-xs text-muted-foreground">{item.excerpt}</span>}
                    {item.detail && <span className="block text-meta text-faint">{item.detail}</span>}
                  </span>
                </button>
              </li>
            ))}
            {column.items.length === 0 && <li className="px-1.5 py-1 text-xs text-faint">Nothing here.</li>}
          </ul>
        </section>
      ))}
    </div>
  );
}

// ---- Who knows what ---------------------------------------------------------------

type Run = (work: () => Promise<unknown>) => Promise<boolean>;

function Secrets({ rows, editable, run }: { rows: KnowledgeRow[]; editable: boolean; run: Run }) {
  const { project, binder, openNode } = useWorkspace();
  const { index } = useStore(binder);
  const [fact, setFact] = useState<string | null>(null);
  const [character, setCharacter] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Removing takes effect at once; Undo puts the same row back.
  const removeKnowledge = async (row: KnowledgeRow) => {
    const who = index.byId.get(row.characterNodeId)?.title ?? "Someone";
    const what = index.byId.get(row.factNodeId)?.title ?? "the secret";
    if (!(await run(() => deleteKnowledge(project.id, row.id)))) return;
    undoToast(`${who} no longer knows ‘${what}’`, () =>
      run(() =>
        createKnowledge(project.id, {
          characterNodeId: row.characterNodeId,
          factNodeId: row.factNodeId,
          factBlockId: row.factBlockId,
          learnedInNodeId: row.learnedInNodeId,
          layer: row.layer,
          note: row.note,
        }),
      ),
    );
  };

  const bySecret = useMemo(() => {
    const map = new Map<string, KnowledgeRow[]>();
    for (const row of rows) map.set(row.factNodeId, [...(map.get(row.factNodeId) ?? []), row]);
    return [...map.entries()];
  }, [rows]);

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-4 p-4">
      {editable && (
        <form
          ref={formRef}
          className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3 text-ui-sm"
          onSubmit={(e) => {
            e.preventDefault();
            if (!fact || !character) return;
            void run(() => createKnowledge(project.id, { factNodeId: fact, characterNodeId: character })).then(() => setCharacter(null));
          }}
        >
          <NodeSelect value={fact} onChange={setFact} placeholder="A secret (any note)…" label="Secret" className="w-56 flex-1" />
          <span className="text-muted-foreground">is known by</span>
          <NodeSelect value={character} onChange={setCharacter} kinds={characterKinds} placeholder="a character…" label="Character" className="w-48 flex-1" />
          <button type="submit" disabled={!fact || !character} className="h-8 rounded-md bg-foreground px-3 text-background disabled:opacity-50">
            Track
          </button>
        </form>
      )}
      {bySecret.length === 0 ? (
        <EmptyState
          icon="incognito-linear"
          title="No secrets tracked"
          action={editable && { label: "Pick a secret", onClick: () => formRef.current?.querySelector("select")?.focus() }}
        >
          Record who knows a secret and the scene they learn it in. The continuity checks then catch a point-of-view character relying on something they
          haven&apos;t learned yet.
        </EmptyState>
      ) : (
        bySecret.map(([factId, known]) => {
          const secret = index.byId.get(factId);
          return (
            <section key={factId} className="rounded-lg border">
              <header className="flex items-center gap-2 border-b bg-sidebar px-3 py-2">
                {secret && <NodeIcon node={secret} className="size-4 text-muted-foreground" />}
                <button type="button" onClick={() => secret && openNode(secret.id, "tab")} className="truncate font-medium hover:underline">
                  {secret?.title ?? "A note you can't see"}
                </button>
                {secret?.layer === "belief" && <span className="rounded bg-muted px-1.5 text-meta text-muted-foreground">Belief</span>}
                <span className="ml-auto text-xs text-faint">
                  {known.length} {known.length === 1 ? "character knows" : "characters know"}
                </span>
              </header>
              <ul className="divide-y">
                {known.map((row) => (
                  <li key={row.id} className="grid items-center gap-2 px-3 py-2 text-ui-sm sm:grid-cols-[10rem_minmax(0,1fr)_7rem_minmax(0,1fr)_auto]">
                    <button type="button" onClick={() => openNode(row.characterNodeId, "tab")} className="truncate text-left font-medium hover:underline">
                      {index.byId.get(row.characterNodeId)?.title ?? "Someone"}
                    </button>
                    <NodeSelect
                      value={row.learnedInNodeId}
                      disabled={!editable}
                      kinds={sceneKinds}
                      placeholder="Knew all along"
                      label="Learned in"
                      onChange={(learnedInNodeId) => void run(() => updateKnowledge(project.id, row.id, { learnedInNodeId }))}
                    />
                    <SelectField
                      value={row.layer}
                      disabled={!editable}
                      aria-label="What they know"
                      onValueChange={(v) => void run(() => updateKnowledge(project.id, row.id, { layer: v as KnowledgeLayer }))}
                      className={fieldClass}
                    >
                      <option value="truth">The truth</option>
                      <option value="belief">A false version</option>
                    </SelectField>
                    <label className="block">
                      <span className="sr-only">Note</span>
                      <CommitInput
                        value={row.note ?? ""}
                        disabled={!editable}
                        placeholder="How they find out, or what they think instead"
                        onCommit={(note) => void run(() => updateKnowledge(project.id, row.id, { note }))}
                      />
                    </label>
                    {editable && (
                      <IconButton
                        icon="close-linear"
                        size="sm"
                        variant="destructive"
                        label={`Remove ${index.byId.get(row.characterNodeId)?.title ?? "this character"}`}
                        onClick={() => void removeKnowledge(row)}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}

// ---- Setups and payoffs ---------------------------------------------------------------

function Setups({ rows, editable, run, onAdd }: { rows: SetupRow[]; editable: boolean; run: Run; onAdd: () => void }) {
  const { project, binder } = useWorkspace();
  const { index } = useStore(binder);
  const [openOnly, setOpenOnly] = useState(false);
  const scenes = useMemo(() => flatten(index).filter((n) => n.kind === "scene"), [index]);
  const removeSetup = async (row: SetupRow) => {
    if (!(await run(() => deleteSetup(project.id, row.id)))) return;
    const { kind, title, setupNodeId, setupBlockId, payoffNodeId, payoffBlockId, status, note } = row;
    undoToast(`Deleted ‘${row.title}’`, () =>
      run(() => createSetup(project.id, { kind, title, setupNodeId, setupBlockId, payoffNodeId, payoffBlockId, status, note })),
    );
  };
  const shown = openOnly ? rows.filter((r) => r.status === "open") : rows;

  // How long a setup has been waiting: scenes told since it was planted.
  const waiting = (row: SetupRow) => {
    if (row.status !== "open" || !row.setupNodeId) return null;
    const at = scenes.findIndex((s) => s.id === row.setupNodeId);
    return at < 0 ? null : scenes.length - 1 - at;
  };

  if (rows.length === 0) {
    return (
      <EmptyState icon="target-linear" title="No setups yet" action={editable && { label: "Add a setup", onClick: onAdd }}>
        Track Chekhov&apos;s guns, clues, red herrings and mysteries: link where each is planted and where it pays off, and see which threads are still open.
      </EmptyState>
    );
  }

  return (
    <div className="p-4">
      <label className="mb-3 flex w-fit items-center gap-2 text-ui-sm text-muted-foreground">
        <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
        Only what&apos;s still open ({rows.filter((r) => r.status === "open").length})
      </label>
      <table className="w-full min-w-[56rem] border-separate border-spacing-0 text-ui-sm">
        <thead>
          <tr className="text-left text-meta font-medium text-muted-foreground">
            {["Kind", "What", "Set up in", "Pays off in", "Status", "Notes", ""].map((h) => (
              <th key={h} className="border-b bg-sidebar px-2 py-1.5 font-medium first:rounded-tl-md last:rounded-tr-md">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => {
            const since = waiting(row);
            return (
              <tr key={row.id} className="align-top">
                <td className="w-36 border-b px-1 py-1">
                  <SelectField
                    value={row.kind}
                    disabled={!editable}
                    aria-label="Kind"
                    onValueChange={(v) => void run(() => updateSetup(project.id, row.id, { kind: v as SetupKind }))}
                    className={cn(fieldClass, "border-transparent hover:border-input")}
                  >
                    {setupKinds.map((k) => (
                      <option key={k} value={k}>
                        {setupKindMeta[k].label}
                      </option>
                    ))}
                  </SelectField>
                </td>
                <td className="min-w-48 border-b px-1 py-1">
                  <label className="block">
                    <span className="sr-only">What</span>
                    <CommitInput
                      value={row.title}
                      disabled={!editable}
                      className="border-transparent font-medium hover:border-input"
                      onCommit={(title) => title.trim() && void run(() => updateSetup(project.id, row.id, { title }))}
                    />
                  </label>
                </td>
                <td className="w-52 border-b px-1 py-1">
                  <NodeSelect
                    value={row.setupNodeId}
                    disabled={!editable}
                    placeholder="Not planted yet"
                    label="Set up in"
                    className="border-transparent hover:border-input"
                    onChange={(setupNodeId) => void run(() => updateSetup(project.id, row.id, { setupNodeId }))}
                  />
                </td>
                <td className="w-52 border-b px-1 py-1">
                  <NodeSelect
                    value={row.payoffNodeId}
                    disabled={!editable}
                    placeholder="No payoff yet"
                    label="Pays off in"
                    className="border-transparent hover:border-input"
                    onChange={(payoffNodeId) => void run(() => updateSetup(project.id, row.id, { payoffNodeId }))}
                  />
                </td>
                <td className="w-32 border-b px-1 py-1">
                  <SelectField
                    value={row.status}
                    disabled={!editable}
                    aria-label="Status"
                    onValueChange={(v) => void run(() => updateSetup(project.id, row.id, { status: v as SetupStatus }))}
                    className={cn(fieldClass, "border-transparent font-medium hover:border-input")}
                    style={{ color: setupStatusMeta[row.status].color }}
                  >
                    {setupStatuses.map((s) => (
                      <option key={s} value={s}>
                        {setupStatusMeta[s].label}
                      </option>
                    ))}
                  </SelectField>
                  {since !== null && since > 0 && (
                    <p className="px-2 text-meta text-faint">
                      open for {since} {plural(since, "scene")}
                    </p>
                  )}
                </td>
                <td className="min-w-48 border-b px-1 py-1">
                  <label className="block">
                    <span className="sr-only">Notes</span>
                    <CommitInput
                      value={row.note ?? ""}
                      disabled={!editable}
                      placeholder="—"
                      className="border-transparent hover:border-input"
                      onCommit={(note) => void run(() => updateSetup(project.id, row.id, { note }))}
                    />
                  </label>
                </td>
                <td className="w-8 border-b py-1">
                  {editable && (
                    <IconButton
                      icon="trash-bin-minimalistic-linear"
                      size="sm"
                      variant="destructive"
                      label={`Delete ‘${row.title}’`}
                      onClick={() => void removeSetup(row)}
                    />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
