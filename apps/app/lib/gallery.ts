import "server-only";
import { db, schema } from "@plotra/db";
import type { ProjectType } from "@plotra/db/schema";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

// The public gallery (beat-the-competitors.md, 12): read-only links their
// owners chose to list (`share_link.listed`), for anyone to browse. Read with
// the server's own connection, like the public reader: every link here was
// made public by someone who manages its project.

const { shareLink, project, release } = schema;

export type GalleryEntry = { token: string; title: string; description: string | null; type: ProjectType; name: string | null; asOf: string | null; updatedAt: Date };

/** The listed links that open, newest projects first. A project with a link taken down has none here. */
export async function listGallery(limit = 120): Promise<GalleryEntry[]> {
  return db
    .select({
      token: shareLink.token,
      title: project.title,
      description: project.description,
      type: project.type,
      name: shareLink.name,
      asOf: release.title,
      updatedAt: project.updatedAt,
    })
    .from(shareLink)
    .innerJoin(project, eq(project.id, shareLink.projectId))
    .leftJoin(release, eq(release.id, shareLink.horizonReleaseId))
    .where(
      and(
        eq(shareLink.enabled, true),
        eq(shareLink.listed, true),
        isNull(shareLink.blockedAt),
        sql`not exists (select 1 from share_link taken where taken.project_id = ${shareLink.projectId} and taken.blocked_at is not null)`,
      ),
    )
    .orderBy(desc(project.updatedAt))
    .limit(limit);
}
