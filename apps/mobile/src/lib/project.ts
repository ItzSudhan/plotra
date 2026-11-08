import { useMemo } from "react";
import { keys, useResource } from "./cache";
import { useClient } from "./session";

/** A project (from the list every screen shares) and its notes. */
export function useProject(projectId: string) {
  const client = useClient();
  const projects = useResource(keys.projects, client.projects);
  const notes = useResource(keys.notes(projectId), () => client.notes(projectId));
  const project = useMemo(() => projects.data?.find((p) => p.id === projectId) ?? null, [projects.data, projectId]);
  return { project, notes };
}
