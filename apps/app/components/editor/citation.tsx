"use client";

import { useComboboxContext } from "@ariakit/react";
import { Icon } from "@plotra/icons";
import { cn } from "@plotra/ui/lib/utils";
import type { TElement } from "platejs";
import { createPlatePlugin, PlateElement, useEditorRef, useReadOnly, type PlateEditor, type PlateElementProps } from "platejs/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Reference, Runs, useCitationStyle, useSources } from "@/components/research/cite";
import { AttachmentInsertPlugin } from "@/components/research/editor-bridge";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { formatInText, missingFields, runsToText, type Source } from "@/lib/citations";
import { CITATION, type CitationElement as TCitation } from "@/lib/doc-index";
import {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxEmpty,
  InlineComboboxGroup,
  InlineComboboxGroupLabel,
  InlineComboboxInput,
  InlineComboboxItem,
} from "./inline-combobox";

// Inline citations (plan.md 2.8 "cite inline"): `[@` or the slash menu picks a
// research note, and the citation shows in the project's style, "(Okafor 2019,
// 44)". Like a wiki-link it stores the source's id, so it follows the source
// as its details are filled in, and counts as a link to it ("cited in").

export const CITATION_INPUT = "citation_input";

const MAX_LOCATOR = 80;
const OPEN_DELAY = 350;
const CLOSE_DELAY = 200;

/**
 * The citation the writer just picked from the list: its locator box opens at
 * once, so "p. 44" can be typed straight after choosing the source. Only this
 * browser knows about it; nobody else's copy of the citation opens.
 */
let justInserted: { nodeId: string; at: number } | null = null;
const isJustInserted = (element: TCitation) =>
  !element.locator && justInserted?.nodeId === element.nodeId && Date.now() - justInserted.at < 1500;

function insertCitation(editor: PlateEditor, nodeId: string, locator?: string) {
  const element: TCitation = { type: CITATION, nodeId, ...(locator && { locator: locator.slice(0, MAX_LOCATOR) }), children: [{ text: "" }] };
  justInserted = locator ? null : { nodeId, at: Date.now() };
  editor.tf.insertNodes(element as unknown as TElement);
  editor.tf.move({ unit: "offset" });
}

// ---- Picking a source -----------------------------------------------------------------

/** What's typed after `[@`: words to find the source by, then optionally `|` and a locator. */
function parseQuery(query: string) {
  const [search, ...rest] = query.split("|");
  return { search: search.trim().toLowerCase(), locator: rest.join("|").trim() || undefined };
}

function rank(source: Source, words: string[]) {
  if (!words.length) return 1;
  const title = source.title.toLowerCase();
  const authors = source.authors.map((a) => `${a.given} ${a.family}`.toLowerCase());
  const year = String(source.date?.year ?? "");
  let score = 0;
  for (const word of words) {
    if (authors.some((a) => a.split(/\s+/).some((part) => part.startsWith(word)))) score += 3;
    else if (title.split(/\s+/).some((part) => part.startsWith(word))) score += 2;
    else if (title.includes(word) || year.startsWith(word) || source.container.toLowerCase().includes(word)) score += 1;
    else return 0;
  }
  return score;
}

