"use client";

import { useMemo } from "react";
import { sharedResource } from "@/components/workflow/data";
import { useStore } from "@/components/workspace/stores";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { computeHorizon, type Horizon } from "@/lib/horizon";
import { read } from "@/lib/read";
import type { SharedWorld, WorldData, WorldLink } from "@/lib/world-actions";

// Client copies of the world data (plan.md 2.8) shared by every world view,
// the binder and the editor: entity types, releases, tagged blocks, knowledge
// and setups. Refetched when anyone announces a change.

/** Announced after any change to entity types, releases, reveals, knowledge or setups. */
export const WORLD_NOTICE = "world";

const useWorldResource = sharedResource<WorldData>();
const useSharedWorldResource = sharedResource<SharedWorld | null>();
const useWorldLinksResource = sharedResource<WorldLink[]>();

export function useWorld() {
  const { project } = useWorkspace();
  return useWorldResource(project.id, () => read("getWorld", project.id), WORLD_NOTICE);
}

/** The shared world bible this project links to, if any. */
export function useSharedWorld() {
  const { project } = useWorkspace();
  const key = project.worldId ? `${project.id}/${project.worldId}` : null;
  return useSharedWorldResource(key, () => read("getSharedWorld", project.id), WORLD_NOTICE).data;
}

/** Links from this project's notes into the shared world: for the graph and an entry's "Mentioned here". */
export function useWorldLinks() {
  const { project } = useWorkspace();
  const key = project.worldId ? `${project.id}/${project.worldId}/links` : null;
  return useWorldLinksResource(key, () => read("getWorldLinks", project.id), WORLD_NOTICE).data;
}

/**
 * The spoiler horizon in force (plan.md 2.8 "World as of release X"), or null
 * when the whole world is shown. Views use it to hide what the audience
 * doesn't know yet at the chosen release.
 */
export function useHorizon(): Horizon | null {
  const { horizon, binder } = useWorkspace();
  const releaseId = useStore(horizon);
  const { nodes } = useStore(binder);
  const releases = useWorld().data?.releases;
  return useMemo(() => (releaseId && releases ? computeHorizon(nodes, releases, releaseId) : null), [nodes, releaseId, releases]);
}
