"use client";

import { Button } from "@plotra/ui/components/button";
import { Input } from "@plotra/ui/components/input";
import { useState } from "react";
import type { PluginRow } from "@/lib/plugin-actions";
import { cleanSlug, MAX_ABOUT, MAX_NOTES, MAX_SUMMARY, pluginCategories, slugFromName } from "@/lib/plugin-store";
import { editListing, publishPlugin, publishVersion } from "@/lib/plugin-store-actions";
import { textareaClass } from "./ui";
import type { useRun } from "./use-run";

// Your settings → Plugins, the store's half (plugin-store-plan.md): putting
// one of your plugins in the store, publishing its next version, and changing
// what its page says.

type Run = ReturnType<typeof useRun>["run"];

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

type Page = { summary: string; about: string; category: string };

function PageFields({ page, onChange }: { page: Page; onChange: (page: Page) => void }) {
  return (
    <>
      <label className="grid gap-1.5">
        <span className="text-xs text-muted-foreground">What it does, in a line</span>
        <Input value={page.summary} maxLength={MAX_SUMMARY} onChange={(event) => onChange({ ...page, summary: event.target.value })} />
      </label>
      <label className="grid gap-1.5">
        <span className="text-xs text-muted-foreground">Category</span>
        <select value={page.category} onChange={(event) => onChange({ ...page, category: event.target.value })} className={selectClass}>
          {pluginCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1.5">
        <span className="text-xs text-muted-foreground">About it (optional): how to use it, what it adds where</span>
        <textarea value={page.about} maxLength={MAX_ABOUT} onChange={(event) => onChange({ ...page, about: event.target.value })} className={`${textareaClass} min-h-28`} />
      </label>
    </>
  );
}

/** Puts a plugin in the store, as its first version. */
export function PublishForm({ plugin, run, pending, onDone }: { plugin: PluginRow; run: Run; pending: boolean; onDone: () => void }) {
  const [slug, setSlug] = useState(() => slugFromName(plugin.name));
  const [page, setPage] = useState<Page>({ summary: plugin.description, about: "", category: "other" });
  const valid = cleanSlug(slug) !== null && page.summary.trim() !== "";

  const publish = async () => {
    const done = await run(() => publishPlugin({ pluginId: plugin.id, slug, ...page }), `${plugin.name} is in the store.`);
    if (done) onDone();
  };

  return (
    <div className="grid gap-3 rounded-lg border bg-background p-3">
      <p className="text-xs text-muted-foreground">
        Anyone signed in to Plotra can then install it, and read its code. Your name shows as its author. It goes in as version {plugin.version || "(none yet: add // @version 1.0 to its header)"}
        {plugin.access === "read" ? ", reading notes only" : ", reading and changing notes"}. Later changes reach people when you publish a new version.
      </p>
      <label className="grid gap-1.5">
        <span className="text-xs text-muted-foreground">Its address</span>
        <div className="flex items-center gap-1 text-sm">
          <span className="text-muted-foreground">/plugins/</span>
          <Input value={slug} maxLength={50} onChange={(event) => setSlug(event.target.value.toLowerCase())} aria-invalid={slug !== "" && cleanSlug(slug) === null} />
        </div>
      </label>
      <PageFields page={page} onChange={setPage} />
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={pending || !valid || !plugin.version} onClick={() => void publish()}>
          Publish
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** Publishes the plugin as it is now, as its next version. */
export function VersionForm({ plugin, run, pending, onDone }: { plugin: PluginRow; run: Run; pending: boolean; onDone: () => void }) {
  const [notes, setNotes] = useState("");
  const same = plugin.version === plugin.store?.latest?.version;
  const more = plugin.store?.latest?.access === "read" && plugin.access !== "read";

  const publish = async () => {
    const done = await run(() => publishVersion({ pluginId: plugin.id, notes }), `Version ${plugin.version} published.`);
    if (done) onDone();
  };

  return (
    <div className="grid gap-3 rounded-lg border bg-background p-3">
      <p className="text-xs text-muted-foreground">
        {same
          ? `Its header still says version ${plugin.version}, which is published. Raise @version in its code first.`
          : `Publishes your code as it is now, as version ${plugin.version || "?"}. Everyone who has it is offered the update.`}
        {more && " This version changes notes, where the last only read them: people are asked before they update."}
      </p>
      <label className="grid gap-1.5">
        <span className="text-xs text-muted-foreground">What changed (optional)</span>
        <textarea value={notes} maxLength={MAX_NOTES} onChange={(event) => setNotes(event.target.value)} className={`${textareaClass} min-h-20`} />
      </label>
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={pending || same || !plugin.version} onClick={() => void publish()}>
          Publish version
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** Changes what the plugin's page in the store says. */
export function PageForm({ slug, page: start, run, pending, onDone }: { slug: string; page: Page; run: Run; pending: boolean; onDone: () => void }) {
  const [page, setPage] = useState(start);

  const save = async () => {
    const done = await run(() => editListing({ slug, ...page }), "Its page is changed.");
    if (done) onDone();
  };

  return (
    <div className="grid gap-3 rounded-lg border bg-background p-3">
      <PageFields page={page} onChange={setPage} />
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={pending || !page.summary.trim()} onClick={() => void save()}>
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
