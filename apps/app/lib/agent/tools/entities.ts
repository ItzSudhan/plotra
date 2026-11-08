import "server-only";
import { nodeKinds, type NodeKind, type PropertyValue } from "@plotra/db/schema";
import { z } from "zod";
import { requireNodeAccess, requireProjectAccess } from "../../access";
import { listPropertyDefs } from "../../knowledge-actions";
import { ancestors, flatten, liveChildren, type BinderNode } from "../../tree";
import { getWorld, type EntityTypeRow } from "../../world-actions";
import { untrustedSource, wrapUntrusted } from "../untrusted";
import { asOfNote, defineTool, loadHorizon, loadProject, loadReleases, mention, requireLive, type Project, type ToolFactory } from "./context";

// Characters, places, world-bible entries and any other note as a record:
// what kind of thing it is and its typed properties (plan.md 2.4, 2.8).

const MAX_LISTED = 150;

type Field = { key: string; label: string; type: string };

/** A property's value as text; ids of other notes become their titles. */
function showValue(value: PropertyValue, field: Field | undefined, project: Project, revealed: (id: string) => boolean): string {
  if (value === null || value === "") return "";
  const one = (v: string | number | boolean) => {
    if (typeof v === "string" && (field?.type === "node" || project.index.byId.has(v))) {
      const target = project.live(v);
      if (target && !revealed(target.id)) return "(not revealed yet)";
      return target ? `${target.title} (id: ${target.id})` : "(a note that no longer exists)";
    }
    return String(v);
  };
  return Array.isArray(value) ? value.map(one).join(", ") : one(value);
}

function typeLabel(node: BinderNode, types: EntityTypeRow[]): string {
  if (node.kind !== "entity") return node.kind;
  return types.find((t) => t.id === node.entityTypeId)?.name ?? "world entry";
}

