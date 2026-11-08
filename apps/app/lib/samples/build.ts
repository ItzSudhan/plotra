import type { CalendarDefinition, CanonStatus, KnowledgeLayer, NodeHeading, NodeKind, NodeProperties, NodeSettings, PropertyOptions, PropertyType, ReleaseKind, SetupKind, SetupStatus } from "@plotra/db/schema";
import { generateKeyBetween } from "fractional-indexing";
import { gregorian, parseStoryDate, type Calendar } from "../calendar";
import { indexDocument, WIKILINK, type DocNode } from "../doc-index";
import { defaultProperties } from "../templates";
import { defaultEntityTypes, NEVER } from "../world";
import type { SampleBlock, SampleNote, SampleProperty, Seed } from "./types";

// Turns a sample (lib/samples/types.ts) into the rows of a new project: every
// key becomes an id, every body a Plate document with its derived text, word
// count, links and tagged blocks, exactly as a content sync would leave them
// (lib/collab/sync.ts). Pure: ids come from `newId`, and nothing is read or
// written. A reference to a key that doesn't exist throws, so a broken sample
// fails its scratch test instead of creating a project with dead links.

export type BuildOptions = {
  projectId: string;
  userId: string;
  /** A fresh id per call (crypto.randomUUID in the app; a counter in tests). */
  newId: () => string;
};

export type BuiltNode = {
  id: string;
  projectId: string;
  parentId: string | null;
  kind: NodeKind;
  title: string;
  aliases: string[];
  position: string;
  entityTypeId: string | null;
  canon: CanonStatus;
  revealReleaseId: string | null;
  layer: KnowledgeLayer;
  synopsis: string | null;
  properties: NodeProperties;
  settings: NodeSettings;
  text: string;
  headings: NodeHeading[];
  contentTags: string[];
  wordCount: number;
  createdById: string;
  /** The Plate document, for the note's Yjs snapshot; null for folders and boards. */
  content: DocNode[] | null;
};

export type BuiltSample = {
  /** The note to open first. */
  openNodeId: string;
  /** Note key → id, for tests. */
  ids: Map<string, string>;
  propertyDefs: Array<{ projectId: string; nodeKind: NodeKind; key: string; label: string; type: PropertyType; options: PropertyOptions; position: string }>;
  entityTypes: Array<{ id: string; projectId: string; name: string; plural: string; icon: string; color: string; schema: (typeof defaultEntityTypes)[number]["schema"]; builtin: string | null; position: string }>;
  calendars: Array<{ id: string; projectId: string; name: string; definition: CalendarDefinition }>;
  /** Inserted before the nodes without `nodeId` (nodes point at releases too); `nodeId` is set afterwards. */
  releases: Array<{ id: string; projectId: string; title: string; kind: ReleaseKind; date: string | null; notes: string | null; position: string; nodeId: string | null }>;
  /** In binder (depth-first) order. */
  nodes: BuiltNode[];
  links: Array<{ projectId: string; sourceNodeId: string; targetNodeId: string; targetHeading: string | null; kind: "wiki" | "embed" | "property"; context: string; ordinal: number }>;
  facts: Array<{ projectId: string; nodeId: string; blockId: string; ordinal: number; excerpt: string; canon: CanonStatus | null; reveal: string | null; channel: string | null; layer: KnowledgeLayer | null; claim: null; claimSourceId: null }>;
  threads: Array<{ id: string; projectId: string; name: string; color: string; position: string; closedNodeId: string | null }>;
  cells: Array<{ projectId: string; nodeId: string; threadId: string; note: string }>;
  relationships: Array<{ projectId: string; fromNodeId: string; toNodeId: string; type: string; label: string | null; directed: boolean }>;
  events: Array<{ projectId: string; timelineNodeId: string; nodeId: string | null; title: string; description: string | null; start: number; lane: string | null }>;
  knowledge: Array<{ id: string; projectId: string; characterNodeId: string; factNodeId: string; learnedInNodeId: string | null; layer: KnowledgeLayer; note: string | null }>;
  setups: Array<{ id: string; projectId: string; kind: SetupKind; title: string; setupNodeId: string | null; payoffNodeId: string | null; status: SetupStatus; note: string | null }>;
  calendar: Calendar;
};

