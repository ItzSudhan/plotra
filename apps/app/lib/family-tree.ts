// The family tree layout of the relationship map (beat-the-competitors.md,
// item 6): characters in generations, read from their relationships. "Parent
// of" puts a child a generation below its parents; "Married to" puts two
// people side by side in one generation; siblings without parents in the
// tree stand next to each other. Everyone else is left out of the tree. Pure,
// so the view and the tests share it.

export type FamilyLink = { from: string; to: string; type: string };

export type FamilyTree = {
  /** Where each person in the tree goes, top-left of their card. */
  positions: Map<string, { x: number; y: number }>;
  /** Generation of each person, 0 at the top. */
  generation: Map<string, number>;
  /** People with no family ties: not placed. */
  left: string[];
};

export const PARENT = "parent";
export const SPOUSE = "spouse";
export const SIBLING = "sibling";

const CARD = 190;
const GAP = 36;
const ROW = 150;

/**
 * Lays out the tree. `people` are the characters in binder order (their
 * titles break ties); `links` every relationship between them.
 */
export function familyTree(people: Array<{ id: string; title: string }>, links: FamilyLink[]): FamilyTree {
  const ids = new Set(people.map((p) => p.id));
  const title = new Map(people.map((p) => [p.id, p.title]));
  const parents = new Map<string, Set<string>>();
  const children = new Map<string, Set<string>>();
  const spouses = new Map<string, Set<string>>();
  const siblings = new Map<string, Set<string>>();
  const add = (map: Map<string, Set<string>>, a: string, b: string) => {
    if (!map.has(a)) map.set(a, new Set());
    map.get(a)!.add(b);
  };
  for (const link of links) {
    if (!ids.has(link.from) || !ids.has(link.to) || link.from === link.to) continue;
    if (link.type === PARENT) {
      add(parents, link.to, link.from);
      add(children, link.from, link.to);
    } else if (link.type === SPOUSE) {
      add(spouses, link.from, link.to);
      add(spouses, link.to, link.from);
    } else if (link.type === SIBLING) {
      add(siblings, link.from, link.to);
      add(siblings, link.to, link.from);
    }
  }
  const inTree = people.filter((p) => parents.has(p.id) || children.has(p.id) || spouses.has(p.id) || siblings.has(p.id)).map((p) => p.id);
  const left = people.filter((p) => !inTree.includes(p.id)).map((p) => p.id);

  // Generations: below every parent, level with a spouse and with a sibling. Bounded, so a loop of
  // "parent of" (which only a mistake makes) can't spin: the last pass's answer stands.
  const generation = new Map<string, number>(inTree.map((id) => [id, 0]));
  for (let pass = 0; pass < inTree.length * 2 + 2; pass++) {
    let moved = false;
    for (const id of inTree) {
      let gen = generation.get(id)!;
      for (const parent of parents.get(id) ?? []) gen = Math.max(gen, generation.get(parent)! + 1);
      for (const other of [...(spouses.get(id) ?? []), ...(siblings.get(id) ?? [])]) gen = Math.max(gen, generation.get(other)!);
      if (gen !== generation.get(id) && gen < inTree.length + 1) {
        generation.set(id, gen);
        moved = true;
      }
    }
    if (!moved) break;
  }

  // Each generation is a row of units: a person with their spouses, side by side.
  const order = new Map(people.map((p, i) => [p.id, i]));
  const byTitle = (a: string, b: string) => (title.get(a) ?? "").localeCompare(title.get(b) ?? "", "en", { numeric: true }) || order.get(a)! - order.get(b)!;
  const rows = new Map<number, string[]>();
  for (const id of inTree) rows.set(generation.get(id)!, [...(rows.get(generation.get(id)!) ?? []), id]);

  const positions = new Map<string, { x: number; y: number }>();
  const centre = (id: string) => (positions.get(id)?.x ?? 0) + CARD / 2;
  for (const gen of [...rows.keys()].sort((a, b) => a - b)) {
    const row = rows.get(gen)!;
    const placed = new Set<string>();
    const units: string[][] = [];
    for (const id of [...row].sort(byTitle)) {
      if (placed.has(id)) continue;
      // A person and everyone married to them (and to those), in one unit.
      const unit: string[] = [];
      const queue = [id];
      while (queue.length) {
        const next = queue.shift()!;
        if (placed.has(next) || generation.get(next) !== gen) continue;
        placed.add(next);
        unit.push(next);
        for (const spouse of spouses.get(next) ?? []) queue.push(spouse);
      }
      units.push(unit);
    }
    // Under their parents: a unit sits by the average of its members' parents; siblings without parents beside each other.
    const anchor = (unit: string[]) => {
      const above = unit.flatMap((id) => [...(parents.get(id) ?? [])]).filter((p) => positions.has(p));
      if (above.length) return above.reduce((sum, p) => sum + centre(p), 0) / above.length;
      const kin = unit.flatMap((id) => [...(siblings.get(id) ?? [])]).find((s) => positions.has(s));
      return kin ? centre(kin) + 1 : Number.POSITIVE_INFINITY;
    };
    const anchored = units.map((unit, i) => ({ unit, at: anchor(unit), i }));
    anchored.sort((a, b) => (a.at === b.at ? a.i - b.i : a.at - b.at));
    // Siblings with no parents in the tree go next to one another.
    const sorted: string[][] = [];
    for (const { unit } of anchored) {
      const kinAt = sorted.findIndex((u) => u.some((id) => unit.some((m) => siblings.get(m)?.has(id))));
      if (kinAt >= 0 && unit.every((id) => !parents.has(id))) sorted.splice(kinAt + 1, 0, unit);
      else sorted.push(unit);
    }
    let x = 0;
    const width = (unit: string[]) => unit.length * CARD + (unit.length - 1) * GAP;
    for (const unit of sorted) {
      const wanted = anchor(unit);
      // As close under its parents as the row allows, never on top of the unit before.
      const start = Number.isFinite(wanted) ? Math.max(x, wanted - width(unit) / 2) : x;
      unit.forEach((id, i) => positions.set(id, { x: start + i * (CARD + GAP), y: gen * ROW }));
      x = start + width(unit) + GAP * 2;
    }
  }

  // The whole tree starts at the left edge.
  const minX = Math.min(0, ...[...positions.values()].map((p) => p.x));
  for (const [id, p] of positions) positions.set(id, { x: p.x - minX, y: p.y });
  return { positions, generation, left };
}
