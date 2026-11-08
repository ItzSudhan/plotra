"use client";

import { Plate, PlateContent } from "platejs/react";
import { createContext, use } from "react";
import { useCollabEditor } from "@/components/collab/use-collab-editor";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { colorFor } from "@/lib/colors";
import { kits } from "./kit-registry";

// Live transclusion: an embed is a read-only view of the other note's Yjs doc,
// so it updates as people edit it.

const EmbedDepth = createContext(0);
const MAX_DEPTH = 2;

export function EmbeddedDocument({ nodeId }: { nodeId: string }) {
  const depth = use(EmbedDepth);
  if (depth >= MAX_DEPTH) return <p className="py-1 text-sm text-muted-foreground">Embedded too deeply to show here.</p>;
  return (
    <EmbedDepth value={depth + 1}>
      <ReadOnlyDocument room={`node-${nodeId}`} />
    </EmbedDepth>
  );
}

/** `projectId` is only needed for a note of another project (a shared world's entry). */
export function ReadOnlyDocument({ room, projectId }: { room: string; projectId?: string }) {
  const { project, user } = useWorkspace();
  const { editor, ready } = useCollabEditor({
    projectId: projectId ?? project.id,
    room,
    plugins: kits.readOnly,
    user: { name: user.name, color: colorFor(user.id) },
    readOnly: true,
    offline: false,
    cursors: false,
  });
  if (!ready) return <div className="my-2 h-4 w-2/3 animate-pulse rounded bg-muted" aria-busy />;
  return (
    <Plate editor={editor} readOnly>
      <PlateContent
        readOnly
        disableDefaultStyles
        className="relative font-prose text-[0.97rem] leading-[1.7] whitespace-pre-wrap break-words outline-none [&_strong]:font-semibold"
      />
    </Plate>
  );
}