export const entityTools: ToolFactory = ({ projectId, boundary }) => ({
  getNote: defineTool({
    access: "read",
    description:
      "A note as a record, without its text: what kind it is (character, location, scene, a custom world-bible type…), its status, canon status, when it is revealed, aliases, tags, synopsis and every typed property (age, role, POV, story date, location…). Use readNote for what the note says.",
    inputSchema: z.object({
      nodeId: z.string().describe("The note's id."),
      asOfReleaseId: z.string().optional().describe("Only show what the audience knows once this release is out (ids from listReleases)."),
    }),
    run: async ({ nodeId, asOfReleaseId }) => {
      await requireNodeAccess(projectId, nodeId);
      const project = await loadProject(projectId);
      const found = requireLive(project, nodeId);
      const asOf = await loadHorizon(projectId, project, asOfReleaseId);
      if (asOf && !asOf.horizon.knows(found.id)) {
        return { text: `${asOfNote(asOf)}"${found.title}" (id: ${found.id}) isn't revealed as of "${asOf.release.title}".`, notes: [mention(found)] };
      }
      const [defs, world, releases] = await Promise.all([listPropertyDefs(projectId), getWorld(projectId), loadReleases(projectId)]);
      const type = found.kind === "entity" ? world.entityTypes.find((t) => t.id === found.entityTypeId) : undefined;
      const fields: Field[] = [...defs.filter((d) => d.nodeKind === found.kind), ...(type?.schema ?? [])];
      const fieldFor = (key: string) => fields.find((f) => f.key === key);
      const source = untrustedSource(found);
      // A clipped page's description and fields came from the page, not from the writer.
      const quoted = (text: string) => (source ? wrapUntrusted(text, source, boundary) : text);

      const where = ancestors(project.index, found.id).map((a) => a.title).join(" / ");
      const reveal = found.revealReleaseId ? releases.find((r) => r.id === found.revealReleaseId) : undefined;
      const children = liveChildren(project.index, found.id).filter((c) => !asOf || asOf.horizon.shows(c.id));
      const properties = Object.entries(found.properties)
        .map(([key, value]) => [fieldFor(key)?.label ?? key, showValue(value, fieldFor(key), project, (id) => !asOf || asOf.horizon.knows(id))] as const)
        .filter(([, value]) => value);

      const lines = [
        `${found.title} (id: ${found.id})`,
        `Kind: ${typeLabel(found, world.entityTypes)}`,
        where && `In: ${where}`,
        `Status: ${found.status}`,
        `Canon: ${found.canon}${found.layer === "belief" ? " (a belief: what people are led to think, not what is true)" : ""}`,
        reveal ? `Revealed in: ${reveal.title}${found.revealChannel ? ` (${found.revealChannel})` : ""}` : null,
        found.aliases.length ? `Also called: ${found.aliases.join(", ")}` : null,
        found.tags.length || found.contentTags.length ? `Tags: ${[...new Set([...found.tags, ...found.contentTags])].map((t) => `#${t}`).join(" ")}` : null,
        found.wordCount ? `Words: ${found.wordCount}` : null,
        children.length ? `Contains: ${children.slice(0, 20).map((c) => c.title).join(", ")}${children.length > 20 ? `, and ${children.length - 20} more` : ""}` : null,
        found.synopsis ? `Synopsis: ${source ? `\n${quoted(found.synopsis)}` : found.synopsis}` : null,
        properties.length ? `Properties:\n${quoted(properties.map(([label, value]) => `- ${label}: ${value}`).join("\n"))}` : "Properties: none filled in.",
      ];
      return { text: asOfNote(asOf) + lines.filter(Boolean).join("\n"), notes: [mention(found)] };
    },
  }),

  listEntities: defineTool({
    access: "read",
    description:
      "Lists the project's notes of one kind: every character, every location, every entry of a custom world-bible type (Faction, Item…), every scene. Each comes with its id and synopsis. Use it to answer \"who are the characters?\" or to find a note's id by name.",
    inputSchema: z.object({
      kind: z.enum(nodeKinds).optional().describe("A built-in kind: character, location, scene, chapter, note, research, entity…"),
      typeName: z.string().optional().describe("The name of a custom world-bible type, such as Faction. Overrides `kind`."),
      asOfReleaseId: z.string().optional().describe("Only list what the audience knows once this release is out (ids from listReleases)."),
    }),
    run: async ({ kind, typeName, asOfReleaseId }) => {
      await requireProjectAccess(projectId);
      const project = await loadProject(projectId);
      const asOf = await loadHorizon(projectId, project, asOfReleaseId);
      const world = await getWorld(projectId);
      const wanted = typeName?.trim().toLowerCase();
      const type = wanted ? world.entityTypes.find((t) => t.name.toLowerCase() === wanted || t.plural.toLowerCase() === wanted) : undefined;
      if (wanted && !type) {
        const names = world.entityTypes.map((t) => t.name).join(", ");
        return { text: `No world-bible type is called "${typeName}".${names ? ` The project's types: ${names}.` : " The project has no custom types."}`, notes: [] };
      }
      if (!type && !kind) {
        const counts = new Map<NodeKind, number>();
        for (const n of flatten(project.index)) counts.set(n.kind, (counts.get(n.kind) ?? 0) + 1);
        const kinds = [...counts].map(([k, n]) => `${k} (${n})`).join(", ");
        const types = world.entityTypes.map((t) => t.name).join(", ");
        return { text: `Pass a kind or a typeName. Kinds in this project: ${kinds || "none yet"}.${types ? ` World-bible types: ${types}.` : ""}`, notes: [] };
      }

      const matches = flatten(project.index).filter(
        (n) => (type ? n.kind === "entity" && n.entityTypeId === type.id : n.kind === kind) && (!asOf || asOf.horizon.knows(n.id)),
      );
      const label = type ? type.plural || type.name : `${kind} notes`;
      if (!matches.length) return { text: `${asOfNote(asOf)}No ${label} in this project${asOf ? " by then" : ""}.`, notes: [] };
      const lines = matches.slice(0, MAX_LISTED).map((n) => {
        const synopsis = (n.synopsis ?? "").replace(/\s+/g, " ").trim().slice(0, 160);
        const source = untrustedSource(n);
        const aliases = n.aliases.length ? ` (also: ${n.aliases.join(", ")})` : "";
        return `- ${n.title}${aliases} (id: ${n.id})${n.canon !== "draft" && n.canon !== "canon" ? ` · canon ${n.canon}` : ""}${synopsis ? `\n  ${source ? wrapUntrusted(synopsis, source, boundary) : synopsis}` : ""}`;
      });
      const more = matches.length > MAX_LISTED ? `\n… and ${matches.length - MAX_LISTED} more. Use searchProject to find a particular one.` : "";
      return {
        text: `${asOfNote(asOf)}${matches.length} ${label}:\n${lines.join("\n")}${more}`,
        // A long list isn't "the notes used": only short ones are linked.
        notes: matches.length <= 12 ? matches.map(mention) : [],
      };
    },
  }),
});
