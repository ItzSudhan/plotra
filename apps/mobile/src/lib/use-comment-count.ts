import { useResource } from "./cache";
import { commentKeys, openCommentCounts } from "./comments-api";
import { useClient } from "./session";

/** How many comment threads are open on a note (from one call for the whole project, kept like everything else), or 0. */
export function useOpenCommentCount(projectId: string, noteId: string): number {
  const client = useClient();
  const counts = useResource(commentKeys.counts(projectId), () => openCommentCounts(client, projectId));
  return counts.data?.[noteId] ?? 0;
}
