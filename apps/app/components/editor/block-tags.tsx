"use client";

import { Tooltip } from "@plotra/ui/components/tooltip";
import { Icon } from "@plotra/icons";
import { cn } from "@plotra/ui/lib/utils";
import { createPlatePlugin, type PlateElementProps, type RenderNodeWrapper } from "platejs/react";
import { useHorizon, useWorld } from "@/components/world/data";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { blockTags, type BlockTags, type DocNode } from "@/lib/doc-index";
import { canonMeta, claimMeta, NEVER } from "@/lib/world";
import { useCurrentDocument } from "./current-document";

// Block tags (plan.md 2.8): any block can carry its own canon status, say when
// and where it's revealed, and be a fact-check claim. The tags are properties
// of the block's element, set from the tag dialog (⌘⌥T); this draws them, and
// hides blocks the audience doesn't know yet under a spoiler horizon.

const BlockTagWrapper: RenderNodeWrapper = ({ element }) => {
  const tags = blockTags(element as DocNode);
  if (!tags) return;
  return function TaggedBlock(props: PlateElementProps) {
    return <Tagged {...props} tags={tags} />;
  };
};

function Tagged({ children, element, tags }: PlateElementProps & { tags: BlockTags }) {
  const { setUi } = useWorkspace();
  const doc = useCurrentDocument();
  const world = useWorld().data;
  const horizon = useHorizon();
  const release = tags.reveal && tags.reveal !== NEVER ? world?.releases.find((r) => r.id === tags.reveal) : undefined;
  const concealed = horizon ? !horizon.knowsBlock(tags.reveal) : false;

  const chips: Array<{ key: string; label: string; color?: string; icon?: "eye-closed-linear" | "rocket-linear" | "verified-check-linear" | "incognito-linear" }> = [];
  if (tags.canon) chips.push({ key: "canon", label: canonMeta[tags.canon].label, color: canonMeta[tags.canon].color });
  if (tags.reveal === NEVER) chips.push({ key: "reveal", label: "Never revealed", icon: "eye-closed-linear" });
  else if (tags.reveal) chips.push({ key: "reveal", label: `${release?.title ?? "A removed release"}${tags.channel ? ` · ${tags.channel}` : ""}`, icon: "rocket-linear" });
  if (tags.layer === "belief") chips.push({ key: "layer", label: "Belief", icon: "incognito-linear" });
  if (tags.claim) chips.push({ key: "claim", label: claimMeta[tags.claim].label, color: claimMeta[tags.claim].color, icon: "verified-check-linear" });

  const accent = tags.claim ? claimMeta[tags.claim].color : tags.canon ? canonMeta[tags.canon].color : "var(--faint)";
  const id = typeof element.id === "string" ? element.id : null;
  const canOpen = Boolean(doc && id);

  return (
    <div className="relative my-0.5 rounded-r-sm border-l-2 pl-3" style={{ borderColor: accent }} data-block-tags>
      <div contentEditable={false} className="float-right ml-3 flex max-w-[55%] flex-wrap justify-end gap-1 pt-1 font-sans select-none">
        {chips.map((chip) => (
          <Tooltip key={chip.key} content="Edit this block's tags" disabled={!canOpen}>
          <button
            type="button"
            disabled={!canOpen}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => doc && id && setUi({ tagging: { nodeId: doc.nodeId, blockIds: [id] } })}
            className="flex h-[18px] items-center gap-1 rounded bg-muted px-1.5 text-meta font-medium tracking-wide text-muted-foreground outline-none enabled:hover:bg-accent enabled:hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
            style={chip.color ? { color: chip.color } : undefined}
          >
            {chip.icon && <Icon name={chip.icon} className="size-3" />}
            {chip.label}
          </button>
          </Tooltip>
        ))}
      </div>
      {/* Under a spoiler horizon the block is still editable underneath; it's only veiled. */}
      <div className={cn(concealed && "opacity-40 blur-[3px] transition hover:opacity-100 hover:blur-none focus-within:opacity-100 focus-within:blur-none")}>{children}</div>
    </div>
  );
}

export const BlockTagsPlugin = createPlatePlugin({
  key: "blockTags",
  render: { aboveNodes: BlockTagWrapper },
});
