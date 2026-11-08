"use server";

import { schema } from "@plotra/db";
import {
  canonStatuses,
  knowledgeLayers,
  propertyTypes,
  releaseKinds,
  setupKinds,
  setupStatuses,
  type CanonStatus,
  type ClaimStatus,
  type EntityField,
  type KnowledgeLayer,
  type NodeKind,
  type NodeProperties,
  type PropertyOptions,
  type PropertyType,
  type ReleaseKind,
  type SetupKind,
  type SetupStatus,
} from "@plotra/db/schema";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { getNodeAccess, requireNodeAccess, requireProjectAccess } from "./access";
import { binderColumns, listNodes, withActions, type BinderNode } from "./binder";
import { ydocToValue } from "./collab/ydoc";
import { requireSession } from "./data";
import { userDb } from "./db";
import { indexDocument } from "./doc-index";
import { assertUnlocked } from "./editorial-guard";
import { enabledModules, typeReleaseKind } from "./modules";
import { readOnly, transaction } from "./request-cache";
import { slugify } from "./slug";
import { defaultProperties } from "./templates";
import { insertVersion } from "./versions";
import { defaultChannels, defaultEntityTypes, isEntityIcon, questEntityType, questStateField, type EntityTypeTemplate } from "./world";
import { pluralOf } from "@/lib/plural";

// Story worlds (plan.md 2.8, Phase 7): custom entity types, releases and
// reveals, canon and retcons, character knowledge and foreshadowing. Like the
// story tools, everything is filtered through the access policy: rows that
// point at notes the user can't see are left out.

const { node, link, project, propertyDef, entityType, release, fact, knowledge, setupPayoff, retcon, user } = schema;

const MAX_NAME = 80;
const MAX_NOTE = 4000;
const MAX_FIELDS = 40;
const COLOR = /^#[0-9a-f]{6}$/i;

const cleanName = (name: string, fallback: string) => name.trim().slice(0, MAX_NAME) || fallback;
const cleanNote = (note: string | null | undefined) => note?.trim().slice(0, MAX_NOTE) || null;
const byPosition = <T extends { position: string }>(a: T, b: T) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0);

export type EntityTypeRow = {
  id: string;
  name: string;
  plural: string;
  icon: string;
  color: string;
  schema: EntityField[];
  builtin: string | null;
  position: string;
};
export type ReleaseRow = {
  id: string;
  title: string;
  kind: ReleaseKind;
  date: string | null;
  notes: string | null;
  position: string;
  nodeId: string | null;
  releasedAt: Date | null;
};
export type FactRow = {
  nodeId: string;
  blockId: string;
  ordinal: number;
  excerpt: string;
  canon: CanonStatus | null;
  reveal: string | null;
  channel: string | null;
  layer: KnowledgeLayer | null;
  claim: ClaimStatus | null;
  claimSourceId: string | null;
};
export type KnowledgeRow = {
  id: string;
  characterNodeId: string;
  factNodeId: string;
  factBlockId: string | null;
  learnedInNodeId: string | null;
  layer: KnowledgeLayer;
  note: string | null;
};
export type SetupRow = {
  id: string;
  kind: SetupKind;
  title: string;
  setupNodeId: string | null;
  setupBlockId: string | null;
  payoffNodeId: string | null;
  payoffBlockId: string | null;
  status: SetupStatus;
  note: string | null;
};

export type WorldData = {
  entityTypes: EntityTypeRow[];
  releases: ReleaseRow[];
  facts: FactRow[];
  knowledge: KnowledgeRow[];
  setups: SetupRow[];
  /** Reveal channels: the project's own, or the defaults. */
  channels: string[];
};

