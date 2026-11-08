import type { CommentAnchor } from "@plotra/db/schema";
import type { CommentThreadRow, Person } from "../workflow-actions";

// The phone's view of a note's comment threads (app/api/mobile/comments, and
// apps/mobile/src/lib/comments-api.ts on the other end): authors' names put
// in, dates as text, and which comments are the caller's own. Pure, so it can
// be tested without a database.

export type MobileComment = { id: string; body: string; authorId: string; authorName: string | null; authorImage: string | null; createdAt: string; editedAt: string | null; mine: boolean };

export type MobileThread = { id: string; anchor: CommentAnchor | null; quote: string | null; resolved: boolean; createdAt: string; comments: MobileComment[] };

/**
 * Threads as the phone shows them. One-click reactions (a reader's emoji on a
 * passage) aren't conversations and the phone has nowhere to show them yet, so
 * they're left out, as the web's Comments list leaves them out.
 */
export function toMobileThreads(threads: CommentThreadRow[], people: Person[], me: string): MobileThread[] {
  const byId = new Map(people.map((p) => [p.id, p]));
  return threads
    .filter((t) => !t.reaction)
    .map((t) => ({
      id: t.id,
      anchor: t.anchor,
      quote: t.quote,
      resolved: !!t.resolvedAt,
      createdAt: t.createdAt.toISOString(),
      comments: t.comments.map((c) => {
        const author = c.authorId ? byId.get(c.authorId) : undefined;
        return {
          id: c.id,
          body: c.body,
          // A former member's comments stay, without a name.
          authorId: c.authorId ?? "",
          authorName: author?.name || null,
          authorImage: author?.image ?? null,
          createdAt: c.createdAt.toISOString(),
          editedAt: c.editedAt?.toISOString() ?? null,
          mine: !!c.authorId && c.authorId === me,
        };
      }),
    }));
}

/**
 * A comment's position from a request body: two strings, or null for the whole
 * note; undefined when it's neither, so a bad one isn't quietly taken as the
 * whole note. createCommentThread checks the strings themselves (cleanAnchor).
 */
export function anchorFrom(value: unknown): CommentAnchor | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object") return undefined;
  const { start, end } = value as { start?: unknown; end?: unknown };
  return typeof start === "string" && typeof end === "string" ? { start, end } : undefined;
}
