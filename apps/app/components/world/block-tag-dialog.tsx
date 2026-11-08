"use client";

import { canonStatuses, claimStatuses, type CanonStatus, type ClaimStatus } from "@plotra/db/schema";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@plotra/ui/components/dialog";
import { useState } from "react";
import { Field, fieldClass } from "@/components/views/view-ui";
import { useStore } from "@/components/workspace/stores";
import { useUi, useWorkspace, type BlockTagPatch } from "@/components/workspace/workspace-provider";
import type { BlockTags } from "@/lib/doc-index";
import { flatten } from "@/lib/tree";
import { canonMeta, claimMeta, layerMeta, NEVER } from "@/lib/world";
import { useWorld, WORLD_NOTICE } from "./data";
import { SelectField } from "@plotra/ui/components/select-field";

const INHERIT = "";

/**
 * Tags for the selected blocks of a note (plan.md 2.8): canon status, when and
 * where they're revealed, which knowledge layer they belong to, and a
 * fact-check claim. Empty fields follow the note.
 */
export function BlockTagDialog() {
  const { tagging } = useUi();
  if (!tagging) return null;
  return <TagForm key={`${tagging.nodeId}:${tagging.blockIds.join(",")}`} nodeId={tagging.nodeId} blockIds={tagging.blockIds} />;
}

function TagForm({ nodeId, blockIds }: { nodeId: string; blockIds: string[] }) {
  const { editors, setUi, modules, binder, notify } = useWorkspace();
  const world = useWorld().data;
  const { index } = useStore(binder);
  const handle = editors.current.get(nodeId);
  const [tags, setTags] = useState<BlockTags>(() => handle?.getBlockTags?.(blockIds[0]) ?? {});
  const sources = flatten(index).filter((n) => n.kind === "research");
  const close = () => setUi({ tagging: null });

  const set = <K extends keyof BlockTags>(key: K, value: BlockTags[K] | undefined) =>
    setTags((prev) => {
      const next = { ...prev };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });

  const apply = (next: BlockTags) => {
    const patch: BlockTagPatch = {
      canon: next.canon ?? null,
      reveal: next.reveal ?? null,
      // A channel or layer only means something on a block with its own reveal.
      channel: next.reveal && next.reveal !== NEVER ? (next.channel ?? null) : null,
      layer: next.layer === "belief" ? "belief" : null,
      claim: next.claim ?? null,
      claimSource: next.claim ? (next.claimSource ?? null) : null,
    };
    handle?.setBlockTags?.(blockIds, patch);
    // The roadmap and sources views read tags from the server, which hears of them on the next content sync.
    setTimeout(() => notify(WORLD_NOTICE), 4000);
    close();
  };

  const showCanon = modules.has("world");
  const showReveal = modules.has("releases");
  const showClaim = modules.has("research");

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tag {blockIds.length === 1 ? "this block" : `${blockIds.length} blocks`}</DialogTitle>
          <DialogDescription>Tags travel with the text. Anything left empty follows the note.</DialogDescription>
        </DialogHeader>
        {!handle ? (
          <p className="text-sm text-muted-foreground">Open the note to tag its blocks.</p>
        ) : (
          <div className="grid gap-4">
            {!showCanon && !showReveal && !showClaim && (
              <p className="text-sm text-muted-foreground">
                Block tags belong to the World bible, Releases and Research modules. Turn one on in project settings.
              </p>
            )}
            {showCanon && (
              <Field label="Canon">
                <SelectField value={tags.canon ?? INHERIT} onValueChange={(v) => set("canon", (v || undefined) as CanonStatus | undefined)} className={fieldClass}>
                  <option value={INHERIT}>Same as the note</option>
                  {canonStatuses.map((c) => (
                    <option key={c} value={c}>
                      {canonMeta[c].label}
                    </option>
                  ))}
                </SelectField>
              </Field>
            )}
            {showReveal && (
              <>
                <Field label="Revealed">
                  <SelectField value={tags.reveal ?? INHERIT} onValueChange={(v) => set("reveal", v || undefined)} className={fieldClass}>
                    <option value={INHERIT}>With the note</option>
                    <option value={NEVER}>Never (the audience isn&apos;t told)</option>
                    {(world?.releases ?? []).map((r) => (
                      <option key={r.id} value={r.id}>
                        In {r.title}
                      </option>
                    ))}
                  </SelectField>
                </Field>
                {tags.reveal && tags.reveal !== NEVER && (
                  <Field label="Where">
                    <SelectField value={tags.channel ?? INHERIT} onValueChange={(v) => set("channel", v || undefined)} className={fieldClass}>
                      <option value={INHERIT}>Not specified</option>
                      {(world?.channels ?? []).map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </SelectField>
                  </Field>
                )}
                <Field label="Layer">
                  <SelectField value={tags.layer ?? "truth"} onValueChange={(v) => set("layer", v === "belief" ? "belief" : undefined)} className={fieldClass}>
                    <option value="truth">{layerMeta.truth.label}: {layerMeta.truth.description.toLowerCase()}</option>
                    <option value="belief">{layerMeta.belief.label}: what people are led to believe</option>
                  </SelectField>
                </Field>
              </>
            )}
            {showClaim && (
              <>
                <Field label="Fact-check">
                  <SelectField value={tags.claim ?? INHERIT} onValueChange={(v) => set("claim", (v || undefined) as ClaimStatus | undefined)} className={fieldClass}>
                    <option value={INHERIT}>Not a claim</option>
                    {claimStatuses.map((c) => (
                      <option key={c} value={c}>
                        {claimMeta[c].label}
                      </option>
                    ))}
                  </SelectField>
                </Field>
                {tags.claim && (
                  <Field label="Source">
                    <SelectField value={tags.claimSource ?? INHERIT} onValueChange={(v) => set("claimSource", v || undefined)} className={fieldClass}>
                      <option value={INHERIT}>None yet</option>
                      {sources.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.title}
                        </option>
                      ))}
                    </SelectField>
                  </Field>
                )}
              </>
            )}
            <div className="flex justify-between gap-2">
              <button type="button" onClick={() => apply({})} className="h-9 rounded-md px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
                Clear tags
              </button>
              <div className="flex gap-2">
                <button type="button" onClick={close} className="h-9 rounded-md px-3 text-sm hover:bg-accent">
                  Cancel
                </button>
                <button type="button" onClick={() => apply(tags)} className="h-9 rounded-md bg-foreground px-4 text-sm text-background">
                  Apply
                </button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
