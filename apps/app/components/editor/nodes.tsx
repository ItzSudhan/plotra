"use client";

import { Tooltip } from "@plotra/ui/components/tooltip";
import { getLinkAttributes } from "@platejs/link";
import { isOrderedList } from "@platejs/list";
import { useTodoListElement, useTodoListElementState } from "@platejs/list/react";
import { useBlockSelected } from "@platejs/selection/react";
import { TablePlugin, TableProvider, useTableElement } from "@platejs/table/react";
import { Icon } from "@plotra/icons";
import { cn } from "@plotra/ui/lib/utils";
import type { TElement, TLinkElement, TListElement, TTableElement } from "platejs";
import {
  PlateElement,
  PlateLeaf,
  useEditorPlugin,
  useEditorRef,
  useFocused,
  useReadOnly,
  useSelected,
  withHOC,
  type PlateElementProps,
  type PlateLeafProps,
  type RenderNodeWrapper,
} from "platejs/react";
import { useId, useRef, useState } from "react";
import { ALT_MAX, altChange } from "@/lib/image-alt";

// Element and leaf renderers, adapted from Plate UI (platejs.org/docs/components).

export function ParagraphElement(props: PlateElementProps) {
  // `prose-p`: how paragraphs are set apart is the writer's choice (globals.css, lib/shell-prefs.ts).
  return <PlateElement {...props} className="prose-p m-0 px-0 py-1" />;
}

const headingClass = {
  h1: "mt-[1.4em] mb-1 font-display text-[2.1em] leading-tight tracking-tight",
  h2: "mt-[1.3em] mb-1 font-prose text-[1.5em] font-semibold leading-snug tracking-tight",
  h3: "mt-[1em] mb-1 font-prose text-[1.2em] font-semibold tracking-tight",
};

function heading(level: keyof typeof headingClass) {
  return function HeadingElement(props: PlateElementProps) {
    return <PlateElement as={level} {...props} className={cn("relative", headingClass[level])} />;
  };
}
export const H1Element = heading("h1");
export const H2Element = heading("h2");
export const H3Element = heading("h3");

export function BlockquoteElement(props: PlateElementProps) {
  return <PlateElement as="blockquote" {...props} className="my-1 border-l-2 border-ember/60 pl-5 italic text-muted-foreground" />;
}

export function HrElement(props: PlateElementProps) {
  const readOnly = useReadOnly();
  const selected = useSelected();
  const focused = useFocused();
  return (
    <PlateElement {...props}>
      <div className="py-5" contentEditable={false}>
        <hr
          className={cn(
            "h-px border-none bg-border",
            selected && focused && "ring-2 ring-ring ring-offset-4 ring-offset-background",
            !readOnly && "cursor-pointer",
          )}
        />
      </div>
      {props.children}
    </PlateElement>
  );
}

export function CodeLeaf(props: PlateLeafProps) {
  return (
    <PlateLeaf
      {...props}
      as="code"
      className="rounded-md bg-muted px-[0.3em] py-[0.15em] font-mono text-[0.85em] whitespace-pre-wrap"
    />
  );
}

export function HighlightLeaf(props: PlateLeafProps) {
  return <PlateLeaf {...props} as="mark" className="rounded-[2px] bg-gold/25 px-px text-inherit" />;
}

export function LinkElement(props: PlateElementProps<TLinkElement>) {
  return (
    <PlateElement
      {...props}
      as="a"
      className="font-medium text-ember-ink underline decoration-ember/40 underline-offset-4 hover:decoration-ember"
      attributes={{
        ...props.attributes,
        ...getLinkAttributes(props.editor, props.element),
        onMouseOver: (e) => e.stopPropagation(),
      }}
    />
  );
}

export function CalloutElement(props: PlateElementProps) {
  return (
    <PlateElement {...props} className="my-1 flex gap-3 rounded-md bg-muted px-4 py-3">
      <span contentEditable={false} className="select-none pt-1 text-lg leading-none" aria-hidden>
        {(props.element.icon as string | undefined) || "💡"}
      </span>
      <div className="min-w-0 flex-1">{props.children}</div>
    </PlateElement>
  );
}

