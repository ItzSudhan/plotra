import "server-only";
import { requireNodeAccess } from "../access";
import { loadDocument } from "../agent/documents";
import { listNodes } from "../binder";
import type { DocNode } from "../doc-index";
import { computeHorizon } from "../horizon";
import { readOnly } from "../request-cache";
import { isDocumentKind } from "../story";
import { indexNodes, isTrashed } from "../tree";
import { ApiError } from "./handler";
import { knownBlocks, listApiReleases } from "./notes";

// The phone's reader (apps/mobile/src/components/rich-editor/note-reader.tsx)
// draws a note the way the web's editor does, so it needs the document itself
// rather than Markdown. Same access check and horizon rule as readApiNote:
// with `asOf`, passages revealed later are left out, and a note the audience
// doesn't know yet comes back empty.

export async function readApiNoteValue(projectId: string, nodeId: string, asOf?: string | null): Promise<{ value: DocNode[] | null; revealed?: boolean }> {
  return readOnly(async () => {
    await requireNodeAccess(projectId, nodeId);
    const nodes = await listNodes(projectId);
    const index = indexNodes(nodes);
    const found = index.byId.get(nodeId);
    if (!found || isTrashed(index, nodeId)) throw new ApiError(404, "Not found.");
    const horizon = asOf ? computeHorizon(nodes, await listApiReleases(projectId), asOf) : null;
    if (asOf && !horizon) throw new ApiError(404, "No such release.");
    const revealed = horizon ? { revealed: horizon.knows(nodeId) } : {};
    if (!isDocumentKind(found.kind)) return { value: null, ...revealed };
    let value = await loadDocument(projectId, nodeId);
    if (horizon) value = horizon.knows(nodeId) ? knownBlocks(value, horizon) : [];
    return { value, ...revealed };
  });
}
