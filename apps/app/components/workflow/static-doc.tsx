"use client";

import { cn } from "@plotra/ui/lib/utils";
import { StaticDualDialogue, StaticScriptBlock } from "@/components/editor/script/static";
import type { DocNode } from "@/lib/doc-index";
import { CITATION, EMBED, WIKILINK } from "@/lib/doc-index";
import { StaticCitation } from "@/components/research/cite";
import type { CitationStyle } from "@/lib/citations";
import { dualPairs, isScriptElement, SCRIPT_NOTE } from "@/lib/script";
import type { NodeIndex } from "@/lib/tree";

// Renders a Plate value without an editor: for version previews and the
// paginated Read view, where dozens of live editors would be far too heavy.

/** `citationStyle` is the project's (`project.settings.citationStyle`); APA when it isn't given. */
type Ctx = { index?: NodeIndex; citationStyle?: CitationStyle };

function Leaf({ leaf }: { leaf: DocNode }) {
  let out: React.ReactNode = leaf.text as string;
  if (leaf.code) out = <code className="rounded bg-muted px-[0.3em] font-mono text-[0.85em]">{out}</code>;
  if (leaf.bold) out = <strong className="font-semibold">{out}</strong>;
  if (leaf.italic) out = <em>{out}</em>;
  if (leaf.underline) out = <u>{out}</u>;
  if (leaf.strikethrough) out = <s>{out}</s>;
  if (leaf.highlight) out = <mark className="rounded-[2px] bg-gold/25 text-inherit">{out}</mark>;
  // A script note shows in previews and is left off the printed page (script.css).
  if (leaf[SCRIPT_NOTE]) out = <span className="script-note">{out}</span>;
  return <>{out}</>;
}

function Inlines({ nodes, ctx }: { nodes: DocNode[]; ctx: Ctx }) {
  return (
    <>
      {nodes.map((n, i) => {
        if (typeof n.text === "string") return <Leaf key={i} leaf={n} />;
        if (n.type === WIKILINK) {
          const target = ctx.index?.byId.get(String(n.nodeId));
          const label = (n.alias as string) || target?.title || "Missing note";
          return (
            <span key={i} className="text-ember-ink">
              {label}
            </span>
          );
        }
        if (n.type === CITATION) {
          return <StaticCitation key={i} nodeId={String(n.nodeId)} locator={typeof n.locator === "string" ? n.locator : undefined} index={ctx.index} style={ctx.citationStyle} />;
        }
        if (n.type === "a") {
          return (
            <a key={i} href={String(n.url ?? "#")} target="_blank" rel="noreferrer noopener" className="text-ember-ink underline underline-offset-2">
              <Inlines nodes={n.children ?? []} ctx={ctx} />
            </a>
          );
        }
        return <Inlines key={i} nodes={n.children ?? []} ctx={ctx} />;
      })}
    </>
  );
}

