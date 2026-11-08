// The spoiler horizon ("World as of release X"): which notes and blocks the
// audience knows about once a given release is out. A copy of the web app's
// apps/app/lib/horizon.ts, so the phone decides exactly as the web does. Pure.
//
// When a note is revealed, nearest rule first:
//   1. its own reveal tag (`revealReleaseId`);
//   2. the closest folder above it that is either tagged, or is what a release
//      ships (`release.nodeId`): a scene inside "Book 2" is revealed by Book 2.
// A note with neither is unrevealed: the audience hasn't been told.
//
// A block inside a revealed note is revealed with it, unless the block has its
// own tag: a later release, or "never".

/** A passage tagged "never" is never revealed (apps/app/lib/world.ts). */
export const NEVER = "never";

export type HorizonNode = { id: string; parentId: string | null; revealReleaseId: string | null; deletedAt?: Date | string | null };
export type HorizonRelease = { id: string; position: string; nodeId: string | null };

export type Horizon = {
  /** The release the world is shown "as of". */
  releaseId: string;
  /** Position of each release in shipping order. */
  order: Map<string, number>;
  /** The release that reveals each note; missing = unrevealed. */
  revealedBy: Map<string, string>;
  /** Whether the audience knows this note at the horizon. */
  knows: (nodeId: string) => boolean;
  /** Whether to show the note: it's known, or it holds something that is. */
  shows: (nodeId: string) => boolean;
  /** Whether a block with this reveal tag is known (inside a known note). */
  knowsBlock: (reveal: string | null | undefined) => boolean;
};

export function releaseOrder(releases: HorizonRelease[]): Map<string, number> {
  const sorted = [...releases].sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : a.id < b.id ? -1 : 1));
  return new Map(sorted.map((r, i) => [r.id, i]));
}

/** The release that reveals each note, by the rules above. */
export function revealMap(nodes: HorizonNode[], releases: HorizonRelease[]): Map<string, string> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const shippedBy = new Map<string, string>();
  for (const r of releases) if (r.nodeId && !shippedBy.has(r.nodeId)) shippedBy.set(r.nodeId, r.id);
  const known = new Set(releases.map((r) => r.id));
  const result = new Map<string, string | null>();

  const resolve = (id: string, depth = 0): string | null => {
    if (result.has(id)) return result.get(id)!;
    const n = byId.get(id);
    let found: string | null = null;
    if (n) {
      if (n.revealReleaseId && known.has(n.revealReleaseId)) found = n.revealReleaseId;
      else if (shippedBy.has(id)) found = shippedBy.get(id)!;
      // The depth guard only matters for a corrupt tree with a cycle.
      else if (n.parentId && depth < 200) found = resolve(n.parentId, depth + 1);
    }
    result.set(id, found);
    return found;
  };

  const out = new Map<string, string>();
  for (const n of nodes) {
    const r = resolve(n.id);
    if (r) out.set(n.id, r);
  }
  return out;
}

export function computeHorizon(nodes: HorizonNode[], releases: HorizonRelease[], releaseId: string): Horizon | null {
  const order = releaseOrder(releases);
  const limit = order.get(releaseId);
  if (limit === undefined) return null;
  const revealedBy = revealMap(nodes, releases);
  const within = (id: string | undefined) => id !== undefined && (order.get(id) ?? Infinity) <= limit;
  const knows = (nodeId: string) => within(revealedBy.get(nodeId));

  // A folder is shown when anything inside it is known.
  const shown = new Set<string>();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const n of nodes) {
    if (!knows(n.id)) continue;
    for (let cursor: HorizonNode | undefined = n, depth = 0; cursor && depth < 200 && !shown.has(cursor.id); depth++) {
      shown.add(cursor.id);
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
  }

  return {
    releaseId,
    order,
    revealedBy,
    knows,
    shows: (nodeId) => shown.has(nodeId),
    knowsBlock: (reveal) => !reveal || (reveal !== NEVER && within(reveal)),
  };
}

/** Where things stand at a horizon, for labels like "Revealed in Book 3". */
export function revealState(horizon: Horizon | null, nodeId: string): "known" | "later" | "unrevealed" | "all" {
  if (!horizon) return "all";
  if (horizon.knows(nodeId)) return "known";
  return horizon.revealedBy.has(nodeId) ? "later" : "unrevealed";
}
