// Where things go on the phone's maps. Pure, so the tests and the drawing (map-canvas.tsx,
// which runs in a web view) share it. The web lays the graph out with graphology's
// ForceAtlas2, which the phone doesn't have: this is a small force layout of its own
// that settles the same way (linked notes pull together, everything else pushes apart).

export type Point = { x: number; y: number };

/** A cheap seeded random, so the same notes lay out the same way every time. */
function seeded(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/**
 * A force layout (Fruchterman–Reingold, with a grid so it stays quick for a few
 * thousand notes). Returns centres. `fixed` keeps a note where it is (the
 * centre of "around this note").
 */
export function forceLayout(ids: string[], links: { from: string; to: string }[], options: { spacing?: number; iterations?: number; fixed?: string | null } = {}): Map<string, Point> {
  const k = options.spacing ?? 70;
  const n = ids.length;
  const out = new Map<string, Point>();
  if (!n) return out;
  const index = new Map(ids.map((id, i) => [id, i]));
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  // Start on a sunflower spiral: even, and never two in one spot.
  const jitter = seeded(ids.join("|").slice(0, 2000));
  for (let i = 0; i < n; i++) {
    const r = k * 0.6 * Math.sqrt(i + 0.5);
    const a = i * 2.399963 + jitter() * 0.3;
    xs[i] = Math.cos(a) * r;
    ys[i] = Math.sin(a) * r;
  }
  const fixed = options.fixed ? index.get(options.fixed) : undefined;
  if (fixed !== undefined) xs[fixed] = ys[fixed] = 0;
  const pairs: [number, number][] = [];
  for (const l of links) {
    const a = index.get(l.from);
    const b = index.get(l.to);
    if (a !== undefined && b !== undefined && a !== b) pairs.push([a, b]);
  }
  const iterations = options.iterations ?? (n > 1500 ? 120 : n > 400 ? 200 : 300);
  const dx = new Float64Array(n);
  const dy = new Float64Array(n);
  const cell = k * 3;
  let temperature = k * Math.sqrt(n) * 0.5;
  const cooling = temperature / (iterations + 1);
  for (let step = 0; step < iterations; step++) {
    dx.fill(0);
    dy.fill(0);
    // Push apart: only neighbours within a few cells, which is where it matters.
    const grid = new Map<string, number[]>();
    for (let i = 0; i < n; i++) {
      const key = `${Math.floor(xs[i] / cell)},${Math.floor(ys[i] / cell)}`;
      const bucket = grid.get(key);
      if (bucket) bucket.push(i);
      else grid.set(key, [i]);
    }
    for (let i = 0; i < n; i++) {
      const cx = Math.floor(xs[i] / cell);
      const cy = Math.floor(ys[i] / cell);
      for (let gx = cx - 1; gx <= cx + 1; gx++)
        for (let gy = cy - 1; gy <= cy + 1; gy++) {
          for (const j of grid.get(`${gx},${gy}`) ?? []) {
            if (j <= i) continue;
            let ddx = xs[i] - xs[j];
            let ddy = ys[i] - ys[j];
            let d2 = ddx * ddx + ddy * ddy;
            if (d2 < 0.01) {
              ddx = jitter() - 0.5;
              ddy = jitter() - 0.5;
              d2 = 0.25;
            }
            const d = Math.sqrt(d2);
            const f = (k * k) / d;
            dx[i] += (ddx / d) * f;
            dy[i] += (ddy / d) * f;
            dx[j] -= (ddx / d) * f;
            dy[j] -= (ddy / d) * f;
          }
        }
    }
    // Pull together along links.
    for (const [a, b] of pairs) {
      const ddx = xs[a] - xs[b];
      const ddy = ys[a] - ys[b];
      const d = Math.sqrt(ddx * ddx + ddy * ddy) || 0.1;
      const f = (d * d) / k;
      dx[a] -= (ddx / d) * f;
      dy[a] -= (ddy / d) * f;
      dx[b] += (ddx / d) * f;
      dy[b] += (ddy / d) * f;
    }
    // A little gravity, so notes with no links stay near the rest.
    for (let i = 0; i < n; i++) {
      dx[i] -= xs[i] * 0.02 * (k / 10);
      dy[i] -= ys[i] * 0.02 * (k / 10);
    }
    for (let i = 0; i < n; i++) {
      if (i === fixed) continue;
      const d = Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i]);
      if (!d) continue;
      const move = Math.min(d, temperature);
      xs[i] += (dx[i] / d) * move;
      ys[i] += (dy[i] / d) * move;
    }
    temperature = Math.max(k * 0.05, temperature - cooling);
  }
  for (let i = 0; i < n; i++) out.set(ids[i], { x: Math.round(xs[i]), y: Math.round(ys[i]) });
  return out;
}