const typeColumns = {
  id: entityType.id,
  name: entityType.name,
  plural: entityType.plural,
  icon: entityType.icon,
  color: entityType.color,
  schema: entityType.schema,
  builtin: entityType.builtin,
  position: entityType.position,
};
const releaseColumns = {
  id: release.id,
  title: release.title,
  kind: release.kind,
  date: release.date,
  notes: release.notes,
  position: release.position,
  nodeId: release.nodeId,
  releasedAt: release.releasedAt,
};
const factColumns = {
  nodeId: fact.nodeId,
  blockId: fact.blockId,
  ordinal: fact.ordinal,
  excerpt: fact.excerpt,
  canon: fact.canon,
  reveal: fact.reveal,
  channel: fact.channel,
  layer: fact.layer,
  claim: fact.claim,
  claimSourceId: fact.claimSourceId,
};
const knowledgeColumns = {
  id: knowledge.id,
  characterNodeId: knowledge.characterNodeId,
  factNodeId: knowledge.factNodeId,
  factBlockId: knowledge.factBlockId,
  learnedInNodeId: knowledge.learnedInNodeId,
  layer: knowledge.layer,
  note: knowledge.note,
};
const setupColumns = {
  id: setupPayoff.id,
  kind: setupPayoff.kind,
  title: setupPayoff.title,
  setupNodeId: setupPayoff.setupNodeId,
  setupBlockId: setupPayoff.setupBlockId,
  payoffNodeId: setupPayoff.payoffNodeId,
  payoffBlockId: setupPayoff.payoffBlockId,
  status: setupPayoff.status,
  note: setupPayoff.note,
};

/** Everything the world views share: entity types, releases, tagged blocks, knowledge and setups. */
export async function getWorld(projectId: string): Promise<WorldData> {
  return readOnly(async () => {
    const { project: found } = await requireProjectAccess(projectId);
    const access = await getNodeAccess(projectId);
    const [types, releases, facts, known, setups] = await userDb((tx) =>
      Promise.all([
        tx.select(typeColumns).from(entityType).where(eq(entityType.projectId, projectId)),
        tx.select(releaseColumns).from(release).where(eq(release.projectId, projectId)),
        tx.select(factColumns).from(fact).where(eq(fact.projectId, projectId)).orderBy(asc(fact.nodeId), asc(fact.ordinal)),
        tx.select(knowledgeColumns).from(knowledge).where(eq(knowledge.projectId, projectId)).orderBy(asc(knowledge.createdAt)),
        tx.select(setupColumns).from(setupPayoff).where(eq(setupPayoff.projectId, projectId)).orderBy(asc(setupPayoff.createdAt)),
      ]),
    );
    const seen = (id: string | null) => id === null || access.has(id);
    return {
      entityTypes: types.sort(byPosition),
      releases: releases.sort(byPosition).map((r) => (seen(r.nodeId) ? r : { ...r, nodeId: null })),
      facts: facts.filter((f) => access.has(f.nodeId)),
      knowledge: known.filter((k) => access.has(k.characterNodeId) && access.has(k.factNodeId) && seen(k.learnedInNodeId)),
      // A setup whose notes the user can't see still exists for them, without the links.
      setups: setups.map((s) => ({
        ...s,
        ...(seen(s.setupNodeId) ? {} : { setupNodeId: null, setupBlockId: null }),
        ...(seen(s.payoffNodeId) ? {} : { payoffNodeId: null, payoffBlockId: null }),
      })),
      channels: found.settings.channels?.length ? found.settings.channels : defaultChannels,
    };
  });
}

// ---- Defaults --------------------------------------------------------------------

/**
 * Gives a project what its modules need the first time they're on: the
 * starting entity types of a world bible, the quest type for interactive
 * projects, and the properties continuity checks read. Does nothing for
 * people who can't edit the project.
 */