export function StaticBlock({ block, ctx = {} }: { block: DocNode; ctx?: Ctx }) {
  const children = <Inlines nodes={block.children ?? []} ctx={ctx} />;
  const indent = typeof block.indent === "number" ? block.indent : 0;
  const style = indent ? { marginLeft: `${(indent - (block.listStyleType ? 1 : 0)) * 1.5}em` } : undefined;

  if (block.listStyleType) {
    const todo = block.listStyleType === "todo";
    const ordered = block.listStyleType === "decimal";
    const Tag = ordered ? "ol" : "ul";
    return (
      <Tag style={{ ...style, listStyleType: todo ? "none" : String(block.listStyleType) }} start={block.listStart as number | undefined} className="my-0 pl-6">
        <li className={cn(todo && block.checked ? "text-muted-foreground line-through" : undefined)}>
          {todo && <span className="mr-1.5">{block.checked ? "☑" : "☐"}</span>}
          {children}
        </li>
      </Tag>
    );
  }
  // Script elements (scene heading, cue, dialogue…) are laid out by script.css.
  if (isScriptElement(block.type)) return <StaticScriptBlock block={block}>{children}</StaticScriptBlock>;
  switch (block.type) {
    case "h1":
      return <h1 className="mt-8 mb-2 font-display text-3xl leading-tight">{children}</h1>;
    case "h2":
      return <h2 className="mt-6 mb-1.5 font-display text-2xl leading-tight">{children}</h2>;
    case "h3":
      return <h3 className="mt-4 mb-1 text-lg font-semibold">{children}</h3>;
    case "blockquote":
      return <blockquote className="my-2 border-l-2 border-border pl-4 italic">{children}</blockquote>;
    case "hr":
      return <hr className="my-6 border-border" />;
    case "callout":
      return (
        <div className="my-2 rounded-md bg-muted px-4 py-3">
          {(block.children ?? []).some((c) => typeof c.text !== "string") ? <StaticValue value={block.children ?? []} ctx={ctx} /> : children}
        </div>
      );
    case "img":
      // eslint-disable-next-line @next/next/no-img-element -- user-supplied image URLs
      return <img src={String(block.url ?? "")} alt={String(block.alt ?? "")} className="my-3 max-w-full rounded-md" />;
    case "table":
      return (
        <table className="my-3 w-full border-collapse text-[0.92em]">
          <tbody>
            {(block.children ?? []).map((row, r) => (
              <tr key={r}>
                {(row.children ?? []).map((cell, c) => {
                  const Cell = cell.type === "th" ? "th" : "td";
                  return (
                    <Cell key={c} className="border border-border px-2 py-1 align-top">
                      <StaticValue value={cell.children ?? []} ctx={ctx} />
                    </Cell>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case EMBED: {
      const target = ctx.index?.byId.get(String(block.nodeId));
      return <p className="my-2 rounded-md border px-3 py-2 text-sm text-muted-foreground">Embedded: {target?.title ?? "a note"}</p>;
    }
    default:
      return (
        <p style={style} className="my-0 py-1">
          {children}
        </p>
      );
  }
}

export function StaticValue({ value, ctx = {} }: { value: DocNode[]; ctx?: Ctx }) {
  // Dual dialogue: the two speeches of a pair go side by side.
  const pairs = new Map(dualPairs(value).map((pair) => [pair.start, pair]));
  const out: React.ReactNode[] = [];
  const blocks = (from: number, to: number) => value.slice(from, to).map((block, j) => <StaticBlock key={from + j} block={block} ctx={ctx} />);
  for (let i = 0; i < value.length; i++) {
    const pair = pairs.get(i);
    if (pair) {
      out.push(<StaticDualDialogue key={i} left={blocks(pair.start, pair.split)} right={blocks(pair.split, pair.end)} />);
      i = pair.end - 1;
    } else out.push(<StaticBlock key={i} block={value[i]} ctx={ctx} />);
  }
  return <>{out}</>;
}

// ---- Diffs ------------------------------------------------------------------------

/** Plain text of a block, for comparing versions. */
export function blockText(block: DocNode): string {
  if (typeof block.text === "string") return block.text;
  if (block.type === WIKILINK) return `[[${String(block.alias ?? block.nodeId)}]]`;
  if (block.type === CITATION) return `[@${String(block.nodeId)}${block.locator ? `, ${String(block.locator)}` : ""}]`;
  if (block.type === "hr") return "———";
  if (block.type === "img") return `[image ${String(block.url ?? "")}]`;
  return (block.children ?? []).map(blockText).join(block.type === "table" || block.type === "tr" ? " | " : "");
}

export type DiffPart<T> = { kind: "same" | "added" | "removed"; item: T };

/** Longest-common-subsequence diff of two lists. */
export function diffLists<T>(a: T[], b: T[], key: (item: T) => string): DiffPart<T>[] {
  const ka = a.map(key);
  const kb = b.map(key);
  // Trim the common start and end first: most versions differ in a few places.
  let start = 0;
  while (start < ka.length && start < kb.length && ka[start] === kb[start]) start++;
  let endA = ka.length;
  let endB = kb.length;
  while (endA > start && endB > start && ka[endA - 1] === kb[endB - 1]) {
    endA--;
    endB--;
  }
  const n = endA - start;
  const m = endB - start;
  const out: DiffPart<T>[] = a.slice(0, start).map((item) => ({ kind: "same" as const, item }));
  if (n * m > 4_000_000) {
    // Too large to compare finely: everything in between changed.
    out.push(...a.slice(start, endA).map((item) => ({ kind: "removed" as const, item })));
    out.push(...b.slice(start, endB).map((item) => ({ kind: "added" as const, item })));
  } else {
    const table = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        table[i][j] = ka[start + i] === kb[start + j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && ka[start + i] === kb[start + j]) {
        out.push({ kind: "same", item: a[start + i] });
        i++;
        j++;
      } else if (j < m && (i === n || table[i][j + 1] >= table[i + 1][j])) {
        out.push({ kind: "added", item: b[start + j] });
        j++;
      } else {
        out.push({ kind: "removed", item: a[start + i] });
        i++;
      }
    }
  }
  out.push(...a.slice(endA).map((item) => ({ kind: "same" as const, item })));
  return out;
}

/** Word-level diff of two strings, for a paragraph that changed. */
export function WordDiff({ before, after }: { before: string; after: string }) {
  const split = (s: string) => s.match(/\s+|[^\s]+/g) ?? [];
  const parts = diffLists(split(before), split(after), (w) => w);
  return (
    <>
      {parts.map((p, i) =>
        p.kind === "same" ? (
          <span key={i}>{p.item}</span>
        ) : p.kind === "added" ? (
          <ins key={i} className="bg-teal/20 text-teal-ink no-underline">
            {p.item}
          </ins>
        ) : (
          <del key={i} className="bg-destructive/10 text-destructive">
            {p.item}
          </del>
        ),
      )}
    </>
  );
}

/** What changed between two versions of a document, paragraph by paragraph. */
export function DocDiff({ before, after }: { before: DocNode[]; after: DocNode[] }) {
  const parts = diffLists(before, after, blockText);
  const rows: React.ReactNode[] = [];
  let unchanged = 0;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const next = parts[i + 1];
    if (p.kind === "same") {
      unchanged++;
      rows.push(
        <p key={i} className="py-1 text-muted-foreground">
          {blockText(p.item) || " "}
        </p>,
      );
      continue;
    }
    // A removed paragraph followed by an added one is usually an edit: show it word by word.
    if (next && ((p.kind === "removed" && next.kind === "added") || (p.kind === "added" && next.kind === "removed"))) {
      const [was, now] = p.kind === "removed" ? [p.item, next.item] : [next.item, p.item];
      rows.push(
        <p key={i} className="rounded-sm bg-gold/10 px-1 py-1">
          <WordDiff before={blockText(was)} after={blockText(now)} />
        </p>,
      );
      i++;
      continue;
    }
    rows.push(
      <p
        key={i}
        className={cn("rounded-sm px-1 py-1", p.kind === "added" ? "bg-teal/15 text-teal-ink" : "bg-destructive/10 text-destructive line-through")}
      >
        {blockText(p.item) || " "}
      </p>,
    );
  }
  if (unchanged === parts.length) return <p className="py-4 text-center text-sm text-muted-foreground">No differences.</p>;
  return <div>{rows}</div>;
}
