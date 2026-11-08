import { generateKeyBetween } from "fractional-indexing";
import { indent, moveDown, moveUp, outdent, type Place } from "@/components/workspace/binder-moves";
import { isDescendant, isTrashed, type NodeIndex } from "@/lib/tree";

// Where the API moves a note, worked out with the web binder's own rules
// (components/workspace/binder-moves.ts and its drag and drop), so a phone
// never has to know about position keys. Pure, for the tests.

export type MoveTo =
  /** One place up or down among its siblings, into the note above it, or out of its folder. */
  | { step: "up" | "down" | "in" | "out" }
  /** Into a folder (null: the top level), at the end; or just before or after a note there. */
  | { parentId?: string | null; before?: string; after?: string };

export type PlaceResult = { place: Place } | { error: string };

/** A key between two neighbours, or null when they share one (no key fits between). */
const between = (a: string | null, b: string | null) => {
  try {
    return generateKeyBetween(a, b);
  } catch {
    return null;
  }
};

export function placeFor(index: NodeIndex, id: string, to: MoveTo): PlaceResult {
  const node = index.byId.get(id);
  if (!node || isTrashed(index, id)) return { error: "Not found." };

  if ("step" in to) {
    const place =
      to.step === "up" ? moveUp(index, id) : to.step === "down" ? moveDown(index, id) : to.step === "in" ? indent(index, id) : to.step === "out" ? outdent(index, id) : undefined;
    if (place === undefined) return { error: 'step must be "up", "down", "in" or "out".' };
    if (!place) return { error: to.step === "up" ? "It's already at the top." : to.step === "down" ? "It's already at the bottom." : to.step === "in" ? "There's nothing above it to go into." : "It's already at the top level." };
    return { place };
  }

  const beside = to.before ?? to.after;
  if (beside !== undefined) {
    if (to.before !== undefined && to.after !== undefined) return { error: "Give before or after, not both." };
    if (beside === id) return { error: "Pick another note to put it next to." };
    const target = index.byId.get(beside);
    if (!target || isTrashed(index, beside)) return { error: "That note isn't in the binder any more." };
    if (isDescendant(index, beside, id)) return { error: "Can't move a folder inside itself." };
    if (to.parentId !== undefined && to.parentId !== target.parentId) return { error: "That note isn't in that folder." };
    // As the web's drop does: between the target and its neighbour, leaving the moving note out.
    const siblings = (index.children.get(target.parentId) ?? []).filter((s) => s.id !== id);
    const at = siblings.findIndex((s) => s.id === beside);
    const [prev, next] = to.before !== undefined ? [siblings[at - 1], siblings[at]] : [siblings[at], siblings[at + 1]];
    const position = between(prev?.position ?? null, next?.position ?? null);
    if (!position) return { error: "Couldn't fit it there. Try moving it next to another note." };
    return { place: { parentId: target.parentId, position } };
  }

  const parentId = to.parentId ?? null;
  if (parentId !== null) {
    if (parentId === id || isDescendant(index, parentId, id)) return { error: "Can't move a folder inside itself." };
    if (!index.byId.has(parentId) || isTrashed(index, parentId)) return { error: "That folder isn't in the binder any more." };
  }
  // At the end, after every child (trashed ones keep their keys).
  const last = (index.children.get(parentId) ?? []).filter((s) => s.id !== id).at(-1);
  const position = between(last?.position ?? null, null);
  if (!position) return { error: "Couldn't fit it there." };
  return { place: { parentId, position } };
}