export async function ensureWorldDefaults(projectId: string): Promise<void> {
  const { project: found, actions } = await requireProjectAccess(projectId);
  if (!actions.has("edit")) return;
  const modules = enabledModules(found.type, found.settings);
  if (!modules.has("world") && !modules.has("interactive") && !modules.has("production")) return;

  await userDb(async (tx) => {
    const existing = await tx
      .select({ id: entityType.id, builtin: entityType.builtin, position: entityType.position, schema: entityType.schema })
      .from(entityType)
      .where(eq(entityType.projectId, projectId));
    // Quest types made before quests had states get the State field.
    const quest = modules.has("interactive") ? existing.find((t) => t.builtin === "quest") : undefined;
    if (quest && !quest.schema.some((f) => f.key === questStateField.key)) {
      await tx.update(entityType).set({ schema: [...quest.schema, questStateField] }).where(eq(entityType.id, quest.id));
    }
    const types: EntityTypeTemplate[] = [];
    if (modules.has("world") && existing.length === 0) types.push(...defaultEntityTypes);
    if (modules.has("interactive") && !existing.some((t) => t.builtin === "quest")) types.push(questEntityType);
    if (types.length) {
      let position = existing.map((t) => t.position).sort().at(-1) ?? null;
      await tx.insert(entityType).values(
        types.map((t) => {
          position = generateKeyBetween(position, null);
          return { projectId, name: t.name, plural: t.plural, icon: t.icon, color: t.color, schema: t.schema, builtin: t.builtin ?? null, position };
        }),
      );
    }

    // Properties modules read from character notes: birth and death dates for the
    // continuity checks, and who plays the part for recording sheets.
    const wanted = [
      ...(modules.has("world") ? (defaultProperties.character ?? []).filter((p) => p.key === "birth-date" || p.key === "death-date") : []),
      ...(modules.has("production") ? [{ key: "actor", label: "Played by", type: "text" as const, options: undefined }] : []),
    ];
    if (wanted.length) {
      const defs = await tx
        .select({ key: propertyDef.key, position: propertyDef.position })
        .from(propertyDef)
        .where(and(eq(propertyDef.projectId, projectId), eq(propertyDef.nodeKind, "character")));
      // Only projects that already have their templates: a fresh one gets them all from `defaultProperties`.
      if (defs.length) {
        let position = defs.map((d) => d.position).sort().at(-1) ?? null;
        const missing = wanted.filter((p) => !defs.some((d) => d.key === p.key));
        if (missing.length) {
          await tx
            .insert(propertyDef)
            .values(
              missing.map((p) => {
                position = generateKeyBetween(position, null);
                return { projectId, nodeKind: "character" as const, key: p.key, label: p.label, type: p.type, options: p.options ?? {}, position };
              }),
            )
            .onConflictDoNothing();
        }
      }
    }
  });
}

// ---- Entity types -----------------------------------------------------------------

function cleanOptions(type: PropertyType, options: PropertyOptions = {}): PropertyOptions {
  const out: PropertyOptions = {};
  if (type === "select" || type === "multi_select") {
    out.choices = [...new Set((options.choices ?? []).map((c) => String(c).trim().slice(0, 80)).filter(Boolean))].slice(0, 100);
  }
  if (type === "node") {
    out.nodeKinds = (options.nodeKinds ?? []).map(String).slice(0, 20);
    out.multiple = Boolean(options.multiple);
  }
  return out;
}

/** Validates a type's fields; keys are made from labels and kept stable once set. */
function cleanSchema(fields: EntityField[]): EntityField[] {
  if (!Array.isArray(fields) || fields.length > MAX_FIELDS) throw new Error(`A type can have up to ${MAX_FIELDS} fields.`);
  const keys = new Set<string>();
  return fields.map((raw) => {
    if (!propertyTypes.includes(raw.type)) throw new Error("Unknown field type.");
    const label = String(raw.label ?? "").trim().slice(0, 60);
    if (!label) throw new Error("Name every field.");
    const base = (raw.key && /^[a-z0-9][a-z0-9-]{0,59}$/.test(raw.key) ? raw.key : slugify(label)) || "field";
    let key = base;
    for (let n = 2; keys.has(key); n++) key = `${base}-${n}`;
    keys.add(key);
    return { key, label, type: raw.type, options: cleanOptions(raw.type, raw.options) };
  });
}

type EntityTypeInput = { name?: string; plural?: string; icon?: string; color?: string; schema?: EntityField[]; position?: string };

