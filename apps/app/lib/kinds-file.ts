import type { EntityField } from "@plotra/db/schema";
import { pluralOf } from "@/lib/plural";

// World-bible kinds as a file (beat-the-competitors.md, part 2, item 9): a
// project's own kinds (a Faction with its fields, a Spell, a Ship) saved to
// share or keep, and loaded into another project. Only their definitions:
// none of the entries written with them. Pure.

export const KINDS_FORMAT = "plotra-kinds";
export const KINDS_VERSION = 1;

export type KindDefinition = { name: string; plural: string; icon: string; color: string; schema: EntityField[] };

/** The file's contents. */
export function kindsFile(kinds: KindDefinition[]): string {
  return `${JSON.stringify({ format: KINDS_FORMAT, version: KINDS_VERSION, kinds: kinds.map(({ name, plural, icon, color, schema }) => ({ name, plural, icon, color, schema })) }, null, 2)}\n`;
}

/** The kinds a file holds; throws a message for the person when it isn't one. The server checks each again as it's made. */
export function readKindsFile(text: string): KindDefinition[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That isn't a Plotra kinds file.");
  }
  const raw = data as { format?: unknown; version?: unknown; kinds?: unknown };
  if (raw?.format !== KINDS_FORMAT || !Array.isArray(raw.kinds)) throw new Error("That isn't a Plotra kinds file.");
  if (typeof raw.version === "number" && raw.version > KINDS_VERSION) throw new Error("That file was made by a newer Plotra.");
  return raw.kinds.slice(0, 60).flatMap((item): KindDefinition[] => {
    const k = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    if (typeof k.name !== "string" || !k.name.trim()) return [];
    return [
      {
        name: k.name.trim().slice(0, 80),
        plural: typeof k.plural === "string" && k.plural.trim() ? k.plural.trim().slice(0, 80) : pluralOf(k.name.trim()),
        icon: typeof k.icon === "string" ? k.icon : "box-linear",
        color: typeof k.color === "string" ? k.color : "#868e96",
        schema: Array.isArray(k.schema) ? (k.schema as EntityField[]) : [],
      },
    ];
  });
}
