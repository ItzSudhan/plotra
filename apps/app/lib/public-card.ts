import type { NodeKind } from "@plotra/db/schema";
import { countWords } from "./doc-index";
import { type CardInput, countLabel } from "./og-card";
import { excerpt, plainText, publicFilePath } from "./public-link";
import { loadPublicImage, type PublicLink, type PublicNote } from "./public-read";
import { nodeKindMeta } from "./tree";

// What goes on a read-only link's cards (lib/og-card.tsx), from what the
// reader shows: nothing here is more than the page itself would show.

/** Pictures the card can draw. No WebP or AVIF, which the drawing can't read; nothing huge. */
const drawable = new Set(["image/png", "image/jpeg"]);
const MAX_IMAGE = 4 * 1024 * 1024;

const number = (n: number) => n.toLocaleString("en-US");

/** The first picture in a note that is stored in the project, as a data URL. */
async function firstImage(link: PublicLink, note: PublicNote): Promise<string | null> {
  const prefix = publicFilePath(link.token, "");
  const find = (nodes: PublicNote["value"]): string | null => {
    for (const n of nodes) {
      if (n.type === "img" && typeof n.url === "string" && n.url.startsWith(prefix)) return n.url.slice(prefix.length);
      const inside = find(n.children ?? []);
      if (inside) return inside;
    }
    return null;
  };
  const id = find(note.value);
  if (!id) return null;
  try {
    const file = await loadPublicImage(link, id);
    if (!file || !drawable.has(file.contentType) || file.bytes.length > MAX_IMAGE) return null;
    return `data:${file.contentType};base64,${Buffer.from(file.bytes).toString("base64")}`;
  } catch {
    // A picture that can't be fetched leaves the card without one, not without a card.
    return null;
  }
}

/** Where a note sits: the project's title, then up to two of the folders it's in. */
function trail(link: PublicLink, nodeId: string): string[] {
  const up: string[] = [];
  let at = link.byId.get(nodeId)?.parentId;
  while (at) {
    const row = link.byId.get(at);
    if (!row) break;
    up.unshift(row.title || "Untitled");
    at = row.parentId;
  }
  return [link.title, ...up.slice(-2)];
}

/** A note's description where it has no synopsis: the opening of what's written. */
export const noteDescription = (note: PublicNote) => note.synopsis || excerpt(plainText(note.value), 200) || undefined;

export async function noteCard(link: PublicLink, note: PublicNote): Promise<CardInput> {
  const text = plainText(note.value);
  const words = countWords(text);
  const meta = [
    words > 0 && `${number(words)} ${words === 1 ? "word" : "words"} · ${Math.max(1, Math.round(words / 230))} min read`,
    note.children.length > 0 && `${number(note.children.length)} inside`,
    link.asOf && `As of ${link.asOf.title}`,
  ].filter(Boolean);
  return {
    kind: note.kind,
    kindLabel: note.kindLabel,
    icon: nodeKindMeta[note.kind].icon,
    title: note.title,
    trail: trail(link, note.id),
    synopsis: note.synopsis,
    quote: note.synopsis ? null : excerpt(text) || null,
    tags: note.tags,
    meta: meta.join(" · ") || null,
    image: note.board ? null : await firstImage(link, note),
    action: "Read it",
  };
}

export function projectCard(link: PublicLink): CardInput {
  const tally = new Map<NodeKind, number>();
  for (const row of link.rows) if (row.kind !== "folder") tally.set(row.kind, (tally.get(row.kind) ?? 0) + 1);
  const counts = [...tally]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([kind, n]) => ({ n, label: countLabel(kind, n) }));
  return {
    kind: "project",
    kindLabel: "Project",
    icon: "book-2-linear",
    title: link.title,
    trail: link.asOf ? [`As of ${link.asOf.title}`] : [],
    synopsis: link.description ? excerpt(link.description) : null,
    counts,
    action: "Start reading",
  };
}