export function ImageElement(props: PlateElementProps) {
  const selected = useSelected();
  const focused = useFocused();
  const readOnly = useReadOnly();
  const [editingAlt, setEditingAlt] = useState(false);
  const url = props.element.url as string | undefined;
  const alt = typeof props.element.alt === "string" ? props.element.alt : "";
  return (
    <PlateElement {...props} className="py-2">
      <figure contentEditable={false} className="m-0">
        {/* eslint-disable-next-line @next/next/no-img-element -- user-supplied URLs from any host */}
        <img
          src={url}
          alt={alt}
          className={cn(
            "mx-auto block max-h-[480px] max-w-full rounded-md object-contain",
            selected && focused && "ring-2 ring-ring ring-offset-2 ring-offset-background",
          )}
          draggable={false}
        />
        {!readOnly && (selected || editingAlt) && (
          <ImageAltControl element={props.element} alt={alt} editing={editingAlt} setEditing={setEditingAlt} />
        )}
      </figure>
      {props.children}
    </PlateElement>
  );
}

/**
 * The "Alt text" control under a selected picture. Tab on a selected picture
 * focuses it (ImageAltPlugin in editor-kit.tsx). Saving sets `alt` on the node
 * (an empty value removes it), which reaches co-writers through Yjs like any edit.
 */
function ImageAltControl({ element, alt, editing, setEditing }: { element: TElement; alt: string; editing: boolean; setEditing: (on: boolean) => void }) {
  const editor = useEditorRef();
  const inputId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Set once the field is saved or cancelled, so the blur as it goes away doesn't save again.
  const closed = useRef(false);

  const open = () => {
    closed.current = false;
    setEditing(true);
  };

  const close = (refocus: "button" | "editor") => {
    closed.current = true;
    setEditing(false);
    if (refocus === "button") requestAnimationFrame(() => buttonRef.current?.focus());
  };

  // The path is looked up when saving: a co-writer may have moved the picture meanwhile.
  const save = (raw: string, refocus: boolean) => {
    if (closed.current) return;
    const path = editor.api.findPath(element);
    if (path) {
      const change = altChange(element.alt, raw);
      if (change && "set" in change) editor.tf.setNodes({ alt: change.set }, { at: path });
      else if (change) editor.tf.unsetNodes("alt", { at: path });
      if (refocus) {
        editor.tf.select(path);
        editor.tf.focus();
      }
    }
    close("editor");
  };

  if (!editing) {
    return (
      <div className="mt-1.5 flex justify-center font-sans">
        <Tooltip content="Describe the picture for people who can't see it">
        <button
          ref={buttonRef}
          type="button"
          data-image-alt=""
          aria-label={alt ? `Alt text: ${alt}. Edit` : "Add alt text"}
          onMouseDown={(e) => e.preventDefault()}
          onClick={open}
          className="inline-flex max-w-full items-center gap-1 rounded-md border bg-background px-2 py-0.5 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <span className="font-medium">Alt text</span>
          <span className={cn("truncate", !alt && "italic")}>{alt ? `· ${alt}` : "· none"}</span>
        </button>
        </Tooltip>
      </div>
    );
  }

  return (
    <form
      role="group"
      aria-label="Alt text"
      className="mx-auto mt-1.5 flex max-w-md items-center gap-1.5 font-sans"
      onSubmit={(e) => {
        e.preventDefault();
        save(String(new FormData(e.currentTarget).get("alt") ?? ""), true);
      }}
      // Clicking or tabbing away keeps what was typed.
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        save(String(new FormData(e.currentTarget).get("alt") ?? ""), false);
      }}
      // Keys typed here belong to the field, not to the editor or the app's shortcuts.
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          e.preventDefault();
          close("button");
        }
      }}
    >
      <label htmlFor={inputId} className="sr-only">
        Alt text
      </label>
      <input
        id={inputId}
        name="alt"
        defaultValue={alt}
        maxLength={ALT_MAX}
        placeholder="Describe the picture"
        autoFocus
        autoComplete="off"
        className="h-7 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <button type="submit" className="h-7 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring">
        Save
      </button>
      <button
        type="button"
        onClick={() => close("button")}
        className="h-7 rounded-md px-2 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        Cancel
      </button>
    </form>
  );
}

