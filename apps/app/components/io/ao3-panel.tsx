"use client";

import { Icon } from "@plotra/icons";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { errorText } from "@/lib/errors";
import { responseError } from "@/components/agent/response-error";
import type { Ao3Chapter } from "@/lib/io/ao3";
import { download } from "./download";
import { plural } from "@/lib/plural";

// Posting to Archive of Our Own, chapter by chapter (lib/io/ao3.ts): each
// chapter's title, summary and HTML with a button to copy each, in the order
// AO3's forms ask for them. The work is the first chapter; Add Chapter takes
// the rest.

type Work = { title: string; author: string; chapters: Ao3Chapter[] };

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() =>
        navigator.clipboard.writeText(text).then(
          () => {
            setDone(true);
            setTimeout(() => setDone(false), 2000);
          },
          () => toast.error("Couldn't copy. Download the chapters instead."),
        )
      }
      className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border px-2 text-xs hover:bg-accent"
    >
      <Icon name={done ? "check-circle-linear" : "copy-linear"} className="size-3.5" />
      {done ? "Copied" : label}
    </button>
  );
}

export function Ao3Panel({ query }: { query: URLSearchParams }) {
  const [work, setWork] = useState<Work | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const url = `/api/export?${query}`;

  useEffect(() => {
    // A new query mounts a new panel (the dialog keys it), so there's nothing to reset here.
    let current = true;
    fetch(`${url}&as=json`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw await responseError(res, "Couldn't read the chapters.");
        return (await res.json()) as Work;
      })
      .then((value) => current && setWork(value))
      .catch((failure) => current && setError(errorText(failure)));
    return () => {
      current = false;
    };
  }, [url]);

  if (error) return <p className="text-ui-sm text-destructive">{error}</p>;
  if (!work) return <p className="text-ui-sm text-muted-foreground">Reading the chapters…</p>;
  const total = work.chapters.reduce((sum, chapter) => sum + chapter.words, 0);

  return (
    <div className="grid gap-2">
      <p className="text-xs text-muted-foreground">
        {work.chapters.length} {plural(work.chapters.length, "chapter")}, {total.toLocaleString("en")} words. On AO3, choose Post New Work and paste chapter 1 into the HTML box; then Add
        Chapter for each of the rest. A chapter&apos;s synopsis is its summary.
      </p>
      <ol className="grid max-h-72 gap-1.5 overflow-y-auto pr-1">
        {work.chapters.map((chapter, i) => (
          <li key={i} className="grid gap-1.5 rounded-md border px-2.5 py-2">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-ui-sm font-medium">
                {i + 1}. {chapter.title}
              </span>
              <span className="shrink-0 text-meta text-faint tabular-nums">{chapter.words.toLocaleString("en")} words</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <CopyButton text={chapter.title} label="Title" />
              {chapter.summary && <CopyButton text={chapter.summary} label="Summary" />}
              <CopyButton text={chapter.html} label="Chapter text (HTML)" />
            </div>
          </li>
        ))}
      </ol>
      <div>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              toast.success(`Saved ${await download(url)}.`);
            } catch (failure) {
              toast.error(errorText(failure, "The export failed."));
            } finally {
              setBusy(false);
            }
          }}
          className="min-h-8 rounded-md text-left text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
        >
          {busy ? "Downloading…" : "Or download them all (.zip), with a page to copy from offline"}
        </button>
      </div>
    </div>
  );
}