function cleanType(input: EntityTypeInput): Partial<typeof entityType.$inferInsert> {
  const values: Partial<typeof entityType.$inferInsert> = {};
  if (input.name !== undefined) values.name = cleanName(input.name, "Type");
  if (input.plural !== undefined) values.plural = cleanName(input.plural, values.name ? pluralOf(values.name) : "Types");
  if (input.icon !== undefined) {
    if (!isEntityIcon(input.icon)) throw new Error("Unknown icon.");
    values.icon = input.icon;
  }
  if (input.color !== undefined) {
    if (!COLOR.test(input.color)) throw new Error("Invalid colour.");
    values.color = input.color;
  }
  if (input.schema !== undefined) values.schema = cleanSchema(input.schema);
  if (input.position !== undefined && input.position && input.position.length <= 256) values.position = input.position;
  return values;
}

export async function createEntityType(projectId: string, input: EntityTypeInput & { name: string }): Promise<EntityTypeRow> {
  return transaction(async () => {
    await requireProjectAccess(projectId, "edit");
    const values = cleanType({ plural: pluralOf(input.name.trim()), icon: "box-linear", color: "#868e96", schema: [], ...input });
    return userDb(async (tx) => {
      const existing = await tx.select({ position: entityType.position }).from(entityType).where(eq(entityType.projectId, projectId));
      if (existing.length >= 60) throw new Error("That's a lot of types. Remove one first.");
      const last = existing.map((t) => t.position).sort().at(-1) ?? null;
      const [row] = await tx
        .insert(entityType)
        .values({
          projectId,
          name: values.name!,
          plural: values.plural!,
          icon: values.icon!,
          color: values.color!,
          schema: values.schema ?? [],
          position: generateKeyBetween(last, null),
        })
        .returning(typeColumns);
      return row;
    });
  });
}

export async function updateEntityType(projectId: string, id: string, patch: EntityTypeInput): Promise<EntityTypeRow> {
  return transaction(async () => {
    await requireProjectAccess(projectId, "edit");
    const values = cleanType(patch);
    const [row] = await userDb((tx) =>
      tx
        .update(entityType)
        .set(values)
        .where(and(eq(entityType.id, id), eq(entityType.projectId, projectId)))
        .returning(typeColumns),
    );
    if (!row) throw new Error("That type no longer exists.");
    return row;
  });
}

/** Deletes a type. Its pages stay, as plain notes, with their property values kept in case the type comes back. */
export async function deleteEntityType(projectId: string, id: string): Promise<BinderNode[]> {
  return transaction(async () => {
    await requireProjectAccess(projectId, "edit");
    const changed = await userDb(async (tx) => {
      const rows = await tx
        .update(node)
        .set({ kind: "note", entityTypeId: null })
        .where(and(eq(node.projectId, projectId), eq(node.entityTypeId, id)))
        .returning(binderColumns);
      await tx.delete(entityType).where(and(eq(entityType.id, id), eq(entityType.projectId, projectId)));
      return rows;
    });
    return withActions(projectId, changed);
  });
}

// ---- Releases ------------------------------------------------------------------------

type ReleaseInput = { title?: string; kind?: ReleaseKind; date?: string | null; notes?: string | null; position?: string; nodeId?: string | null };

