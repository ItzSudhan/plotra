"use server";

import { collect, type PublishOptions } from "./publish/collect";
import { countWikiPages } from "./publish/wiki";
import { readOnly } from "./request-cache";

// What an export would contain, for the Publish view (plan.md 2.8). The files
// themselves come from GET /api/export.

export type PublishSummary = {
  /** Chapters and scenes with text, and their words. */
  manuscript: { documents: number; words: number };
  /** World pages (characters, places, entities): how many there are, and how many these options publish. */
  wiki: { total: number; published: number };
};

export async function getPublishSummary(projectId: string, options: PublishOptions): Promise<PublishSummary> {
  return readOnly(async () => {
    const collected = await collect(projectId, options);
    const manuscript = collected.ordered.filter((n) => (n.kind === "chapter" || n.kind === "scene") && n.wordCount > 0 && collected.includes(n));
    return {
      manuscript: { documents: manuscript.length, words: manuscript.reduce((sum, n) => sum + n.wordCount, 0) },
      wiki: countWikiPages(collected),
    };
  });
}
