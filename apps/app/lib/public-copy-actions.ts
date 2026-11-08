"use server";

import { db, schema } from "@plotra/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { track } from "./analytics";
import { requireSession } from "./data";
import { buildPublicCopyFile, importPlotraFile } from "./io/plotra-file";
import { cloudOnly } from "./local-mode";
import { isShareToken } from "./public-link";
import { rateLimit } from "./rate-limit";
import { transaction } from "./request-cache";

// "Copy this project" (gtm-plan.md, Growth built into the product): a reader
// of a public link copies the project into a workspace of their own, as a
// template. Only when the project's managers have said readers may
// (`share_link.allow_copy`, the Share dialog). What a copy carries is in
// lib/io/plotra-file.ts, `buildPublicCopyFile`: the notes and story tools,
// not comments, history or the trash. The copy is the reader's own: nothing
// ties it to the original afterwards.

const { shareLink } = schema;

const GONE = "This link doesn't work any more.";

/**
 * Copies the project behind a public link into one of the signed-in person's
 * workspaces, as a new project, and returns where to open it. Counted against
 * that workspace's project and storage limits, as any import is.
 */
export async function copyPublicProject(token: string, workspaceSlug: string): Promise<{ href: string }> {
  cloudOnly("Copying a public project");
  const created = await transaction(async () => {
    const { user } = await requireSession();
    if (typeof token !== "string" || !isShareToken(token)) throw new Error(GONE);
    if (typeof workspaceSlug !== "string" || !workspaceSlug) throw new Error("Choose a workspace to copy it into.");
    await rateLimit("public-copy", user.id, { limit: 10, windowSeconds: 3600 });

    // The same test as the public reader's: an unknown token, a link switched off and one taken down are one answer.
    const [link] = await db
      .select({ projectId: shareLink.projectId, allowCopy: shareLink.allowCopy, horizonReleaseId: shareLink.horizonReleaseId, canonOnly: shareLink.canonOnly })
      .from(shareLink)
      .where(
        and(
          eq(shareLink.token, token),
          eq(shareLink.enabled, true),
          isNull(shareLink.blockedAt),
          sql`not exists (select 1 from share_link taken where taken.project_id = ${shareLink.projectId} and taken.blocked_at is not null)`,
        ),
      )
      .limit(1);
    if (!link) throw new Error(GONE);
    // A copy holds the whole project: never from a link that shows only part of it (lib/share-actions.ts keeps the switch off there too).
    if (!link.allowCopy || link.horizonReleaseId || link.canonOnly) throw new Error("Whoever shared this project hasn't let readers copy it.");

    const file = await buildPublicCopyFile(link.projectId);
    const imported = await importPlotraFile(workspaceSlug, file.data);
    return { ...imported, userId: user.id };
  });

  // After the transaction has committed, so a failed copy is never counted.
  await track("project_created", { userId: created.userId, workspaceId: created.workspaceId, projectId: created.projectId, properties: { from: "public-copy" } });
  return { href: created.href };
}