/** Every note of a sample, parents before children. */
export function flattenNotes(notes: SampleNote[], parent: SampleNote | null = null, out: Array<{ note: SampleNote; parent: SampleNote | null }> = []) {
  for (const note of notes) {
    out.push({ note, parent });
    flattenNotes(note.children ?? [], note, out);
  }
  return out;
}

/** Positions for a run of siblings, in order. */
function positions(count: number): string[] {
  const out: string[] = [];
  let last: string | null = null;
  for (let i = 0; i < count; i++) out.push((last = generateKeyBetween(last, null)));
  return out;
}

export function buildSample(sample: Seed, { projectId, userId, newId }: BuildOptions): BuiltSample {
  const fail = (message: string): never => {
    throw new Error(`Sample “${sample.id}”: ${message}`);
  };
  const flat = flattenNotes(sample.notes);

  // ---- Ids ------------------------------------------------------------------
  const ids = new Map<string, string>();
  for (const { note } of flat) {
    if (ids.has(note.key)) fail(`two notes share the key “${note.key}”.`);
    ids.set(note.key, newId());
  }
  const noteId = (key: string, where: string) => ids.get(key) ?? fail(`${where} refers to the note “${key}”, which doesn't exist.`);
  const kindOf = new Map(flat.map(({ note }) => [note.key, note.kind]));
  const expectKind = (key: string, kind: NodeKind, where: string) => {
    const id = noteId(key, where);
    if (kindOf.get(key) !== kind) fail(`${where} needs “${key}” to be a ${kind}.`);
    return id;
  };

  const releaseIds = new Map<string, string>();
  for (const r of sample.releases) {
    if (releaseIds.has(r.key)) fail(`two releases share the key “${r.key}”.`);
    releaseIds.set(r.key, newId());
  }
  const releaseId = (key: string, where: string) => releaseIds.get(key) ?? fail(`${where} is revealed in “${key}”, which isn't a release.`);

  const threadIds = new Map<string, string>();
  for (const t of sample.threads) {
    if (threadIds.has(t.key)) fail(`two threads share the key “${t.key}”.`);
    threadIds.set(t.key, newId());
  }

  // ---- Templates: the same property definitions and entity types a blank project gets ----
  const propertyDefs = Object.entries(defaultProperties).flatMap(([kind, props]) => {
    const at = positions(props!.length);
    return props!.map((prop, i) => ({ projectId, nodeKind: kind as NodeKind, key: prop.key, label: prop.label, type: prop.type, options: prop.options ?? {}, position: at[i] }));
  });
  const typePositions = positions(defaultEntityTypes.length);
  const entityTypes = defaultEntityTypes.map((t, i) => ({
    id: newId(),
    projectId,
    name: t.name,
    plural: t.plural,
    icon: t.icon,
    color: t.color,
    schema: t.schema,
    builtin: t.builtin ?? null,
    position: typePositions[i],
  }));

  const calendarId = sample.calendar ? newId() : null;
  const calendar: Calendar = sample.calendar && calendarId ? { id: calendarId, name: sample.calendar.name, definition: sample.calendar.definition } : gregorian;

  // ---- Documents ---------------------------------------------------------------
  const toDocument = (note: SampleNote, blocks: SampleBlock[]): DocNode[] =>
    blocks.map((block) => {
      const where = `a block of “${note.key}”`;
      // Slate keeps a text leaf on both sides of every inline element.
      const children: DocNode[] = [{ text: "" }];
      for (const part of block.parts) {
        const last = children[children.length - 1];
        if (typeof part === "string") {
          last.text = `${last.text ?? ""}${part}`;
        } else {
          children.push({ type: WIKILINK, nodeId: noteId(part.link, where), ...(part.as && { alias: part.as }), children: [{ text: "" }] }, { text: "" });
        }
      }
      return {
        type: block.type,
        // Blocks need ids for their tags to be indexed; ten characters, like the editor's own.
        id: newId().replace(/-/g, "").slice(0, 10),
        ...(block.reveal && { reveal: block.reveal === NEVER ? NEVER : releaseId(block.reveal, where) }),
        ...(block.layer && { layer: block.layer }),
        ...(block.canon && { canon: block.canon }),
        children,
      };
    });

  /** The fields of a note's kind (or of its entity type): what its properties may be. */
  const fieldsOf = (note: SampleNote): Array<{ key: string; type: PropertyType }> => {
    if (note.kind !== "entity") return defaultProperties[note.kind] ?? [];
    const type = entityTypes.find((t) => t.name === note.entityType);
    return type ? type.schema : fail(`“${note.key}” is an entity of the unknown type “${note.entityType}”.`);
  };

  const resolveProperty = (note: SampleNote, key: string, value: SampleProperty): NodeProperties[string] => {
    const where = `the property “${key}” of “${note.key}”`;
    const field = fieldsOf(note).find((f) => f.key === key) ?? fail(`${where} isn't a property of that kind of note.`);
    const isRef = typeof value === "object" && !Array.isArray(value);
    if (isRef !== (field.type === "node")) fail(`${where} ${field.type === "node" ? "must point at a note" : "can't point at a note"}.`);
    if (!isRef) return value;
    return "note" in value ? noteId(value.note, where) : value.notes.map((k) => noteId(k, where));
  };

  // ---- Nodes, in binder order ---------------------------------------------------
  const nodes: BuiltNode[] = [];
  const links: BuiltSample["links"] = [];
  const facts: BuiltSample["facts"] = [];
  const siblingPositions = new Map<SampleNote | null, string[]>();
  const positionOf = (note: SampleNote, parent: SampleNote | null) => {
    const siblings = parent ? (parent.children ?? []) : sample.notes;
    let at = siblingPositions.get(parent);
    if (!at) siblingPositions.set(parent, (at = positions(siblings.length)));
    return at[siblings.indexOf(note)];
  };

  for (const { note, parent } of flat) {
    const id = ids.get(note.key)!;
    const content = note.body ? toDocument(note, note.body) : null;
    const index = content ? indexDocument(content) : null;
    const properties: NodeProperties = {};
    for (const [key, value] of Object.entries(note.properties ?? {})) properties[key] = resolveProperty(note, key, value);

    const settings: NodeSettings = { ...note.settings };
    // A timeline reads story dates in the sample's calendar and shows a lane per plot thread.
    if (note.kind === "timeline") {
      if (calendarId) settings.calendarId = calendarId;
      if (sample.threads.length) settings.lanes ??= "thread";
    }

    nodes.push({
      id,
      projectId,
      parentId: parent ? ids.get(parent.key)! : null,
      kind: note.kind,
      title: note.title,
      aliases: note.aliases ?? [],
      position: positionOf(note, parent),
      entityTypeId: note.kind === "entity" ? entityTypes.find((t) => t.name === note.entityType)!.id : null,
      canon: note.canon ?? "canon",
      revealReleaseId: note.reveal ? releaseId(note.reveal, `“${note.key}”`) : null,
      layer: note.layer ?? "truth",
      synopsis: note.synopsis ?? null,
      properties,
      settings,
      text: index?.text ?? "",
      headings: index?.headings ?? [],
      contentTags: index?.tags ?? [],
      wordCount: index?.words ?? 0,
      createdById: userId,
      content,
    });

    // Links from the text, then from node-valued properties: what a content sync
    // and `setNodeProperties` would have written.
    for (const [ordinal, link] of (index?.links ?? []).entries()) {
      links.push({ projectId, sourceNodeId: id, targetNodeId: link.targetNodeId, targetHeading: link.targetHeading, kind: link.kind, context: link.context, ordinal });
    }
    const propertyTargets = fieldsOf(note)
      .filter((f) => f.type === "node")
      .flatMap((f) => {
        const value = properties[f.key];
        return (Array.isArray(value) ? value : value ? [String(value)] : []).map((target) => ({ key: f.key, target }));
      })
      .filter((t) => t.target !== id);
    for (const [ordinal, t] of propertyTargets.entries()) {
      links.push({ projectId, sourceNodeId: id, targetNodeId: t.target, targetHeading: null, kind: "property", context: t.key, ordinal });
    }
    for (const [ordinal, f] of (index?.facts ?? []).entries()) {
      facts.push({
        projectId,
        nodeId: id,
        blockId: f.blockId,
        ordinal,
        excerpt: f.excerpt,
        canon: f.canon ?? null,
        reveal: f.reveal ?? null,
        channel: f.channel ?? null,
        layer: f.layer ?? null,
        claim: null,
        claimSourceId: null,
      });
    }
  }

  // ---- Releases, threads and the rest ----------------------------------------------
  const releasePositions = positions(sample.releases.length);
  const releases = sample.releases.map((r, i) => ({
    id: releaseIds.get(r.key)!,
    projectId,
    title: r.title,
    kind: r.kind,
    date: r.date ?? null,
    notes: r.notes ?? null,
    position: releasePositions[i],
    nodeId: r.ships ? noteId(r.ships, `the release “${r.key}”`) : null,
  }));

  const threadPositions = positions(sample.threads.length);
  const threads = sample.threads.map((t, i) => ({
    id: threadIds.get(t.key)!,
    projectId,
    name: t.name,
    color: t.color,
    position: threadPositions[i],
    closedNodeId: t.closedIn ? expectKind(t.closedIn, "scene", `the thread “${t.key}”`) : null,
  }));
  const cells = sample.threads.flatMap((t) =>
    t.cells.map((cell) => ({ projectId, nodeId: expectKind(cell.scene, "scene", `the thread “${t.key}”`), threadId: threadIds.get(t.key)!, note: cell.note })),
  );
  if (new Set(cells.map((c) => `${c.nodeId}:${c.threadId}`)).size !== cells.length) fail("a thread lists the same scene twice.");

  const relationships = sample.relationships.map((r) => ({
    projectId,
    fromNodeId: expectKind(r.from, "character", "a relationship"),
    toNodeId: expectKind(r.to, "character", "a relationship"),
    type: r.type,
    label: r.label ?? null,
    directed: r.directed ?? false,
  }));

  const timeline = flat.find(({ note }) => note.kind === "timeline")?.note;
  if (sample.events.length && !timeline) fail("has timeline events but no timeline note.");
  const events = sample.events.map((e) => {
    const start = parseStoryDate(calendar, e.date) ?? fail(`the event “${e.title}” has the date “${e.date}”, which the ${calendar.name} calendar can't read.`);
    return {
      projectId,
      timelineNodeId: ids.get(timeline!.key)!,
      nodeId: e.about ? noteId(e.about, `the event “${e.title}”`) : null,
      title: e.title,
      description: e.description ?? null,
      start,
      lane: e.thread ? (threadIds.get(e.thread) ?? fail(`the event “${e.title}” is in the unknown thread “${e.thread}”.`)) : null,
    };
  });

  const knowledge = sample.knowledge.map((k) => ({
    id: newId(),
    projectId,
    characterNodeId: expectKind(k.character, "character", "a knowledge entry"),
    factNodeId: noteId(k.secret, "a knowledge entry"),
    learnedInNodeId: k.learnedIn ? expectKind(k.learnedIn, "scene", "a knowledge entry") : null,
    layer: k.layer ?? ("truth" as const),
    note: k.note ?? null,
  }));

  const setups = sample.setups.map((s) => ({
    id: newId(),
    projectId,
    kind: s.kind,
    title: s.title,
    setupNodeId: noteId(s.setup, `the setup “${s.title}”`),
    payoffNodeId: s.payoff ? noteId(s.payoff, `the setup “${s.title}”`) : null,
    status: s.status,
    note: s.note ?? null,
  }));

  for (const expected of sample.continuity) for (const key of expected.notes) noteId(key, "an expected continuity issue");

  return {
    openNodeId: noteId(sample.open, "the note to open first"),
    ids,
    propertyDefs,
    entityTypes,
    calendars: sample.calendar && calendarId ? [{ id: calendarId, projectId, name: sample.calendar.name, definition: sample.calendar.definition }] : [],
    releases,
    nodes,
    links,
    facts,
    threads,
    cells,
    relationships,
    events,
    knowledge,
    setups,
    calendar,
  };
}
