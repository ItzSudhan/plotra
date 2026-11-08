"use client";

import { SuggestionPlugin } from "@platejs/suggestion/react";
import { Icon } from "@plotra/icons";
import { Plate, PlateContent } from "platejs/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { RemoteCursors } from "@/components/collab/remote-cursors";
import { useCollabEditor } from "@/components/collab/use-collab-editor";
import { EditorKit } from "@/components/editor/editor-kit";
import { CurrentDocument } from "@/components/editor/current-document";
import { StatusDot } from "@/components/workspace/status";
import { useEditorStyle } from "@/components/workspace/shell-prefs";
import { useStore } from "@/components/workspace/stores";
import { useUi, useWorkspace } from "@/components/workspace/workspace-provider";
import { colorFor } from "@/lib/colors";
import { ancestors, flatten, nodeKindMeta, type BinderNode } from "@/lib/tree";
import { EmptyState, Toolbar } from "./view-ui";
import { useVocabulary } from "@/components/workspace/vocabulary";

// Manuscript / Scrivenings (plan.md 2.5): every document in a folder stitched
// into one continuous page, each section a live, collaborative editor of its
// own note. Sections connect as they scroll into view, so long manuscripts
// don't open hundreds of rooms at once.

const textKinds = new Set(["chapter", "scene", "note", "character", "location", "research"]);

export function ManuscriptView({ nodeId }: { nodeId?: string }) {
  const { binder, project, actions } = useWorkspace();
  const { column } = useEditorStyle();
  const { index } = useStore(binder);
  const root = nodeId ? index.byId.get(nodeId) : undefined;
  const sections = useMemo(
    () => (root ? [root, ...flatten(index, root.id)] : flatten(index)).filter((n) => textKinds.has(n.kind) || n.kind === "folder"),
    [index, root],
  );
  const words = sections.reduce((n, s) => n + s.wordCount, 0);

  return (
    <div className="flex h-full flex-col">
      <Toolbar>
        <Icon name="documents-linear" className="size-4 text-muted-foreground" />
        <span className="font-medium">{root ? root.title : project.title}</span>
        <span className="text-muted-foreground">
          · {sections.filter((s) => s.kind !== "folder").length} sections · {words.toLocaleString()} words
        </span>
      </Toolbar>
      {sections.length === 0 ? (
        <EmptyState
          icon="book-bold-duotone"
          title="Nothing to stitch together"
          action={(root ?? project).actions.includes("edit") && { label: "New scene", onClick: () => void actions.create("scene", root?.id) }}
        >
          Add chapters and scenes{root ? ` inside ${root.title}` : ""}; they appear here as one continuous manuscript.
        </EmptyState>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[44rem] pt-10 pb-[30vh]" style={column}>
            {sections.map((n) => (
              <Section key={n.id} node={n} depth={root ? ancestors(index, n.id).length - ancestors(index, root.id).length : ancestors(index, n.id).length} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ node, depth }: { node: BinderNode; depth: number }) {
  const { openNode } = useWorkspace();
  const words = useVocabulary();
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    const observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setVisible(true), { rootMargin: "600px 0px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  const heading = node.kind === "folder" || node.kind === "chapter";
  return (
    <section ref={ref} className="group/section relative px-6 sm:px-12">
      <header className={heading ? "mt-14 mb-3" : "mt-8 mb-1 border-t border-dashed pt-5"}>
        <button
          type="button"
          onClick={(e) => openNode(node.id, e.metaKey || e.ctrlKey ? "tab" : "split")}
          aria-label={`Open ${node.title || "this section"} on its own`}
          className="group/open flex min-h-8 items-center gap-1.5 rounded text-left text-xs text-faint outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Icon name={nodeKindMeta[node.kind].icon} className="size-3.5" />
          {words.label(node.kind)}
          <StatusDot status={node.status} />
          <span className="opacity-0 group-hover/section:opacity-100 group-focus-visible/open:opacity-100 pointer-coarse:opacity-100">Open ↗</span>
        </button>
        <h2 className={heading ? (depth === 0 ? "font-display text-4xl" : "font-display text-3xl") : "font-display text-2xl text-muted-foreground"}>{node.title}</h2>
      </header>
      {node.kind === "folder" ? null : visible ? (
        <SectionEditor node={node} />
      ) : (
        <div style={{ minHeight: Math.min(1200, 40 + node.wordCount * 0.45) }} className="animate-pulse rounded bg-muted/40" />
      )}
    </section>
  );
}

function SectionEditor({ node }: { node: BinderNode }) {
  const look = useEditorStyle();
  const { project, user } = useWorkspace();
  const { suggesting } = useUi();
  const canEdit = node.actions.includes("edit");
  const { editor, ready } = useCollabEditor({
    projectId: project.id,
    room: `node-${node.id}`,
    plugins: EditorKit,
    user: useMemo(() => ({ name: user.name, color: colorFor(user.id) }), [user.id, user.name]),
    readOnly: !canEdit,
  });
  useEffect(() => {
    editor.setOption(SuggestionPlugin, "currentUserId", user.id);
    editor.setOption(SuggestionPlugin, "isSuggesting", canEdit && suggesting);
  }, [canEdit, editor, suggesting, user.id]);

  if (!ready) return <div className="h-16 animate-pulse rounded bg-muted/40" />;
  return (
    <CurrentDocument value={{ nodeId: node.id }}>
      <Plate editor={editor} readOnly={!canEdit}>
        <PlateContent
          aria-label={`${node.title} section`}
          readOnly={!canEdit}
          disableDefaultStyles
          placeholder={canEdit ? "Empty. Start writing…" : undefined}
          data-paragraphs={look.paragraphs}
          style={look.text}
          className="relative font-prose text-[1.0625rem] leading-[1.75] whitespace-pre-wrap break-words caret-ember outline-none [&_[data-slate-placeholder]]:text-faint [&_[data-slate-placeholder]]:!opacity-100 [&_strong]:font-semibold"
          renderEditable={(editable) => (
            <>
              {editable}
              <RemoteCursors />
            </>
          )}
        />
      </Plate>
    </CurrentDocument>
  );
}
