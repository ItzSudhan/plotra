"use client";

import { Tooltip } from "@plotra/ui/components/tooltip";
import { DndPlugin, useDraggable, useDropLine } from "@platejs/dnd";
import { expandListItemsWithChildren } from "@platejs/list";
import { BlockSelectionPlugin, useBlockSelected } from "@platejs/selection/react";
import { Icon } from "@plotra/icons";
import { cn } from "@plotra/ui/lib/utils";
import { isType, KEYS, type TElement } from "platejs";
import {
  MemoizedChildren,
  useEditorRef,
  useElement,
  usePluginOption,
  type PlateEditor,
  type PlateElementProps,
  type RenderNodeWrapper,
} from "platejs/react";
import { memo, useEffect, useRef } from "react";

// Adapted from Plate UI's block-draggable and block-selection (top-level blocks only).

const UNDRAGGABLE = [KEYS.tr, KEYS.td, KEYS.th];

export const BlockDraggable: RenderNodeWrapper = (props) => {
  const { editor, element, path } = props;
  if (editor.dom.readOnly || path.length !== 1 || isType(editor, element, UNDRAGGABLE)) return;
  return function DraggableBlock(props) {
    return <Draggable {...props} />;
  };
};

function Draggable(props: PlateElementProps) {
  const { children, editor, element } = props;
  const { isDragging, nodeRef, previewRef, handleRef } = useDraggable({
    element,
    onDropHandler: (_, { dragItem }) => {
      const id = (dragItem as { id: string[] | string }).id;
      editor.getApi(BlockSelectionPlugin).blockSelection?.add(id);
      resetPreview();
    },
  });

  const resetPreview = () => {
    previewRef.current?.replaceChildren();
    previewRef.current?.classList.add("hidden");
  };

  useEffect(() => {
    if (!isDragging) resetPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when a drag ends
  }, [isDragging]);

  return (
    <div className={cn("group relative", isDragging && "opacity-50")}>
      <Gutter>
        <Tooltip content="Drag to move · click to select" side="left">
        <button
          ref={handleRef}
          type="button"
          aria-label="Drag to move"
          data-plate-prevent-deselect
          className="grid h-6 w-5 cursor-grab place-items-center rounded text-faint outline-none hover:bg-accent hover:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 active:cursor-grabbing"
          onMouseDown={(e) => {
            if (e.button !== 0 || e.shiftKey) return;
            const selected = editor.getApi(BlockSelectionPlugin).blockSelection.getNodes({ sort: true });
            let nodes = selected.length > 0 ? selected : editor.api.blocks({ mode: "highest" });
            if (!nodes.some(([node]) => node.id === element.id)) nodes = [[element, editor.api.findPath(element)!]];
            const blocks = expandListItemsWithChildren(editor, nodes).map(([node]) => node);
            if (selected.length === 0) {
              editor.tf.blur();
              editor.tf.collapse();
            }
            previewRef.current?.append(...createDragPreview(editor, blocks));
            previewRef.current?.classList.remove("hidden");
            editor.setOption(DndPlugin, "multiplePreviewRef", previewRef);
            editor.getApi(BlockSelectionPlugin).blockSelection.set(blocks.map((b) => b.id as string));
          }}
          onMouseUp={resetPreview}
          onClick={(e) => {
            e.preventDefault();
            editor.getApi(BlockSelectionPlugin).blockSelection.focus();
          }}
        >
          <Icon name="reorder-linear" className="size-3.5" />
        </button>
        </Tooltip>
      </Gutter>

      <div ref={previewRef} className="absolute left-0 hidden w-full opacity-60" contentEditable={false} />

      <div
        ref={nodeRef}
        className="slate-blockWrapper flow-root"
        onContextMenu={(event) => editor.getApi(BlockSelectionPlugin).blockSelection.addOnContextMenu({ element, event })}
      >
        <MemoizedChildren>{children}</MemoizedChildren>
        <DropLine />
      </div>
    </div>
  );
}

function Gutter({ children }: { children: React.ReactNode }) {
  const isSelectionAreaVisible = usePluginOption(BlockSelectionPlugin, "isSelectionAreaVisible");
  const editor = useEditorRef();
  const element = useElement();
  const ref = useRef<HTMLDivElement>(null);

  // Line the handle up with the first line of text, below any top margin.
  useEffect(() => {
    const dom = editor.api.toDOMNode(element);
    if (dom && ref.current) ref.current.style.top = `${parseFloat(getComputedStyle(dom).marginTop) + 4}px`;
  }, [editor, element]);

  return (
    <div
      ref={ref}
      contentEditable={false}
      className={cn(
        "absolute top-1 -left-7 z-10 flex opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100",
        isSelectionAreaVisible && "hidden",
      )}
    >
      {children}
    </div>
  );
}

const DropLine = memo(function DropLine() {
  const { dropLine } = useDropLine();
  if (!dropLine) return null;
  return (
    <div
      className={cn(
        "absolute inset-x-0 h-0.5 bg-ember/60",
        dropLine === "top" && "-top-px",
        dropLine === "bottom" && "-bottom-px",
      )}
    />
  );
});

function createDragPreview(editor: PlateEditor, blocks: TElement[]) {
  const ids: string[] = [];
  const elements = blocks.flatMap((block) => {
    const dom = editor.api.toDOMNode(block);
    if (!dom) return [];
    const clone = dom.cloneNode(true) as HTMLElement;
    // Strip Slate attributes so the copy isn't mistaken for a real node.
    for (const el of [clone, ...clone.querySelectorAll<HTMLElement>("*")]) {
      for (const attr of [...el.attributes]) {
        if (attr.name.startsWith("data-slate") || attr.name.startsWith("data-block-id")) el.removeAttribute(attr.name);
      }
    }
    ids.push(block.id as string);
    const wrapper = document.createElement("div");
    wrapper.style.display = "flow-root";
    wrapper.append(clone);
    return [wrapper];
  });
  editor.setOption(DndPlugin, "draggingId", ids);
  return elements;
}

/** Tint behind blocks picked with block selection. */
export function BlockSelection(props: PlateElementProps) {
  const isBlockSelected = useBlockSelected();
  const isDragging = usePluginOption(DndPlugin, "isDragging");
  if (!isBlockSelected || isDragging || props.plugin.key === "tr" || props.plugin.key === "table") return null;
  return <div className="pointer-events-none absolute inset-0 z-1 rounded-sm bg-ember/10" data-slot="block-selection" />;
}
