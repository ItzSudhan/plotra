"use client";

import { useComboboxContext } from "@ariakit/react";
import { Icon } from "@plotra/icons";
import { cn } from "@plotra/ui/lib/utils";
import type { TElement } from "platejs";
import { createPlatePlugin, PlateElement, useEditorRef, useReadOnly, type PlateElementProps } from "platejs/react";
import { useMemo } from "react";
import { useStore } from "@/components/workspace/stores";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { useSharedWorld } from "@/components/world/data";
import { EMBED, WIKILINK, type EmbedElement as TEmbed, type WikiLinkElement as TWikiLink } from "@/lib/doc-index";
import { ancestors, flatten, isTrashed, nodeKindMeta, type BinderNode } from "@/lib/tree";
import { typingOn } from "@/lib/shell-prefs";
import { EmbeddedDocument } from "./embedded-document";
import { livePrefs } from "./live-prefs";
import { HoverPreview } from "./hover-preview";
import {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxEmpty,
  InlineComboboxGroup,
  InlineComboboxGroupLabel,
  InlineComboboxInput,
  InlineComboboxItem,
} from "./inline-combobox";

// Wiki-links (plan.md 2.4): `[[Note]]`, `[[Note#Heading]]`, `[[Note|shown text]]`
// and embeds `![[Note]]`. Links store the target's id, so renames never break
// them; the title shown is always the current one.

export const WIKILINK_INPUT = "wikilink_input";

type TWikiLinkInput = TElement & { embed?: boolean };

/** Parses what's typed after `[[` into title, heading and alias. */
function parseQuery(query: string) {
  const [target, ...aliasParts] = query.split("|");
  const [title, ...headingParts] = target.split("#");
  return {
    title: title.trim(),
    heading: headingParts.length ? headingParts.join("#").trim() : undefined,
    alias: aliasParts.length ? aliasParts.join("|").trim() || undefined : undefined,
  };
}

function rank(node: Pick<BinderNode, "title" | "aliases">, query: string) {
  const q = query.toLowerCase();
  if (!q) return 1;
  const names = [node.title, ...node.aliases].map((n) => n.toLowerCase());
  if (names.some((n) => n === q)) return 4;
  if (names.some((n) => n.startsWith(q))) return 3;
  if (names.some((n) => n.split(/\s+/).some((w) => w.startsWith(q)))) return 2;
  if (names.some((n) => n.includes(q))) return 1;
  return 0;
}

