"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

export type IndexEntry = {
  slug: string;
  tag: string;
  /** The post as a card in the grid. */
  card: React.ReactNode;
  /** The post given the whole width, for the newest one. */
  feature?: React.ReactNode;
};

/**
 * The blog's list, newest first, with a row of topics to narrow it. Showing
 * every topic, the newest post leads across the full width.
 */
export function PostIndex({ entries }: { entries: IndexEntry[] }) {
  const [topic, setTopic] = useState<string | null>(null);
  const topics = [...new Set(entries.map((e) => e.tag))].map((tag) => ({
    tag,
    count: entries.filter((e) => e.tag === tag).length,
  }));

  const [lead, ...rest] = entries;
  const shown = topic ? entries.filter((e) => e.tag === topic) : lead?.feature ? rest : entries;

  return (
    <>
      <div role="group" aria-label="Topics" className="mx-auto mt-12 flex max-w-6xl flex-wrap justify-center gap-2">
        {[{ tag: null, count: entries.length }, ...topics].map(({ tag, count }) => (
          <button
            key={tag ?? "all"}
            type="button"
            aria-pressed={topic === tag}
            onClick={() => setTopic(tag)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-[13px] transition-colors",
              topic === tag
                ? "border-black bg-black text-white"
                : "border-hairline text-gray hover:border-black/20 hover:text-black",
            )}
          >
            {tag ?? "All posts"} <span className={cn("tabular-nums", topic === tag ? "text-white/60" : "text-faint")}>{count}</span>
          </button>
        ))}
      </div>

      {!topic && lead?.feature && <div className="mx-auto mt-14 max-w-6xl">{lead.feature}</div>}

      <section
        aria-label={topic ? `Posts about ${topic}` : "More posts"}
        className={cn(
          "mx-auto grid max-w-6xl gap-x-8 gap-y-16 sm:grid-cols-2 lg:grid-cols-3",
          topic || !lead?.feature ? "mt-14" : "mt-20 border-t border-hairline pt-16",
        )}
      >
        {shown.map((e) => (
          <div key={e.slug}>{e.card}</div>
        ))}
      </section>
    </>
  );
}
