"use client";

import { Tooltip } from "@plotra/ui/components/tooltip";
import { Icon } from "@plotra/icons";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@plotra/ui/components/dropdown-menu";
import { TextApi, type Path, type TElement } from "platejs";
import { createPlatePlugin, PlateLeaf, useEditorRef, useEditorSelector, type PlateEditor, type PlateLeafProps } from "platejs/react";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { BREAKDOWN, breakdownCategories, categoryMeta, isBreakdownCategory } from "@/lib/production";

// Script breakdown tags (plan.md 2.8 "Module: Production"): select a prop, a
// costume, a vehicle in the script and tag it; the Production view then lists
// every element by scene. A tag is a mark on the text, like bold.

function BreakdownLeaf(props: PlateLeafProps) {
  const meta = categoryMeta(String(props.leaf[BREAKDOWN]));
  return (
    <PlateLeaf
      {...props}
      attributes={{ ...props.attributes, title: meta.label }}
      style={{ ...props.style, textDecoration: "underline", textDecorationColor: meta.color, textDecorationThickness: 2, textUnderlineOffset: 3, backgroundColor: `color-mix(in oklab, ${meta.color} 12%, transparent)` }}
    />
  );
}

/**
 * Removes every tag the selection touches, whole: "a revolver" loses its tag
 * when only part of it, or just the cursor, is in the selection.
 */
function removeTags(editor: PlateEditor) {
  if (!editor.selection) return;
  const paths = new Map<string, Path>();
  for (const [leaf, path] of editor.api.nodes({ at: editor.selection, match: (n) => TextApi.isText(n) && isBreakdownCategory(n[BREAKDOWN]) })) {
    const parent = editor.api.node<TElement>(path.slice(0, -1))?.[0];
    if (!parent) continue;
    const category = leaf[BREAKDOWN];
    const same = (i: number) => parent.children[i]?.[BREAKDOWN] === category;
    let start = path.at(-1)!;
    let end = start;
    while (start > 0 && same(start - 1)) start--;
    while (same(end + 1)) end++;
    for (let i = start; i <= end; i++) {
      const at = [...path.slice(0, -1), i];
      paths.set(at.join("."), at);
    }
  }
  editor.tf.withoutNormalizing(() => {
    for (const at of paths.values()) editor.tf.unsetNodes(BREAKDOWN, { at });
  });
}

export const BreakdownPlugin = createPlatePlugin({ key: BREAKDOWN, node: { isLeaf: true, component: BreakdownLeaf } });

/** The floating toolbar's breakdown menu. Only shown while the Production module is on. */
export function BreakdownButton() {
  const editor = useEditorRef();
  const { modules } = useWorkspace();
  const current = useEditorSelector((e) => (e.api.marks() as Record<string, unknown> | null)?.[BREAKDOWN], []);
  const tagged = useEditorSelector((e) => !!e.selection && e.api.some({ at: e.selection, match: (n) => TextApi.isText(n) && isBreakdownCategory(n[BREAKDOWN]) }), []);
  if (!modules.has("production")) return null;
  const active = typeof current === "string" ? categoryMeta(current) : null;

  return (
    <DropdownMenu modal={false}>
      <Tooltip content="Tag for the breakdown (cast, props, wardrobe…)">
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Breakdown tag"
          onMouseDown={(e) => e.preventDefault()}
          className="inline-flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-md px-1.5 text-sm text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
          style={active ? { color: active.color } : undefined}
        >
          <Icon name="tag-linear" className="size-4" />
          {active?.label}
        </button>
      </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent
        align="start"
        className="ignore-click-outside/toolbar min-w-44"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          editor.tf.focus();
        }}
      >
        {breakdownCategories.map((c) => (
          <DropdownMenuItem key={c.id} onSelect={() => editor.tf.addMark(BREAKDOWN, c.id)} className="gap-2">
            <span className="size-2 rounded-full" style={{ backgroundColor: c.color }} />
            {c.label}
          </DropdownMenuItem>
        ))}
        {(active || tagged) && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => removeTags(editor)}>Remove tag</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