// ---- Lists ------------------------------------------------------------------

export const BlockList: RenderNodeWrapper = (props) => {
  if (!props.element.listStyleType) return;
  return function List(props) {
    const { listStart, listStyleType } = props.element as TListElement;
    const Tag = isOrderedList(props.element) ? "ol" : "ul";
    const todo = listStyleType === "todo";
    return (
      <Tag className="relative m-0 p-0" style={{ listStyleType: todo ? "none" : listStyleType }} start={listStart}>
        {todo && <TodoMarker {...props} />}
        <li className={cn(todo && "list-none", todo && Boolean(props.element.checked) && "text-muted-foreground line-through")}>
          {props.children}
        </li>
      </Tag>
    );
  };
};

function TodoMarker(props: PlateElementProps) {
  const state = useTodoListElementState({ element: props.element });
  const { checkboxProps } = useTodoListElement(state);
  const readOnly = useReadOnly();
  return (
    <div contentEditable={false}>
      <button
        type="button"
        role="checkbox"
        aria-checked={checkboxProps.checked}
        onClick={() => checkboxProps.onCheckedChange(!checkboxProps.checked)}
        onMouseDown={(e) => e.preventDefault()}
        className={cn(
          "absolute top-[0.45em] -left-6 grid size-4 place-items-center rounded-[4px] border border-input transition-colors",
          checkboxProps.checked && "border-ember bg-ember text-white",
          readOnly && "pointer-events-none",
        )}
      >
        {checkboxProps.checked && <Icon name="check-linear" className="size-3" />}
      </button>
    </div>
  );
}

// ---- Tables -----------------------------------------------------------------

export const TableElement = withHOC(TableProvider, function TableElement(props: PlateElementProps<TTableElement>) {
  const readOnly = useReadOnly();
  const selected = useSelected();
  const focused = useFocused();
  const { props: tableProps, marginLeft } = useTableElement();
  const { tf } = useEditorPlugin(TablePlugin);
  const showToolbar = !readOnly && selected && focused;

  const actions = [
    { label: "Row above", icon: "arrow-up-linear", run: () => tf.insert.tableRow({ before: true }) },
    { label: "Row below", icon: "arrow-down-linear", run: () => tf.insert.tableRow() },
    { label: "Column", icon: "table-columns-split-linear", run: () => tf.insert.tableColumn() },
    { label: "Delete row", icon: "table-rows-split-linear", run: () => tf.remove.tableRow() },
    { label: "Delete column", icon: "close-linear", run: () => tf.remove.tableColumn() },
    { label: "Delete table", icon: "trash-bin-minimalistic-linear", run: () => tf.remove.table() },
  ] as const;

  return (
    <PlateElement {...props} className="relative overflow-x-auto py-4" style={{ paddingLeft: marginLeft }}>
      {showToolbar && (
        <div
          contentEditable={false}
          className="absolute -top-3 left-0 z-10 flex gap-0.5 rounded-md border bg-popover p-0.5 shadow-sm"
        >
          {actions.map((action) => (
            <Tooltip key={action.label} content={action.label}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={action.run}
                className="grid size-8 place-items-center rounded text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <Icon name={action.icon} className="size-4" />
                <span className="sr-only">{action.label}</span>
              </button>
            </Tooltip>
          ))}
        </div>
      )}
      <table className="w-full table-fixed border-collapse font-sans text-sm" {...tableProps}>
        <tbody>{props.children}</tbody>
      </table>
    </PlateElement>
  );
});

export function TableRowElement(props: PlateElementProps) {
  return <PlateElement {...props} as="tr" />;
}

export function TableCellElement({ isHeader, ...props }: PlateElementProps & { isHeader?: boolean }) {
  const selected = useBlockSelected();
  return (
    <PlateElement
      {...props}
      as={isHeader ? "th" : "td"}
      className={cn(
        "border border-border px-3 py-1.5 align-top",
        isHeader && "bg-muted text-left font-medium",
        selected && "bg-ember/10",
      )}
    />
  );
}

export function TableCellHeaderElement(props: PlateElementProps) {
  return <TableCellElement {...props} isHeader />;
}
