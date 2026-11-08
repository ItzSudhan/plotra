"use client";

import { scriptFormats, type ScriptFormat } from "@plotra/db/schema";
import { useShell } from "@/components/workspace/shell-prefs";
import { Icon } from "@plotra/icons";
import { Tooltip } from "@plotra/ui/components/tooltip";
import { cn } from "@plotra/ui/lib/utils";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { storedTitlePage } from "@/components/editor/script/fountain-io";
import { usePrintRequest } from "@/components/io/print-request";
import { StaticDualDialogue } from "@/components/editor/script/static";
import { StaticBlock } from "@/components/workflow/static-doc";
import { useStore } from "@/components/workspace/stores";
import { useWorld } from "@/components/world/data";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import type { DocNode } from "@/lib/doc-index";
import { plainField } from "@/lib/fountain";
import { formatMeta } from "@/lib/modules";
import { read } from "@/lib/read";
import { fitZoom, MAX_ZOOM, MIN_ZOOM, parseZoom, READ_ZOOM_KEY, stepZoom, zoomLabel } from "@/lib/read-zoom";
import { breakSpeech, CHARACTER, COMIC_PAGE, cueName, DIALOGUE, dualPairs, isScriptFormat, keepsWithNext, moreCue, PARENTHETICAL, plainText, sliceBlock, splitDual } from "@/lib/script";
import { ancestors } from "@/lib/tree";
import type { ManuscriptSection } from "@/lib/workflow-actions";
import { EmptyState, Segmented, ToolButton, Toolbar } from "./view-ui";

// Read / Preview (plan.md 2.5): the manuscript paginated like the printed
// page, in standard manuscript format (Shunn: Courier, double-spaced, running
// header) or as a typeset book page. Printing uses the browser's print dialog,
// so a PDF costs nothing. Content is as last synced (a few seconds behind).
// Scripts print in their own formats (plan.md 2.3): a screenplay in Courier 12
// on industry margins, with speeches carried over a page break by (MORE) and
// (CONT'D), and stage, comic and audio scripts in theirs; the element layout
// is the editor's (components/editor/script/script.css). Dual dialogue is one
// piece, two columns as tall as the longer speech, that goes over a page whole
// unless it's taller than a page: then both columns are split in step.

type ScriptRead = Exclude<ScriptFormat, "prose">;
type Format = "manuscript" | "book" | ScriptRead;
const isScript = (format: Format): format is ScriptRead => format !== "manuscript" && format !== "book";

// US Letter, or A4 when the person chose it (Customize → Opening and printing), at 96 dpi with one-inch margins.
const PAPER = { letter: { width: 816, height: 1056 }, a4: { width: 794, height: 1123 } } as const;
const MARGIN = 96;
const HEADER = 40;
// Screenplays and plays leave an inch and a half on the left for the binding.
const leftMargin = (format: Format) => (format === "screenplay" || format === "stageplay" ? 144 : MARGIN);

type Piece =
  | { kind: "title" }
  | { kind: "break" }
  | { kind: "heading"; title: string; level: number }
  | { kind: "scene-break" }
  // `keep`: never the last thing on a page (a scene heading, a character cue).
  | { kind: "block"; block: DocNode; keep?: boolean }
  // Two speeches side by side (`dualPairs`), measured and placed as one. Split over a page,
  // each part is a dual piece of its own, and a column that has ended is empty.
  | { kind: "dual"; left: DocNode[]; right: DocNode[] };

const formatStyles: Record<Format, string> = {
  manuscript: "font-mono text-[12pt] leading-[2] [&_p]:indent-[0.5in] [&_p]:py-0",
  book: "font-prose text-[11.5pt] leading-[1.55] text-justify hyphens-auto [&_p]:indent-[1.5em] [&_p]:py-0",
  // Scripts are set by script.css, from the format on the pages' container.
  screenplay: "script-page",
  stageplay: "script-page",
  comic: "script-page",
  audio: "script-page",
};

