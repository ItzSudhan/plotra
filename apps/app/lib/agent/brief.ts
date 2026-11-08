import "server-only";
import { listNodes } from "../binder";
import { isDocumentKind } from "../story";
import { indexNodes, liveChildren } from "../tree";
import { BRIEF_TITLE } from "./brief-template";
import { documentLines, loadDocument } from "./documents";
import { untrustedSource, type UntrustedSource } from "./untrusted";

// The story brief (plan.md 2.11 "What it knows"): a note at the top of the
// binder, called "Story brief", holding what the writer wants every run to
// know. Its template is in ./brief-template.ts; a note with that title made by
// hand works just as well.

export { BRIEF_TITLE };
const MAX_BRIEF = 6000;

export type Brief = { nodeId: string; text: string; untrusted: UntrustedSource | null };

/** The project's story brief, as the current user sees it. Null when there is none. */
export async function loadBrief(projectId: string): Promise<Brief | null> {
  const index = indexNodes(await listNodes(projectId));
  const note = liveChildren(index, null).find((n) => isDocumentKind(n.kind) && n.title.trim().toLowerCase() === BRIEF_TITLE.toLowerCase());
  if (!note) return null;
  const lines = documentLines(await loadDocument(projectId, note.id), (id) => index.byId.get(id)?.title ?? "another note").map((line) => line.text);
  const text = lines.join("\n").slice(0, MAX_BRIEF);
  return text.trim() ? { nodeId: note.id, text, untrusted: untrustedSource(note) } : null;
}
