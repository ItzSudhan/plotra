"use client";

import type { NodeKind } from "@plotra/db/schema";
import { useMemo } from "react";
import { kindLabel, kindPlural } from "@/lib/vocabulary";
import { useWorkspace } from "./workspace-provider";

/** What the open project calls the kinds of note: its own words where it has them (lib/vocabulary.ts). */
export function useVocabulary() {
  const { project } = useWorkspace();
  const settings = project.settings;
  return useMemo(() => ({ label: (kind: NodeKind) => kindLabel(kind, settings), plural: (kind: NodeKind) => kindPlural(kind, settings) }), [settings]);
}