function SourceSuggestions() {
  const editor = useEditorRef();
  const { actions } = useWorkspace();
  const { sources, suffixes } = useSources();
  const style = useCitationStyle();
  const store = useComboboxContext()!;
  const typed = store.useState("value");
  const { search, locator } = parseQuery(typed);
  // The title as typed, not lower-cased for searching.
  const newTitle = typed.split("|")[0].trim();
  const words = search.split(/\s+/).filter(Boolean);

  const matches = sources
    .map((source) => ({ source, score: rank(source, words) }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score || a.source.title.localeCompare(b.source.title))
    .slice(0, 12);
  const exact = matches.some((m) => m.source.title.toLowerCase() === search);

  return (
    <>
      <InlineComboboxEmpty>{sources.length ? "No matching source" : "No sources yet: type a title to add one"}</InlineComboboxEmpty>
      <InlineComboboxGroup>
        <InlineComboboxGroupLabel>{locator ? `Cite, ${locator}` : "Cite a source"}</InlineComboboxGroupLabel>
        {matches.map(({ source }) => (
          <InlineComboboxItem key={source.id} value={`source:${source.id}`} className="h-auto min-h-8 py-1" onClick={() => insertCitation(editor, source.id, locator)}>
            <Icon name="square-academic-cap-linear" />
            <span className="grid min-w-0">
              <span className="truncate">{source.title || "Untitled"}</span>
              <span className="truncate text-xs text-faint">{runsToText(formatInText(source, style, { suffix: suffixes.get(source.id) })).slice(1, -1)}</span>
            </span>
          </InlineComboboxItem>
        ))}
        {search && !exact && (
          <InlineComboboxItem
            value="create"
            onClick={() => {
              const at = editor.selection;
              void actions.create("research", undefined, newTitle, { open: false }).then((created) => {
                if (!created) return;
                if (at) editor.tf.select(at);
                insertCitation(editor, created.id, locator);
              });
            }}
          >
            <Icon name="document-add-linear" />
            <span className="truncate">New source “{newTitle}”</span>
          </InlineComboboxItem>
        )}
      </InlineComboboxGroup>
    </>
  );
}

export function CitationInputElement(props: PlateElementProps<TElement>) {
  return (
    <PlateElement {...props} as="span">
      <InlineCombobox element={props.element} trigger="[@" filter={false}>
        <span className="rounded-sm bg-ember/10 px-0.5 text-ember-ink">
          <InlineComboboxInput />
        </span>
        <InlineComboboxContent className="w-[340px]">
          <SourceSuggestions />
        </InlineComboboxContent>
      </InlineCombobox>
      {props.children}
    </PlateElement>
  );
}

// ---- The citation itself ---------------------------------------------------------------

/** The card under a citation: the full reference, and the locator for whoever can edit. */
function CitationCard({
  anchor,
  source,
  suffix,
  locator,
  editing,
  onLocator,
  onOpen,
  onEnter,
  onLeave,
  onFocusChange,
}: {
  anchor: React.RefObject<HTMLSpanElement | null>;
  source: Source;
  suffix?: string;
  locator: string;
  /** Null when the document is read-only; true puts the caret in the locator box. */
  editing: boolean | null;
  onLocator: (locator: string, done: boolean) => void;
  onOpen: (e: React.MouseEvent) => void;
  onEnter: () => void;
  onLeave: () => void;
  onFocusChange: (focused: boolean) => void;
}) {
  const style = useCitationStyle();
  const [draft, setDraft] = useState(locator);
  const card = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const missing = missingFields(source);

  // Placed under the citation as it opens; a hover card doesn't need to follow scrolling.
  useLayoutEffect(() => {
    const rect = anchor.current?.getBoundingClientRect();
    const el = card.current;
    if (!el || !rect) return;
    el.style.top = `${Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - el.offsetHeight - 8))}px`;
    el.style.left = `${Math.min(Math.max(8, rect.left), window.innerWidth - 368)}px`;
  }, [anchor]);

  // After the editor has taken focus back from the picker.
  useEffect(() => {
    if (!editing) return;
    const timer = setTimeout(() => input.current?.focus(), 60);
    return () => clearTimeout(timer);
  }, [editing]);

  return createPortal(
    <div
      role="dialog"
      aria-label="Citation"
      ref={card}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className="fixed z-[600] w-[360px] rounded-lg border bg-popover p-3 font-sans text-popover-foreground shadow-lg animate-in fade-in-0 zoom-in-95"
    >
      <p className="text-ui-sm leading-relaxed">
        <Reference source={source} style={style} suffix={suffix} links />
      </p>
      {missing.length > 0 && (
        <p className="mt-1.5 flex items-center gap-1 text-xs text-gold-ink">
          <Icon name="danger-circle-linear" className="size-3.5 shrink-0" />
          Missing {missing.join(", ")}
        </p>
      )}
      <div className="mt-2.5 flex items-center gap-2">
        {editing !== null && (
          <input
            ref={input}
            value={draft}
            maxLength={MAX_LOCATOR}
            aria-label="Page or section"
            placeholder="Page or section: p. 44"
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => onFocusChange(true)}
            onBlur={() => {
              onFocusChange(false);
              if (draft.trim() !== locator) onLocator(draft.trim(), false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") {
                e.preventDefault();
                onLocator(e.key === "Enter" ? draft.trim() : locator, true);
              }
            }}
            className="h-7 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-ui-sm outline-none placeholder:text-faint focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        )}
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onOpen}
          className="ml-auto flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-ui-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Open source
          <Icon name="square-arrow-right-up-linear" className="size-3.5" />
        </button>
      </div>
    </div>,
    document.body,
  );
}

export function CitationElement(props: PlateElementProps<TElement>) {
  const element = props.element as unknown as TCitation;
  const editor = useEditorRef();
  const readOnly = useReadOnly();
  const { openNode, binder } = useWorkspace();
  const { byId, suffixes } = useSources();
  const style = useCitationStyle();
  const source = byId.get(element.nodeId);
  const suffix = suffixes.get(element.nodeId);

  const anchor = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A citation that was just picked opens with its locator box ready.
  const [fresh] = useState(() => !readOnly && isJustInserted(element));
  const [shown, setShown] = useState(fresh);
  const [editing, setEditing] = useState(fresh);
  const focused = useRef(false);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const schedule = (fn: () => void, delay: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(fn, delay);
  };
  const hold = () => {
    if (timer.current) clearTimeout(timer.current);
  };
  const close = () => {
    focused.current = false;
    setShown(false);
    setEditing(false);
  };
  // The card stays while the locator is being typed, wherever the pointer goes.
  const leave = () => schedule(() => !focused.current && close(), CLOSE_DELAY);

  const open = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    close();
    openNode(element.nodeId, (e.metaKey || e.ctrlKey) && e.altKey ? "split" : e.metaKey || e.ctrlKey ? "tab" : "replace");
  };

  const setLocator = (locator: string, done: boolean) => {
    const path = editor.api.findPath(props.element);
    if (path && locator !== (element.locator ?? "")) {
      if (locator) editor.tf.setNodes({ locator: locator.slice(0, MAX_LOCATOR) } as Partial<TElement>, { at: path });
      else editor.tf.unsetNodes("locator", { at: path });
    }
    if (done) {
      close();
      editor.tf.focus();
    }
  };

  if (!source) {
    // In the trash, deleted, or a note this reader isn't allowed to see.
    const known = binder.get().index.byId.has(element.nodeId);
    return (
      <PlateElement {...props} as="span" className="inline">
        <span contentEditable={false} title={known ? "This source is in the trash" : "This source isn't available to you"} className={cn("rounded-[2px] text-muted-foreground", known && "line-through")}>
          (source unavailable)
        </span>
        {props.children}
      </PlateElement>
    );
  }

  return (
    <PlateElement {...props} as="span" className="inline">
      <span ref={anchor} contentEditable={false} onMouseEnter={() => schedule(() => setShown(true), OPEN_DELAY)} onMouseLeave={leave}>
        <a
          href="#"
          data-citation={element.nodeId}
          onMouseDown={(e) => e.preventDefault()}
          onClick={open}
          className="cursor-pointer rounded-[2px] text-ember-ink decoration-ember/35 decoration-dotted underline-offset-4 hover:underline"
        >
          <Runs runs={formatInText(source, style, { locator: element.locator, suffix })} />
        </a>
        {shown && (
          <CitationCard
            // A new draft whenever someone else changes the locator.
            key={element.locator ?? ""}
            anchor={anchor}
            source={source}
            suffix={suffix}
            locator={element.locator ?? ""}
            editing={readOnly ? null : editing}
            onLocator={setLocator}
            onOpen={open}
            onEnter={hold}
            onLeave={leave}
            onFocusChange={(isFocused) => {
              focused.current = isFocused;
              if (!isFocused) leave();
            }}
          />
        )}
      </span>
      {props.children}
    </PlateElement>
  );
}

