"use client";

import { createContext, use } from "react";

/** The document an editor belongs to, for elements that need it (block tags, citations, the slash menu). */
export const CurrentDocument = createContext<{ nodeId: string } | null>(null);

export function useCurrentDocument() {
  return use(CurrentDocument);
}
