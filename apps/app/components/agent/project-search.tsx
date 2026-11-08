"use client";

import { Icon } from "@plotra/icons";
import { Command } from "cmdk";
import { Fragment, useEffect, useState } from "react";
import { formatHotkey } from "@/components/workspace/hotkeys";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import type { SearchHit } from "@/lib/agent/search";
import { HIT_END, HIT_START } from "@/lib/agent/types";
import { errorText } from "@/lib/errors";
import { read } from "@/lib/read";
import { nodeKindMeta } from "@/lib/tree";

// "Search project" in the command palette (plan.md Phase 9a): full-text search
// over every note's title, synopsis and text. The quick switcher finds a note
// by its name; this finds it by what it says.

const itemClass =
  "flex cursor-default items-start gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground select-none data-[selected=true]:bg-accent data-[selected=true]:text-foreground";

/** A snippet with its matched words marked up. */
function Snippet({ text }: { text: string }) {
  return (
    <>
      {text.split(HIT_START).map((piece, i) => {
        if (i === 0) return <Fragment key={i}>{piece}</Fragment>;
        const [hit, rest = ""] = piece.split(HIT_END);
        return (
          <Fragment key={i}>
            <mark className="rounded-sm bg-gold/25 text-foreground">{hit}</mark>
            {rest}
          </Fragment>
        );
      })}
    </>
  );
}

export function ProjectSearch() {
  const { project, open, setUi } = useWorkspace();
  const [query, setQuery] = useState("");
  const [state, setState] = useState<{ query: string; hits: SearchHit[]; error?: string } | null>(null);
  const wanted = query.trim();

  useEffect(() => {
    if (wanted.length < 2) return;
    let cancelled = false;
    // Wait for a pause in typing; an answer to an older query is dropped.
    const timer = setTimeout(() => {
      read("searchProject", project.id, wanted)
        .then((hits) => !cancelled && setState({ query: wanted, hits }))
        .catch((error) => !cancelled && setState({ query: wanted, hits: [], error: errorText(error, "Search didn't work. Try again.") }));
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [project.id, wanted]);

  const current = wanted.length >= 2 && state?.query === wanted ? state : null;
  const searching = wanted.length >= 2 && !current;

  return (
    <Command
      loop
      // The server ranks the results; cmdk mustn't filter or reorder them.
      shouldFilter={false}
      className="flex flex-col"
      onKeyDown={(e) => {
        // ⌘↵ opens in a new tab, ⌘⌥↵ to the right, like the quick switcher.
        if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey)) return;
        const selected = document.querySelector<HTMLElement>("[cmdk-item][data-selected=true]")?.dataset.nodeId;
        if (!selected) return;
        e.preventDefault();
        setUi({ palette: null });
        open(selected, e.altKey ? "split" : "tab");
      }}
    >
      <Command.Input
        autoFocus
        value={query}
        onValueChange={setQuery}
        aria-label="Search the text of every note"
        placeholder="Search the text of every note…"
        className="h-12 border-b bg-transparent px-4 text-sm outline-none placeholder:text-faint"
      />
      <Command.List className="max-h-[min(60vh,460px)] overflow-y-auto p-1.5">
        {wanted.length < 2 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Type a word or a &ldquo;quoted phrase&rdquo;. Put - in front of a word to leave it out.</div>
        ) : searching ? (
          <Command.Loading>
            <div className="py-8 text-center text-sm text-muted-foreground">Searching…</div>
          </Command.Loading>
        ) : current?.error ? (
          <div className="py-8 text-center text-sm text-muted-foreground">{current.error}</div>
        ) : current?.hits.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Nothing in this project matches.</div>
        ) : (
          current?.hits.map((hit) => (
            <Command.Item
              key={hit.id}
              value={hit.id}
              data-node-id={hit.id}
              onSelect={() => {
                setUi({ palette: null });
                open(hit.id);
              }}
              className={itemClass}
            >
              <Icon name={nodeKindMeta[hit.kind].icon} className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0">
                <span className="block truncate text-foreground">{hit.title}</span>
                {hit.snippet && (
                  <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                    <Snippet text={hit.snippet} />
                  </span>
                )}
              </span>
            </Command.Item>
          ))
        )}
      </Command.List>
      <div className="flex h-9 items-center gap-4 border-t px-3 text-xs text-faint">
        {[
          ["↵", "open"],
          [formatHotkey("mod+enter"), "new tab"],
          [formatHotkey("mod+alt+enter"), "split"],
        ].map(([key, label]) => (
          <span key={label}>
            <kbd className="mr-1 font-sans text-muted-foreground">{key}</kbd>
            {label}
          </span>
        ))}
      </div>
    </Command>
  );
}