const voidInline = { isElement: true, isInline: true, isVoid: true } as const;

export const CitationPlugin = createPlatePlugin({
  key: CITATION,
  node: { ...voidInline, isMarkableVoid: true, component: CitationElement },
});

/** Typing `[@` opens the source picker in place. */
export const CitationInputPlugin = createPlatePlugin({
  key: CITATION_INPUT,
  node: { ...voidInline, component: CitationInputElement },
}).overrideEditor(({ editor, tf: { insertText } }) => ({
  transforms: {
    insertText(text, options) {
      if (text !== "@" || options?.at || !editor.selection || !editor.api.isCollapsed()) return insertText(text, options);
      const before = editor.api.before(editor.selection, { distance: 1, unit: "character" });
      const typed = before ? editor.api.string({ anchor: before, focus: editor.selection.anchor }) : "";
      if (typed !== "[") return insertText(text, options);
      editor.tf.withoutNormalizing(() => {
        editor.tf.deleteBackward("character");
        editor.tf.insertNodes({ type: CITATION_INPUT, children: [{ text: "" }] });
      });
    },
  },
}));

/** The citation element and its picker. */
export const CitationKit = [CitationPlugin, CitationInputPlugin];

/** Everything the Research module adds to the main editor: citations, and images from a source's attachments. */
export const ResearchKit = [...CitationKit, AttachmentInsertPlugin];