export function ReadView({ nodeId }: { nodeId?: string }) {
  const paper = useShell().shell.paper ?? "letter";
  const PAGE_W = PAPER[paper].width;
  const PAGE_H = PAPER[paper].height;
  const CONTENT_H = PAGE_H - MARGIN * 2 - HEADER;
  const { project, binder, user, format: projectFormat, horizon, actions } = useWorkspace();
  // Under a spoiler horizon the manuscript only has what's revealed by then.
  const horizonId = useStore(horizon);
  const asOf = useWorld().data?.releases.find((r) => r.id === horizonId);
  const { index } = useStore(binder);
  const root = nodeId ? index.byId.get(nodeId) : undefined;
  const [sections, setSections] = useState<ManuscriptSection[] | null>(null);
  // The format follows the content (a script opens as a script) until one is picked.
  const [chosen, setChosen] = useState<Format | null>(null);
  const [tick, setTick] = useState(0);
  const [printing, setPrinting] = useState(false);
  // How big the pages look on screen, remembered on this device. Printing ignores it.
  const [zoom, setZoomState] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from localStorage after mount
      setZoomState(parseZoom(localStorage.getItem(READ_ZOOM_KEY)));
    } catch {}
  }, []);
  const setZoom = useCallback((next: number) => {
    setZoomState(next);
    try {
      if (next === 1) localStorage.removeItem(READ_ZOOM_KEY);
      else localStorage.setItem(READ_ZOOM_KEY, String(next));
    } catch {}
  }, []);
  // The pages' column has 32px of padding each side, which zooms with it.
  const fitWidth = () => setZoom(fitZoom(scrollRef.current?.clientWidth ?? 0, PAGE_W + 64));
  const onZoomKey = (e: React.KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
    if (e.key === "=" || e.key === "+") setZoom(stepZoom(zoom, 1));
    else if (e.key === "-" || e.key === "_") setZoom(stepZoom(zoom, -1));
    else if (e.key === "0") setZoom(1);
    else return;
    e.preventDefault();
  };

  // Render the pages into a portal on <body>, print, then take it away (see globals.css).
  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done, { once: true });
    const timer = setTimeout(() => window.print(), 50);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("afterprint", done);
    };
  }, [printing]);

  useEffect(() => {
    let cancelled = false;
    read("getManuscript", project.id, nodeId ?? null, horizonId)
      .then((s) => !cancelled && setSections(s))
      .catch(() => !cancelled && setSections([]));
    return () => {
      cancelled = true;
    };
  }, [horizonId, nodeId, project.id, tick]);

  // Coming back to the window shows the latest writing without asking.
  useEffect(() => {
    const again = () => document.visibilityState === "visible" && setTick((t) => t + 1);
    window.addEventListener("focus", again);
    document.addEventListener("visibilitychange", again);
    return () => {
      window.removeEventListener("focus", again);
      document.removeEventListener("visibilitychange", again);
    };
  }, []);

  const title = root?.title ?? project.title;
  const surname = user.name.split(" ").at(-1) ?? user.name;
  const words = (sections ?? []).reduce((n, s) => n + (index.byId.get(s.id)?.wordCount ?? 0), 0);

  // Which script formats the content is written in, most used first.
  const written = useMemo(() => {
    const counts = new Map<ScriptFormat, number>();
    for (const s of sections ?? []) if (s.value.length && s.kind !== "folder") counts.set(s.format, (counts.get(s.format) ?? 0) + 1);
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    const scripts = [...counts].filter(([f]) => isScriptFormat(f)).sort((a, b) => b[1] - a[1]) as Array<[ScriptRead, number]>;
    const scripted = scripts.reduce((n, [, count]) => n + count, 0);
    return { scripts: scripts.map(([f]) => f), mostly: scripted * 2 > total ? scripts[0][0] : null };
  }, [sections]);
  const format: Format = chosen ?? written.mostly ?? "manuscript";
  const script = isScript(format);
  const formats: Format[] = [
    "manuscript",
    "book",
    ...scriptFormats.filter((f): f is ScriptRead => isScriptFormat(f) && (written.scripts.includes(f) || f === projectFormat || f === format)),
  ];
  // An imported script keeps its title page (credit, author, contact) on its folder.
  const titlePage = storedTitlePage(root, root ? ancestors(index, root.id) : []);
  const field = (key: string) => (titlePage && plainField(titlePage, key)) || null;

  const pieces = useMemo<Piece[]>(() => {
    const out: Piece[] = [{ kind: "title" }];
    let lastWasScene = false;
    for (const s of sections ?? []) {
      const structural = s.kind === "folder" || s.kind === "chapter";
      // A screenplay or audio script runs on from scene to scene: its sections aren't printed.
      if (structural && (format === "screenplay" || format === "audio")) {
        lastWasScene = false;
      } else if (structural) {
        // Chapters start on a new page.
        if (s.kind === "chapter" || s.depth === 0) out.push({ kind: "break" });
        out.push({ kind: "heading", title: s.title, level: s.kind === "folder" ? 1 : 2 });
        lastWasScene = false;
      } else if (lastWasScene && s.value.length && !script) {
        out.push({ kind: "scene-break" });
      }
      const blocks = s.value.filter((b) => (b.children ?? []).length || b.type === "hr" || b.type === "img");
      const pairs = new Map(script ? dualPairs(blocks).map((pair) => [pair.start, pair]) : []);
      for (let b = 0; b < blocks.length; b++) {
        const block = blocks[b];
        const pair = pairs.get(b);
        if (pair) {
          out.push({ kind: "dual", left: blocks.slice(pair.start, pair.split), right: blocks.slice(pair.split, pair.end) });
          b = pair.end - 1;
        }
        // In a script a rule is a page break (Fountain's "==="), and each comic page starts a new sheet.
        else if (script && block.type === "hr") out.push({ kind: "break" });
        else {
          if (format === "comic" && block.type === COMIC_PAGE) out.push({ kind: "break" });
          out.push({ kind: "block", block, ...(script && keepsWithNext(block.type) && { keep: true }) });
        }
      }
      if (!structural && blocks.length) lastWasScene = true;
    }
    return out;
  }, [format, script, sections]);

  // Measure every piece off-screen, then pack them into pages. A screenplay's speech that
  // doesn't fit at the foot of a page is split between sentences (or words), with "(MORE)" under the
  // first part and the cue repeated with "(CONT'D)" over the rest, as on a printed script, and
  // so is each column of dual dialogue, in step, when the pair is taller than the page.
  // Those pieces exist only in the layout: `extra` holds them, numbered after `pieces`.
  const measureRef = useRef<HTMLDivElement>(null);
  // The layout remembers the pieces it was made for: after a format switch, the render before
  // the new layout lands would otherwise look up pieces by the old numbering and find none.
  const [layout, setLayout] = useState<{ pieces: Piece[]; pages: number[][]; extra: Piece[] }>({ pieces: [], pages: [], extra: [] });
  const current = layout.pieces === pieces;
  const pages = current ? layout.pages : [];
  const all = useMemo(() => [...pieces, ...(current ? layout.extra : [])], [pieces, current, layout.extra]);
  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el || !sections) return;
    const children = [...el.children] as HTMLElement[];
    const outer = (child: HTMLElement) => {
      const style = getComputedStyle(child);
      return child.offsetHeight + parseFloat(style.marginTop) + parseFloat(style.marginBottom);
    };
    const heights = children.map(outer);
    const extra: Piece[] = [];
    const add = (piece: Piece) => pieces.length + extra.push(piece) - 1;
    /** The height `text` would take set like the element at `i`. */
    const probe = (i: number, text: string) => {
      const copy = children[i].cloneNode(false) as HTMLElement;
      copy.textContent = text;
      el.appendChild(copy);
      const h = outer(copy);
      copy.remove();
      return h;
    };
    /** The cue a line of dialogue belongs to: the last one before it. */
    const cueFor = (i: number) => {
      for (let j = i - 1; j >= 0; j--) {
        const p = pieces[j];
        if (p.kind !== "block") return null;
        if (p.block.type === CHARACTER) return { index: j, name: cueName(plainText(p.block)) };
        if (p.block.type !== DIALOGUE && p.block.type !== PARENTHETICAL) return null;
      }
      return null;
    };

    const out: number[][] = [];
    let page: number[] = [];
    let used = 0;
    /**
     * Splits a speech at the foot of the page, if two lines or more of it fit there, and again
     * at the foot of each page after while the rest is longer than a page. True when it did.
     */
    const split = (i: number, piece: Extract<Piece, { kind: "block" }>) => {
      const cue = cueFor(i);
      if (format !== "screenplay" || piece.block.type !== DIALOGUE || !cue) return false;
      const lineHeight = parseFloat(getComputedStyle(children[i]).lineHeight) || 16;
      const cueHeight = heights[cue.index] ?? lineHeight;
      let block = piece.block;
      let didSplit = false;
      for (;;) {
        // Room for the first part and its "(MORE)".
        const room = CONTENT_H - used - cueHeight;
        if (room < lineHeight * 2) break;
        // Between sentences where one fits, else between words.
        const at = breakSpeech(plainText(block), (part) => probe(i, part) <= room);
        if (!at) break;
        page.push(add({ kind: "block", block: sliceBlock(block, 0, at[0]) }), add({ kind: "block", block: { type: CHARACTER, children: [{ text: "(MORE)" }] } }));
        out.push(page);
        block = sliceBlock(block, at[1]);
        page = [add({ kind: "block", block: { type: CHARACTER, children: [{ text: `${cue.name} (CONT'D)` }] }, keep: true })];
        used = cueHeight;
        didSplit = true;
        if (probe(i, plainText(block)) <= CONTENT_H - used) break;
      }
      if (!didSplit) return false;
      page.push(add({ kind: "block", block }));
      used += probe(i, plainText(block));
      return true;
    };

    /** The height of a column of dual dialogue holding `blocks`, set like the pair at `i`. */
    const probeColumn = (i: number, blocks: DocNode[]) => {
      if (!blocks.length) return 0;
      const copy = children[i].cloneNode(true) as HTMLElement;
      const [column, other] = [...copy.children] as HTMLElement[];
      // Each element set like the first of its kind in the pair.
      const templates = new Map<unknown, HTMLElement>();
      for (const node of [...column.children, ...(other?.children ?? [])] as HTMLElement[]) {
        const type = [...node.classList].find((c) => c.startsWith("script-") && c !== "script-el")?.slice("script-".length);
        if (type && !templates.has(type)) templates.set(type, node);
      }
      column.replaceChildren(
        ...blocks.map((block) => {
          const node = (templates.get(block.type) ?? column.firstElementChild ?? document.createElement("p")).cloneNode(false) as HTMLElement;
          node.textContent = plainText(block);
          return node;
        }),
      );
      other?.replaceChildren();
      el.appendChild(copy);
      const h = column.offsetHeight;
      copy.remove();
      return h;
    };
    /**
     * Splits a dual-dialogue pair in step, both columns at once, over as many pages as it takes,
     * starting in the room left on this page. True when it did.
     */
    const splitPair = (i: number, piece: Extract<Piece, { kind: "dual" }>, foot: boolean) => {
      const top = parseFloat(getComputedStyle(children[i]).marginTop) || 0;
      const room = CONTENT_H - used - top;
      if (foot) {
        // As with a single speech: only when the cue, two lines and "(MORE)" fit at the foot.
        const line = children[i].querySelector<HTMLElement>(".script-dialogue");
        const lineHeight = (line && parseFloat(getComputedStyle(line).lineHeight)) || 16;
        if (room < probeColumn(i, [piece.left[0], moreCue()]) + lineHeight * 2) return false;
      }
      const parts = splitDual(piece.left, piece.right, (column, n) => probeColumn(i, column) <= (n === 0 ? room : CONTENT_H - top));
      if (!parts || parts.length < 2) return false;
      parts.forEach(([left, right], n) => {
        if (n > 0) {
          out.push(page);
          page = [];
          used = 0;
        }
        page.push(add({ kind: "dual", left, right }));
      });
      const [left, right] = parts.at(-1)!;
      used += top + Math.max(probeColumn(i, left), probeColumn(i, right));
      return true;
    };

    pieces.forEach((piece, i) => {
      const h = heights[i] ?? 0;
      if (piece.kind === "title") {
        out.push([i]);
        return;
      }
      if (piece.kind === "break") {
        if (page.length) out.push(page);
        page = [];
        used = 0;
        return;
      }
      if (used + h > CONTENT_H && page.length) {
        if (piece.kind === "block" && split(i, piece)) return;
        if (piece.kind === "dual" && format === "screenplay" && splitPair(i, piece, true)) return;
        // Headings and cues at the foot of the page go over with what they introduce.
        const carried: number[] = [];
        while (page.length > 1) {
          const last = page.at(-1)!;
          const lastPiece = last < pieces.length ? pieces[last] : extra[last - pieces.length];
          if (lastPiece.kind !== "block" || !lastPiece.keep) break;
          carried.unshift(page.pop()!);
        }
        out.push(page);
        page = carried;
        used = carried.reduce((sum, j) => sum + (heights[j] ?? 0), 0);
      }
      // A pair taller than the page is split rather than cut off at the foot.
      if (piece.kind === "dual" && used + h > CONTENT_H && splitPair(i, piece, false)) return;
      page.push(i);
      used += h;
    });
    if (page.length) out.push(page);
    setLayout({ pieces, pages: out, extra });
  }, [format, pieces, sections, CONTENT_H, PAGE_W]);

  // "Export as PDF" (components/io/export-dialog.tsx) opens this view and prints once the pages are laid out.
  usePrintRequest(nodeId ?? null, sections !== null && pages.length > 0, () => setPrinting(true));

  const renderPiece = (piece: Piece, i: number) => {
    switch (piece.kind) {
      case "title":
        if (script) {
          return (
            <div key={i} className="flex h-full flex-col">
              <div className="mt-[3in] text-center">
                <p className="uppercase underline">{title}</p>
                <p className="mt-[2em]">{field("Credit") ?? "Written by"}</p>
                <p className="mt-[1em] whitespace-pre-line">{field("Author") ?? field("Authors") ?? user.name}</p>
                {field("Source") && <p className="mt-[2em] whitespace-pre-line">{field("Source")}</p>}
              </div>
              <div className="mt-auto flex items-end justify-between gap-8 whitespace-pre-line">
                <span>{field("Contact") ?? user.email}</span>
                <span className="text-right">{field("Draft date") ?? field("Date")}</span>
              </div>
            </div>
          );
        }
        return (
          <div key={i} className="flex h-full flex-col">
            {/* Contact details and word count belong on a submission manuscript, not a book page. */}
            {format === "manuscript" && (
              <div className="flex justify-between text-[11pt] leading-snug">
                <span>
                  {user.name}
                  <br />
                  {user.email}
                </span>
                <span>about {Math.max(100, Math.round(words / 100) * 100).toLocaleString()} words</span>
              </div>
            )}
            <div className="mt-[3in] text-center">
              <p className={cn(format === "book" ? "font-display text-[28pt]" : "text-[12pt] uppercase")}>{title}</p>
              <p className="mt-6 text-[12pt]">by {user.name}</p>
            </div>
          </div>
        );
      case "break":
        return null;
      case "heading":
        return (
          <h2 key={i} className={cn("text-center", format === "book" ? "mt-[1in] mb-8 font-display text-[22pt]" : "mt-[2in] mb-6 text-[12pt] uppercase", piece.level === 2 && format === "book" && "text-[18pt]", script && "font-normal underline")}>
            {piece.title}
          </h2>
        );
      case "dual": {
        const ctx = { index, citationStyle: project.settings.citationStyle };
        const column = (blocks: DocNode[]) => blocks.map((block, j) => <StaticBlock key={j} block={block} ctx={ctx} />);
        return <StaticDualDialogue key={i} left={column(piece.left)} right={column(piece.right)} />;
      }
      case "scene-break":
        return (
          <p key={i} className="my-2 text-center !indent-0">
            {format === "book" ? "⁂" : "#"}
          </p>
        );
      default:
        return <StaticBlock key={i} block={piece.block} ctx={{ index, citationStyle: project.settings.citationStyle }} />;
    }
  };

  const pageViews = pages.map((page, n) => (
              <article
                key={n}
                style={{ width: PAGE_W, height: PAGE_H, padding: MARGIN, paddingTop: MARGIN - HEADER / 2, paddingLeft: leftMargin(format) }}
                className="relative overflow-hidden bg-white text-black shadow-[0_2px_12px_rgb(0_0_0/0.15)] print:break-after-page print:shadow-none"
              >
                {n > 0 && (
                  <header className="flex h-[40px] justify-end text-[10pt] text-black/70">
                    {/* A script numbers its pages from the second, top right; the title page doesn't count. */}
                    {script ? (
                      n > 1 && <span className="text-[12pt] text-black">{n}.</span>
                    ) : format === "manuscript" ? (
                      `${surname} / ${title} / ${n + 1}`
                    ) : (
                      <span className="mx-auto font-prose italic">{title}</span>
                    )}
                  </header>
                )}
                <div className={cn(formatStyles[format], "h-full")}>{page.map((i) => renderPiece(all[i], i))}</div>
                {format === "book" && n > 0 && <footer className="absolute inset-x-0 bottom-10 text-center font-prose text-[10pt] text-black/60">{n + 1}</footer>}
              </article>
            ));

  if (sections === null) return <div className="m-6 h-40 animate-pulse rounded-lg bg-muted" />;

  return (
    // ⌘/Ctrl +, − and 0 zoom the pages while focus is anywhere in the view.
    <div className="flex h-full flex-col" onKeyDown={onZoomKey}>
      <Toolbar className="print:hidden">
        <Icon name="book-linear" className="size-4 text-muted-foreground" />
        <span className="font-medium">{title}</span>
        <span className="text-muted-foreground">
          · {pages.length} pages · {words.toLocaleString()} words
        </span>
        {asOf && (
          <Tooltip content="Only what's revealed by this release is shown.">
            <span tabIndex={0} className="flex shrink-0 items-center gap-1 rounded bg-ember/15 px-1.5 text-xs text-ember-ink outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
              <Icon name="eye-linear" className="size-3.5" />
              As of {asOf.title}
            </span>
          </Tooltip>
        )}
        <span className="ml-auto" />
        <Segmented
          value={format}
          onChange={setChosen}
          options={formats.map((f) => ({ value: f, label: isScript(f) ? formatMeta[f].label : f === "book" ? "Book" : "Submission format (Courier)" }))}
        />
        <div role="group" aria-label="Zoom" className="flex shrink-0 items-center">
          <ToolButton icon="magnifer-zoom-out-linear" label="Zoom out" shortcut="⌘−" disabled={zoom <= MIN_ZOOM} onClick={() => setZoom(stepZoom(zoom, -1))} />
          <Tooltip content="Back to 100%" shortcut="⌘0">
            <button
              type="button"
              aria-label={`Zoom ${zoomLabel(zoom)}. Reset to 100%`}
              onClick={() => setZoom(1)}
              className="h-8 min-w-12 rounded-md px-1 text-meta text-muted-foreground tabular-nums outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 pointer-coarse:h-10"
            >
              {zoomLabel(zoom)}
            </button>
          </Tooltip>
          <ToolButton icon="magnifer-zoom-in-linear" label="Zoom in" shortcut="⌘+" disabled={zoom >= MAX_ZOOM} onClick={() => setZoom(stepZoom(zoom, 1))} />
          <ToolButton icon="maximize-square-linear" label="Fit the page to the width of the view" onClick={fitWidth}>
            Fit width
          </ToolButton>
        </div>
        <Tooltip content="Show the latest writing. Pages also refresh when you come back to this window.">
          <span className="flex">
            <ToolButton icon="refresh-linear" label="Refresh pages" onClick={() => setTick((t) => t + 1)}>
              Refresh pages
            </ToolButton>
          </span>
        </Tooltip>
        <ToolButton icon="printer-linear" label="Print or save as PDF" onClick={() => setPrinting(true)}>
          Print / PDF
        </ToolButton>
      </Toolbar>
      {sections.length === 0 ? (
        <EmptyState
          icon="book-bold-duotone"
          title="Nothing to read yet"
          action={(root ?? project).actions.includes("edit") && { label: "New scene", onClick: () => void actions.create("scene", root?.id) }}
        >
          Write some scenes and they&apos;ll appear here, paginated.
        </EmptyState>
      ) : (
        <div
          ref={scrollRef}
          tabIndex={0}
          role="region"
          aria-label="Pages"
          className="min-h-0 flex-1 overflow-auto bg-muted/50 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset print:overflow-visible print:bg-transparent"
        >
          {/* Off-screen copy for measuring, at the page's text width. */}
          <div aria-hidden className="pointer-events-none invisible absolute -left-[9999px] top-0 script-doc script-paged" data-script-format={script ? format : undefined}>
            <div ref={measureRef} style={{ width: PAGE_W - MARGIN - leftMargin(format) }} className={formatStyles[format]}>
              {pieces.map((p, i) => (p.kind === "title" || p.kind === "break" ? <div key={i} /> : renderPiece(p, i)))}
            </div>
          </div>
          {/* `script-doc` numbers comic pages and panels across the sheets, whatever the format. */}
          {/* CSS zoom scales layout too, so scrolling stays right; the measuring copy and the print portal stay at 100%. */}
          <div className="mx-auto grid w-fit gap-6 px-8 py-8 script-doc script-paged print:[zoom:1]!" style={{ zoom }} data-script-format={script ? format : undefined}>
            {pageViews}
          </div>
          {printing &&
            createPortal(
              <div className="plotra-print-portal script-doc script-paged" data-script-format={script ? format : undefined}>
                {/* The sheet the printer is asked for matches the pages (globals.css says Letter). */}
                {paper === "a4" && <style>{"@media print { @page { size: A4; margin: 0; } }"}</style>}
                {pageViews}
              </div>,
              document.body,
            )}
        </div>
      )}
    </div>
  );
}
