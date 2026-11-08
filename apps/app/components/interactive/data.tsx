"use client";

import { sharedResource } from "@/components/workflow/data";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import type { StringRow } from "@/lib/interactive-actions";
import { read } from "@/lib/read";

// Client copy of the project's short-text fields (plan.md 2.8), shared by
// every view that shows them and refetched when anyone announces a change.

/** Announced after any change to the short-text fields. */
export const STRINGS_NOTICE = "strings";

const useStringsResource = sharedResource<StringRow[]>();

export function useStrings() {
  const { project } = useWorkspace();
  return useStringsResource(project.id, () => read("listStrings", project.id), STRINGS_NOTICE);
}