function LinkSuggestions({ embed }: { embed: boolean }) {
  const editor = useEditorRef();
  const { binder, actions } = useWorkspace();
  const { index } = useStore(binder);
  const store = useComboboxContext()!;
  const query = store.useState("value");
  const { title, heading, alias } = parseQuery(query);
  const nodes = useMemo(() => flatten(index).filter((n) => n.kind !== "folder"), [index]);
  // Entries of the world this project shares can be linked like the project's own notes (plan.md 2.8).
  const shared = useSharedWorld();

  const insert = (nodeId: string, toHeading?: string) => {
    if (embed) {
      const element: TEmbed = { type: EMBED, nodeId, ...(toHeading && { heading: toHeading }), children: [{ text: "" }] };
      editor.tf.insertNodes(element as unknown as TElement, { select: true });
      return;
    }
    const element: TWikiLink = {
      type: WIKILINK,
      nodeId,
      ...(toHeading && { heading: toHeading }),
      ...(alias && { alias }),
      children: [{ text: "" }],
    };
    editor.tf.insertNodes(element as unknown as TElement);
    editor.tf.move({ unit: "offset" });
  };

  // `[[Note#…`: pick a heading inside the chosen note.
  if (heading !== undefined) {
    const target =
      nodes.find((n) => [n.title, ...n.aliases].some((name) => name.toLowerCase() === title.toLowerCase())) ??
      nodes.filter((n) => rank(n, title) > 0).sort((a, b) => rank(b, title) - rank(a, title))[0];
    const headings = (target?.headings ?? []).filter((h) => h.text.toLowerCase().includes(heading.toLowerCase()));
    return (
      <>
        <InlineComboboxEmpty>{target ? "No matching headings" : "No matching note"}</InlineComboboxEmpty>
        {target && (
          <InlineComboboxGroup>
            <InlineComboboxGroupLabel>Headings in {target.title}</InlineComboboxGroupLabel>
            {headings.slice(0, 30).map((h) => (
              <InlineComboboxItem key={h.id} value={`heading:${h.id}`} onClick={() => insert(target.id, h.text)}>
                <span className="w-5 shrink-0 text-meta font-semibold text-muted-foreground">H{h.level}</span>
                <span className="truncate">{h.text}</span>
              </InlineComboboxItem>
            ))}
          </InlineComboboxGroup>
        )}
      </>
    );
  }

  const matches = nodes
    .map((n) => ({ n, score: rank(n, title) }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score || a.n.title.localeCompare(b.n.title))
    .slice(0, 12);
  const exact = matches.some((m) => m.score === 4);
  const sharedMatches =
    shared && !embed && title
      ? shared.entries
          .map((n) => ({ n, score: rank(n, title) }))
          .filter((m) => m.score > 0)
          .sort((a, b) => b.score - a.score || a.n.title.localeCompare(b.n.title))
          .slice(0, 6)
      : [];

  return (
    <>
      <InlineComboboxEmpty>Type a note&apos;s name</InlineComboboxEmpty>
      <InlineComboboxGroup>
        <InlineComboboxGroupLabel>{embed ? "Embed a note" : "Link to a note"}</InlineComboboxGroupLabel>
        {matches.map(({ n }) => {
          const trail = ancestors(index, n.id).map((a) => a.title).join(" / ");
          const viaAlias = title && !n.title.toLowerCase().includes(title.toLowerCase());
          return (
            <InlineComboboxItem key={n.id} value={`node:${n.id}`} onClick={() => insert(n.id)}>
              <Icon name={nodeKindMeta[n.kind].icon} />
              <span className="truncate">{n.title}</span>
              {viaAlias && <span className="truncate text-xs text-faint">alias</span>}
              {trail && <span className="ml-auto max-w-[45%] truncate pl-2 text-xs text-faint">{trail}</span>}
            </InlineComboboxItem>
          );
        })}
        {title && !exact && (
          <InlineComboboxItem
            value="create"
            onClick={() => {
              const at = editor.selection;
              void actions.create("note", undefined, title, { open: false }).then((created) => {
                if (!created) return;
                if (at) editor.tf.select(at);
                insert(created.id);
              });
            }}
          >
            <Icon name="document-add-linear" />
            <span className="truncate">Create “{title}”</span>
          </InlineComboboxItem>
        )}
      </InlineComboboxGroup>
      {shared && sharedMatches.length > 0 && (
        <InlineComboboxGroup>
          <InlineComboboxGroupLabel>From {shared.title}</InlineComboboxGroupLabel>
          {sharedMatches.map(({ n }) => (
            <InlineComboboxItem key={n.id} value={`shared:${n.id}`} onClick={() => insert(n.id)}>
              <Icon name="planet-linear" />
              <span className="truncate">{n.title}</span>
            </InlineComboboxItem>
          ))}
        </InlineComboboxGroup>
      )}
    </>
  );
}

export function WikiLinkInputElement(props: PlateElementProps<TWikiLinkInput>) {
  const embed = Boolean(props.element.embed);
  return (
    <PlateElement {...props} as="span">
      <InlineCombobox element={props.element} trigger={embed ? "![[" : "[["} filter={false}>
        <span className="rounded-sm bg-ember/10 px-0.5 text-ember-ink">
          <InlineComboboxInput />
        </span>
        <InlineComboboxContent className="w-[320px]">
          <LinkSuggestions embed={embed} />
        </InlineComboboxContent>
      </InlineCombobox>
      {props.children}
    </PlateElement>
  );
}

/** Clicking a link opens it; ⌘-click in a new tab, ⌘⌥-click to the side. */
function useOpenLink() {
  const { openNode } = useWorkspace();
  return (e: React.MouseEvent, nodeId: string, heading?: string) => {
    e.preventDefault();
    e.stopPropagation();
    const mode = (e.metaKey || e.ctrlKey) && e.altKey ? "split" : e.metaKey || e.ctrlKey ? "tab" : "replace";
    openNode(nodeId, mode, heading ? { heading } : undefined);
  };
}

export function WikiLinkElement(props: PlateElementProps<TElement>) {
  const element = props.element as unknown as TWikiLink;
  const { binder, project, openView } = useWorkspace();
  const { index } = useStore(binder);
  const openLink = useOpenLink();
  const target = index.byId.get(element.nodeId);
  const trashed = target ? isTrashed(index, target.id) : false;
  // Not a note of this project: perhaps an entry of the world it shares.
  const shared = useSharedWorld();
  const sharedEntry = target ? undefined : shared?.entries.find((e) => e.id === element.nodeId);

  if (shared && sharedEntry) {
    return (
      <PlateElement {...props} as="span" className="inline">
        <span contentEditable={false}>
          <a
            href="#"
            title={`${sharedEntry.title}, from ${shared.title}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.preventDefault();
              openView("codex", { nodeId: sharedEntry.id }, e.metaKey || e.ctrlKey ? "split" : "tab");
            }}
            className="cursor-pointer rounded-[2px] font-medium text-ember-ink underline decoration-ember/35 decoration-dotted underline-offset-4 hover:decoration-solid"
          >
            <Icon name="planet-linear" className="mr-0.5 inline size-3 align-[-1px]" />
            {element.alias || sharedEntry.title}
          </a>
        </span>
        {props.children}
      </PlateElement>
    );
  }

  const label = target
    ? element.alias || (element.heading ? `${target.title} › ${element.heading}` : target.title)
    : "Restricted note";

  return (
    <PlateElement {...props} as="span" className="inline">
      <span contentEditable={false}>
        {target && !trashed ? (
          <HoverPreview projectId={project.id} nodeId={target.id} heading={element.heading}>
            <a
              href="#"
              data-wikilink={target.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => openLink(e, target.id, element.heading)}
              className="cursor-pointer rounded-[2px] font-medium text-ember-ink underline decoration-ember/35 decoration-dotted underline-offset-4 hover:decoration-solid"
            >
              {label}
            </a>
          </HoverPreview>
        ) : (
          <span
            title={trashed ? "This note is in the trash" : "You can't see this note"}
            className={cn("rounded-[2px] text-muted-foreground", trashed ? "line-through" : "bg-muted px-1 text-xs")}
          >
            {trashed ? label : (
              <>
                <Icon name="lock-keyhole-minimalistic-linear" className="mr-0.5 inline size-3 align-[-1px]" />
                {label}
              </>
            )}
          </span>
        )}
      </span>
      {props.children}
    </PlateElement>
  );
}

export function EmbedElement(props: PlateElementProps<TElement>) {
  const element = props.element as unknown as TEmbed;
  const { binder } = useWorkspace();
  const { index } = useStore(binder);
  const readOnly = useReadOnly();
  const openLink = useOpenLink();
  const target = index.byId.get(element.nodeId);
  const visible = target && !isTrashed(index, target.id);

  return (
    <PlateElement {...props} className="py-1.5">
      <div
        contentEditable={false}
        className="rounded-md border border-l-[3px] border-border border-l-ember/50 bg-muted/30 font-sans select-none"
      >
        <div className="flex h-8 items-center gap-1.5 border-b px-3 text-xs text-muted-foreground">
          <Icon name={visible ? nodeKindMeta[target.kind].icon : "lock-keyhole-minimalistic-linear"} className="size-3.5" />
          <span className="truncate font-medium text-foreground/80">
            {visible ? target.title : "Restricted note"}
            {visible && element.heading && <span className="text-muted-foreground"> › {element.heading}</span>}
          </span>
          {visible && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => openLink(e, target.id, element.heading)}
              className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-accent hover:text-foreground"
            >
              Open
              <Icon name="square-arrow-right-up-linear" className="size-3.5" />
            </button>
          )}
        </div>
        <div className={cn("max-h-[480px] overflow-y-auto px-4 py-2 select-text", !readOnly && "cursor-default")}>
          {visible ? (
            <EmbeddedDocument nodeId={target.id} />
          ) : (
            <p className="py-2 text-sm text-muted-foreground">You don&apos;t have access to this note.</p>
          )}
        </div>
      </div>
      {props.children}
    </PlateElement>
  );
}

const voidInline = { isElement: true, isInline: true, isVoid: true } as const;

export const WikiLinkPlugin = createPlatePlugin({
  key: WIKILINK,
  node: { ...voidInline, isMarkableVoid: true, component: WikiLinkElement },
});

export const EmbedPlugin = createPlatePlugin({
  key: EMBED,
  node: { isElement: true, isVoid: true, component: EmbedElement },
});

/** Typing `[[` (or `![[`) opens the link picker in place. */
export const WikiLinkInputPlugin = createPlatePlugin({
  key: WIKILINK_INPUT,
  node: { ...voidInline, component: WikiLinkInputElement },
}).overrideEditor(({ editor, tf: { insertText } }) => ({
  transforms: {
    insertText(text, options) {
      // Switched off in Customize → Typing: `[[` is just two brackets.
      if (text !== "[" || options?.at || !editor.selection || !editor.api.isCollapsed() || !typingOn(livePrefs.get(), "wikilinks")) return insertText(text, options);
      const before = editor.api.before(editor.selection, { distance: 2, unit: "character" });
      const typed = before ? editor.api.string({ anchor: before, focus: editor.selection.anchor }) : "";
      if (!typed.endsWith("[")) return insertText(text, options);
      const embed = typed === "![" ;
      editor.tf.withoutNormalizing(() => {
        editor.tf.deleteBackward("character");
        if (embed) editor.tf.deleteBackward("character");
        editor.tf.insertNodes({ type: WIKILINK_INPUT, embed, children: [{ text: "" }] } as TWikiLinkInput);
      });
    },
  },
}));

export const WikiLinkKit = [WikiLinkPlugin, WikiLinkInputPlugin, EmbedPlugin];