/** Around a circle, in the order given (the relationship map's starting place, as on the web). Centres. */
export function circleLayout(ids: string[], spacing = 34): Map<string, Point> {
  const radius = Math.max(160, ids.length * spacing);
  return new Map(ids.map((id, i) => {
    const angle = (i / Math.max(ids.length, 1)) * Math.PI * 2 - Math.PI / 2;
    return [id, { x: Math.round(Math.cos(angle) * radius), y: Math.round(Math.sin(angle) * radius) }];
  }));
}

/** Notes within `depth` links of `center`, the centre included ("around this note"). */
export function neighbourhood(center: string, links: { from: string; to: string }[], depth: number): Set<string> {
  const adjacent = new Map<string, Set<string>>();
  const connect = (a: string, b: string) => {
    if (!adjacent.has(a)) adjacent.set(a, new Set());
    adjacent.get(a)!.add(b);
  };
  for (const l of links) {
    connect(l.from, l.to);
    connect(l.to, l.from);
  }
  const keep = new Set([center]);
  let frontier = [center];
  for (let hop = 0; hop < depth && frontier.length; hop++) {
    const next: string[] = [];
    for (const id of frontier)
      for (const other of adjacent.get(id) ?? []) {
        if (keep.has(other)) continue;
        keep.add(other);
        next.push(other);
      }
    frontier = next;
  }
  return keep;
}

// ---- The family tree: a copy of the web's apps/app/lib/family-tree.ts, so the phone draws the same tree.

export type FamilyLink = { from: string; to: string; type: string };
export type FamilyTree = { positions: Map<string, Point>; generation: Map<string, number>; left: string[] };

export const PARENT = "parent";
export const SPOUSE = "spouse";
export const SIBLING = "sibling";
export const FAMILY_CARD = 190;
const GAP = 36;
const ROW = 150;

/** Lays out the tree: top-left of each person's card. `people` in binder order; `links` every relationship between them. */
export function familyTree(people: { id: string; title: string }[], links: FamilyLink[]): FamilyTree {
  const CARD = FAMILY_CARD;
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

  const order = new Map(people.map((p, i) => [p.id, i]));
  const byTitle = (a: string, b: string) => (title.get(a) ?? "").localeCompare(title.get(b) ?? "", "en", { numeric: true }) || order.get(a)! - order.get(b)!;
  const rows = new Map<number, string[]>();
  for (const id of inTree) rows.set(generation.get(id)!, [...(rows.get(generation.get(id)!) ?? []), id]);

  const positions = new Map<string, Point>();
  const centre = (id: string) => (positions.get(id)?.x ?? 0) + CARD / 2;
  for (const gen of [...rows.keys()].sort((a, b) => a - b)) {
    const row = rows.get(gen)!;
    const placed = new Set<string>();
    const units: string[][] = [];
    for (const id of [...row].sort(byTitle)) {
      if (placed.has(id)) continue;
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
    const anchor = (unit: string[]) => {
      const above = unit.flatMap((id) => [...(parents.get(id) ?? [])]).filter((p) => positions.has(p));
      if (above.length) return above.reduce((sum, p) => sum + centre(p), 0) / above.length;
      const kin = unit.flatMap((id) => [...(siblings.get(id) ?? [])]).find((s) => positions.has(s));
      return kin ? centre(kin) + 1 : Number.POSITIVE_INFINITY;
    };
    const anchored = units.map((unit, i) => ({ unit, at: anchor(unit), i }));
    anchored.sort((a, b) => (a.at === b.at ? a.i - b.i : a.at - b.at));
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
      const start = Number.isFinite(wanted) ? Math.max(x, wanted - width(unit) / 2) : x;
      unit.forEach((id, i) => positions.set(id, { x: start + i * (CARD + GAP), y: gen * ROW }));
      x = start + width(unit) + GAP * 2;
    }
  }

  const minX = Math.min(0, ...[...positions.values()].map((p) => p.x));
  for (const [id, p] of positions) positions.set(id, { x: p.x - minX, y: p.y });
  return { positions, generation, left };
}
