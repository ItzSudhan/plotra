"use client";

import { useStore } from "@/components/workspace/stores";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import {
  DEFAULT_CITATION_STYLE,
  formatInText,
  formatReference,
  isCitationStyle,
  sourceFromNode,
  yearSuffixes,
  type CitationStyle,
  type Run,
  type Source,
} from "@/lib/citations";
import { flatten, type BinderNode, type NodeIndex } from "@/lib/tree";

// The project's sources as the editor, the sources view and static renderings
// see them (plan.md 2.8): every live research note, read as a bibliographic
// record (lib/citations.ts).

export type ProjectSources = {
  /** Research notes, in binder order. */
  nodes: BinderNode[];
  sources: Source[];
  byId: Map<string, Source>;
  /** Letters for works by the same authors in the same year (2019a, 2019b). */
  suffixes: Map<string, string>;
};

const cache = new WeakMap<NodeIndex, ProjectSources>();

/** The sources in a binder. Kept per index, so every citation on a page shares one reading of it. */
export function sourcesOf(index: NodeIndex): ProjectSources {
  let found = cache.get(index);
  if (!found) {
    const nodes = flatten(index).filter((n) => n.kind === "research");
    const sources = nodes.map(sourceFromNode);
    found = { nodes, sources, byId: new Map(sources.map((s) => [s.id, s])), suffixes: yearSuffixes(sources) };
    cache.set(index, found);
  }
  return found;
}

export function useSources(): ProjectSources {
  const { binder } = useWorkspace();
  return sourcesOf(useStore(binder).index);
}

/** The citation style the project is written in. */
export function useCitationStyle(): CitationStyle {
  const style = useWorkspace().project.settings.citationStyle;
  return isCitationStyle(style) ? style : DEFAULT_CITATION_STYLE;
}

/** Formatted reference text: titles in italics, and links you can follow when `links` is set. */
export function Runs({ runs, links = false }: { runs: Run[]; links?: boolean }) {
  return (
    <>
      {runs.map((run, i) =>
        run.href && links && /^https?:\/\//i.test(run.href) ? (
          <a key={i} href={run.href} target="_blank" rel="noreferrer noopener" className="break-all text-ember-ink hover:underline">
            {run.text}
          </a>
        ) : run.italic ? (
          <i key={i}>{run.text}</i>
        ) : (
          <span key={i} className={run.href ? "break-all" : undefined}>
            {run.text}
          </span>
        ),
      )}
    </>
  );
}

/** A source's full reference in a style. */
export function Reference({ source, style, suffix, links }: { source: Source; style: CitationStyle; suffix?: string; links?: boolean }) {
  return <Runs runs={formatReference(source, style, { suffix })} links={links} />;
}

/**
 * A citation outside an editor (version previews, the Read view, exports):
 * the in-text form, from whatever binder index the caller has.
 */
export function StaticCitation({ nodeId, locator, index, style = DEFAULT_CITATION_STYLE }: { nodeId: string; locator?: string; index?: NodeIndex; style?: CitationStyle }) {
  const found = index ? sourcesOf(index) : null;
  const source = found?.byId.get(nodeId);
  if (!source) return <span className="text-muted-foreground">(source unavailable)</span>;
  return <Runs runs={formatInText(source, style, { locator, suffix: found?.suffixes.get(nodeId) })} />;
}