async function cleanRelease(projectId: string, input: ReleaseInput): Promise<Partial<typeof release.$inferInsert>> {
  const values: Partial<typeof release.$inferInsert> = {};
  if (input.title !== undefined) values.title = cleanName(input.title, "Untitled release");
  if (input.kind !== undefined) {
    if (!releaseKinds.includes(input.kind)) throw new Error("Unknown kind of release.");
    values.kind = input.kind;
  }
  if (input.date !== undefined) {
    if (input.date && !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("Dates look like 2026-05-01.");
    values.date = input.date || null;
  }
  if (input.notes !== undefined) values.notes = cleanNote(input.notes);
  if (input.position !== undefined && input.position && input.position.length <= 256) values.position = input.position;
  if (input.nodeId !== undefined) {
    if (input.nodeId) await requireNodeAccess(projectId, input.nodeId);
    values.nodeId = input.nodeId || null;
  }
  return values;
}

/** Adds a release at the end. Without a title it's "<Kind> <n>". */
export async function createRelease(projectId: string, input: ReleaseInput = {}): Promise<ReleaseRow> {
  return transaction(async () => {
    const { project: found } = await requireProjectAccess(projectId, "edit");
    const values = await cleanRelease(projectId, input);
    return userDb(async (tx) => {
      const existing = await tx.select({ position: release.position }).from(release).where(eq(release.projectId, projectId));
      if (existing.length >= 500) throw new Error("That's a lot of releases. Remove one first.");
      const kind = values.kind ?? ((releaseKinds as readonly string[]).includes(typeReleaseKind[found.type]) ? (typeReleaseKind[found.type] as ReleaseKind) : "other");
      const label = kind === "other" ? "Release" : kind === "beat" ? "Beat" : kind[0].toUpperCase() + kind.slice(1);
      const [row] = await tx
        .insert(release)
        .values({
          projectId,
          kind,
          ...values,
          title: values.title ?? `${label} ${existing.length + 1}`,
          position: values.position ?? generateKeyBetween(existing.map((r) => r.position).sort().at(-1) ?? null, null),
        })
        .returning(releaseColumns);
      return row;
    });
  });
}

export async function updateRelease(projectId: string, id: string, patch: ReleaseInput): Promise<ReleaseRow> {
  return transaction(async () => {
    await requireProjectAccess(projectId, "edit");
    const values = await cleanRelease(projectId, patch);
    const [row] = await userDb((tx) =>
      tx
        .update(release)
        .set(values)
        .where(and(eq(release.id, id), eq(release.projectId, projectId)))
        .returning(releaseColumns),
    );
    if (!row) throw new Error("That release no longer exists.");
    return row;
  });
}

/** Deletes a release. Notes revealed by it become unrevealed (the tag is cleared). */
export async function deleteRelease(projectId: string, id: string): Promise<void> {
  return transaction(async () => {
    await requireProjectAccess(projectId, "edit");
    await userDb((tx) => tx.delete(release).where(and(eq(release.id, id), eq(release.projectId, projectId))));
  });
}

// ---- Canon, reveals and retcons ---------------------------------------------------------

export type RetconRow = {
  id: string;
  releaseId: string | null;
  reason: string;
  versionId: string | null;
  previousCanon: CanonStatus | null;
  createdBy: string | null;
  createdAt: Date;
};

/**
 * Sets a note's canon status. Retconning needs a reason ("changed in Book 3
 * because…") and keeps the text as it stood, as a named version, so the old
 * canon can always be read again.
 */
export async function setNodeCanon(
  projectId: string,
  nodeId: string,
  input: { canon: CanonStatus; reason?: string; releaseId?: string | null },
): Promise<BinderNode> {
  return transaction(async () => {
    const { user: me } = await requireSession();
    await requireNodeAccess(projectId, nodeId, "edit");
    await assertUnlocked(projectId, nodeId);
    if (!canonStatuses.includes(input.canon)) throw new Error("Unknown canon status.");
    const reason = input.reason?.trim().slice(0, MAX_NOTE) ?? "";
    if (input.canon === "retconned" && !reason) throw new Error("Say what changed and why, so the retcon has a history.");

    const updated = await userDb(async (tx) => {
      const [current] = await tx.select({ canon: node.canon, ydoc: node.ydoc, kind: node.kind }).from(node).where(eq(node.id, nodeId));
      if (input.canon === "retconned") {
        let releaseId: string | null = null;
        if (input.releaseId) {
          const [found] = await tx
            .select({ id: release.id })
            .from(release)
            .where(and(eq(release.id, input.releaseId), eq(release.projectId, projectId)));
          releaseId = found?.id ?? null;
        }
        let versionId: string | null = null;
        if (current.ydoc?.length) {
          const words = current.kind === "canvas" || current.kind === "dialogue" ? 0 : indexDocument(ydocToValue(current.ydoc)).words;
          const saved = await insertVersion(tx, {
            projectId,
            nodeId,
            name: `Before retcon: ${reason}`.slice(0, 80),
            auto: false,
            state: current.ydoc,
            wordCount: words,
            createdById: me.id,
          });
          versionId = saved.id;
        }
        await tx.insert(retcon).values({ projectId, nodeId, releaseId, reason, versionId, previousCanon: current.canon, createdById: me.id });
      }
      const [row] = await tx.update(node).set({ canon: input.canon }).where(eq(node.id, nodeId)).returning(binderColumns);
      return row;
    });
    const [visible] = await withActions(projectId, [updated]);
    if (!visible) throw new Error("That note is no longer visible to you.");
    return visible;
  });
}

export async function listRetcons(projectId: string, nodeId: string): Promise<RetconRow[]> {
  return readOnly(async () => {
    await requireNodeAccess(projectId, nodeId);
    return userDb((tx) =>
      tx
        .select({
          id: retcon.id,
          releaseId: retcon.releaseId,
          reason: retcon.reason,
          versionId: retcon.versionId,
          previousCanon: retcon.previousCanon,
          createdBy: user.name,
          createdAt: retcon.createdAt,
        })
        .from(retcon)
        .leftJoin(user, eq(user.id, retcon.createdById))
        .where(eq(retcon.nodeId, nodeId))
        .orderBy(desc(retcon.createdAt)),
    );
  });
}

/**
 * When and where the audience learns what's in a note, and whether it's the
 * truth or something they're led to believe. A null release means unrevealed
 * (unless a folder above it, or a release that ships it, says otherwise).
 */
export async function setNodeReveal(
  projectId: string,
  nodeId: string,
  patch: { releaseId?: string | null; channel?: string | null; layer?: KnowledgeLayer },
): Promise<BinderNode> {
  return transaction(async () => {
    await requireNodeAccess(projectId, nodeId, "edit");
    await assertUnlocked(projectId, nodeId);
    const values: Partial<typeof node.$inferInsert> = {};
    if (patch.releaseId !== undefined) {
      if (patch.releaseId) {
        const [found] = await userDb((tx) =>
          tx.select({ id: release.id }).from(release).where(and(eq(release.id, patch.releaseId!), eq(release.projectId, projectId))),
        );
        if (!found) throw new Error("That release no longer exists.");
      }
      values.revealReleaseId = patch.releaseId || null;
    }
    if (patch.channel !== undefined) values.revealChannel = patch.channel?.trim().slice(0, 40) || null;
    if (patch.layer !== undefined) {
      if (!knowledgeLayers.includes(patch.layer)) throw new Error("Unknown layer.");
      values.layer = patch.layer;
    }
    const [updated] = await userDb((tx) => tx.update(node).set(values).where(eq(node.id, nodeId)).returning(binderColumns));
    const [visible] = await withActions(projectId, [updated]);
    if (!visible) throw new Error("That note is no longer visible to you.");
    return visible;
  });
}

// ---- Character knowledge ------------------------------------------------------------------

type KnowledgeInput = {
  characterNodeId?: string;
  factNodeId?: string;
  factBlockId?: string | null;
  learnedInNodeId?: string | null;
  layer?: KnowledgeLayer;
  note?: string | null;
};

async function cleanKnowledge(projectId: string, input: KnowledgeInput): Promise<Partial<typeof knowledge.$inferInsert>> {
  const values: Partial<typeof knowledge.$inferInsert> = {};
  if (input.characterNodeId !== undefined) {
    await requireNodeAccess(projectId, input.characterNodeId);
    values.characterNodeId = input.characterNodeId;
  }
  if (input.factNodeId !== undefined) {
    await requireNodeAccess(projectId, input.factNodeId);
    values.factNodeId = input.factNodeId;
  }
  if (input.factBlockId !== undefined) values.factBlockId = input.factBlockId?.slice(0, 64) || null;
  if (input.learnedInNodeId !== undefined) {
    if (input.learnedInNodeId) await requireNodeAccess(projectId, input.learnedInNodeId);
    values.learnedInNodeId = input.learnedInNodeId || null;
  }
  if (input.layer !== undefined) {
    if (!knowledgeLayers.includes(input.layer)) throw new Error("Unknown layer.");
    values.layer = input.layer;
  }
  if (input.note !== undefined) values.note = cleanNote(input.note);
  return values;
}

/** Records that a character knows a secret, and the scene they learn it in. */
export async function createKnowledge(projectId: string, input: KnowledgeInput & { characterNodeId: string; factNodeId: string }): Promise<KnowledgeRow> {
  return transaction(async () => {
    await requireProjectAccess(projectId, "edit");
    const values = await cleanKnowledge(projectId, input);
    const [row] = await userDb((tx) =>
      tx
        .insert(knowledge)
        .values({ projectId, characterNodeId: input.characterNodeId, factNodeId: input.factNodeId, ...values })
        .returning(knowledgeColumns),
    );
    return row;
  });
}

export async function updateKnowledge(projectId: string, id: string, patch: KnowledgeInput): Promise<KnowledgeRow> {
  return transaction(async () => {
    await requireProjectAccess(projectId, "edit");
    const values = await cleanKnowledge(projectId, patch);
    const [row] = await userDb((tx) =>
      tx
        .update(knowledge)
        .set(values)
        .where(and(eq(knowledge.id, id), eq(knowledge.projectId, projectId)))
        .returning(knowledgeColumns),
    );
    if (!row) throw new Error("That entry no longer exists.");
    return row;
  });
}

export async function deleteKnowledge(projectId: string, id: string): Promise<void> {
  return transaction(async () => {
    await requireProjectAccess(projectId, "edit");
    await userDb((tx) => tx.delete(knowledge).where(and(eq(knowledge.id, id), eq(knowledge.projectId, projectId))));
  });
}

// ---- Setups and payoffs ---------------------------------------------------------------------

type SetupInput = {
  kind?: SetupKind;
  title?: string;
  setupNodeId?: string | null;
  setupBlockId?: string | null;
  payoffNodeId?: string | null;
  payoffBlockId?: string | null;
  status?: SetupStatus;
  note?: string | null;
};

async function cleanSetup(projectId: string, input: SetupInput): Promise<Partial<typeof setupPayoff.$inferInsert>> {
  const values: Partial<typeof setupPayoff.$inferInsert> = {};
  if (input.kind !== undefined) {
    if (!setupKinds.includes(input.kind)) throw new Error("Unknown kind.");
    values.kind = input.kind;
  }
  if (input.title !== undefined) values.title = cleanName(input.title, "Untitled setup");
  for (const side of ["setup", "payoff"] as const) {
    const nodeKey = `${side}NodeId` as const;
    const blockKey = `${side}BlockId` as const;
    if (input[nodeKey] !== undefined) {
      if (input[nodeKey]) await requireNodeAccess(projectId, input[nodeKey]!);
      values[nodeKey] = input[nodeKey] || null;
      // The block belonged to the old note.
      if (input[blockKey] === undefined) values[blockKey] = null;
    }
    if (input[blockKey] !== undefined) values[blockKey] = input[blockKey]?.slice(0, 64) || null;
  }
  if (input.status !== undefined) {
    if (!setupStatuses.includes(input.status)) throw new Error("Unknown status.");
    values.status = input.status;
  }
  if (input.note !== undefined) values.note = cleanNote(input.note);
  return values;
}

export async function createSetup(projectId: string, input: SetupInput = {}): Promise<SetupRow> {
  return transaction(async () => {
    await requireProjectAccess(projectId, "edit");
    const values = await cleanSetup(projectId, input);
    const [row] = await userDb((tx) =>
      tx
        .insert(setupPayoff)
        .values({ projectId, ...values, title: values.title ?? "Untitled setup" })
        .returning(setupColumns),
    );
    return row;
  });
}

export async function updateSetup(projectId: string, id: string, patch: SetupInput): Promise<SetupRow> {
  return transaction(async () => {
    await requireProjectAccess(projectId, "edit");
    const values = await cleanSetup(projectId, patch);
    // Linking a payoff pays the setup off, unless the caller says otherwise.
    if (values.payoffNodeId && patch.status === undefined) values.status = "paid";
    const [row] = await userDb((tx) =>
      tx
        .update(setupPayoff)
        .set(values)
        .where(and(eq(setupPayoff.id, id), eq(setupPayoff.projectId, projectId)))
        .returning(setupColumns),
    );
    if (!row) throw new Error("That setup no longer exists.");
    return row;
  });
}

export async function deleteSetup(projectId: string, id: string): Promise<void> {
  return transaction(async () => {
    await requireProjectAccess(projectId, "edit");
    await userDb((tx) => tx.delete(setupPayoff).where(and(eq(setupPayoff.id, id), eq(setupPayoff.projectId, projectId))));
  });
}

// ---- Shared worlds ----------------------------------------------------------------------------

export type SharedEntry = {
  id: string;
  kind: NodeKind;
  title: string;
  aliases: string[];
  synopsis: string | null;
  entityTypeId: string | null;
  canon: CanonStatus;
  properties: NodeProperties;
};
export type SharedWorld = {
  projectId: string;
  title: string;
  slug: string;
  entityTypes: EntityTypeRow[];
  entries: SharedEntry[];
};

const sharedKinds: NodeKind[] = ["character", "location", "entity"];

/**
 * The world bible this project shares (plan.md 2.8 "Shared worlds"): the
 * characters, places and entities of another project, read with the user's own
 * access to that project. Null when there's none, or they can't see it.
 */
export async function getSharedWorld(projectId: string): Promise<SharedWorld | null> {
  return readOnly(async () => {
    const { project: found } = await requireProjectAccess(projectId);
    if (!found.worldId) return null;
    const [world] = await userDb((tx) =>
      tx.select({ id: project.id, title: project.title, slug: project.slug }).from(project).where(eq(project.id, found.worldId!)),
    );
    if (!world) return null;
    try {
      await requireProjectAccess(world.id);
    } catch {
      return null;
    }
    const nodes = await listNodes(world.id);
    const trashed = new Set(nodes.filter((n) => n.deletedAt).map((n) => n.id));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const live = (id: string) => {
      for (let n = byId.get(id); n; n = n.parentId ? byId.get(n.parentId) : undefined) if (trashed.has(n.id)) return false;
      return true;
    };
    const types = await userDb((tx) => tx.select(typeColumns).from(entityType).where(eq(entityType.projectId, world.id)));
    return {
      projectId: world.id,
      title: world.title,
      slug: world.slug,
      entityTypes: types.sort(byPosition),
      entries: nodes
        .filter((n) => sharedKinds.includes(n.kind) && live(n.id))
        .map((n) => ({
          id: n.id,
          kind: n.kind,
          title: n.title,
          aliases: n.aliases,
          synopsis: n.synopsis,
          entityTypeId: n.entityTypeId,
          canon: n.canon,
          properties: n.properties,
        })),
    };
  });
}

export type WorldLink = { source: string; target: string; kind: "wiki" | "embed" | "property"; context: string | null };

/**
 * Links from this project's notes to entries of the world it shares, for the
 * graph and for an entry's "Mentioned here". Only notes the user can read, and
 * only entries of a world they can open.
 */
export async function getWorldLinks(projectId: string): Promise<WorldLink[]> {
  return readOnly(async () => {
    const world = await getSharedWorld(projectId);
    if (!world?.entries.length) return [];
    const access = await getNodeAccess(projectId);
    const entries = world.entries.map((e) => e.id);
    const rows = await userDb((tx) =>
      tx
        .select({ source: link.sourceNodeId, target: link.targetNodeId, kind: link.kind, context: link.context })
        .from(link)
        .innerJoin(node, eq(node.id, link.sourceNodeId))
        .where(and(eq(link.projectId, projectId), inArray(link.targetNodeId, entries), isNull(node.deletedAt))),
    );
    return rows.filter((l) => access.has(l.source));
  });
}
