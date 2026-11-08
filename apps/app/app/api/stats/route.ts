import { db, schema } from "@plotra/db";
import { eq, sql } from "drizzle-orm";

// GET /api/stats: two numbers for the public stats line on the site (plan.md
// Phase 8 "Usage events"): how many people have an account here, and how many
// of them have written a first scene. No sign-in. Counts only: no names, no
// workspaces, nothing about what anyone wrote.
//
// Cached for an hour at the edge, so the site's readers don't wake a
// scale-to-zero database (the same care as /api/health).

const HOUR = 60 * 60;

export async function GET() {
  try {
    const [[people], [writers]] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(schema.user),
      db.select({ count: sql<number>`count(distinct ${schema.event.userId})::int` }).from(schema.event).where(eq(schema.event.name, "first_scene_written")),
    ]);
    return Response.json(
      { people: people?.count ?? 0, writers: writers?.count ?? 0 },
      { headers: { "cache-control": `public, s-maxage=${HOUR}, stale-while-revalidate=${24 * HOUR}`, "access-control-allow-origin": "*" } },
    );
  } catch (error) {
    console.error("[plotra] stats: couldn't count:", error instanceof Error ? error.message : error);
    return Response.json({ error: "unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
