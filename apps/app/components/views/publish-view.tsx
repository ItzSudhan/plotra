"use client";

import { Icon, type IconName } from "@plotra/icons";
import { FrontMatterEditor } from "@/components/io/front-matter-editor";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/components/workspace/stores";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { useWorld } from "@/components/world/data";
import type { PublishSummary } from "@/lib/publish-actions";
import { isImage, useAttachments } from "@/components/research/attachments";
import { read } from "@/lib/read";
import { containerKinds, flatten } from "@/lib/tree";
import { EmptyState, errorText, Field, fieldClass, Toolbar } from "./view-ui";
import { reached } from "@/components/onboarding/reached";
import { SelectField } from "@plotra/ui/components/select-field";
import { download } from "@/components/io/download";
import { plural } from "@/lib/plural";

// Publish (plan.md 2.8 "Publishing outputs"): the files a project can leave
// Plotra as. Everything is built by the app itself and downloaded: an EPUB, a
// printable series bible, and a static wiki that only contains what the
// audience has been told. Manuscript and script PDFs come from the Read view,
// through the browser's print dialog.

type Format = "epub" | "bible" | "wiki";

export function PublishView({ nodeId }: { nodeId?: string }) {
  const { project, binder, horizon, openView, modules, actions } = useWorkspace();
  const { index } = useStore(binder);
  const world = useWorld().data;
  const [rootId, setRootId] = useState<string>(nodeId ?? "");
  // Start from the horizon the workspace is already showing.
  const [horizonId, setHorizonId] = useState<string>(() => horizon.get() ?? "");
  const [canonOnly, setCanonOnly] = useState(true);
  const [busy, setBusy] = useState<Format | null>(null);
  const [summary, setSummary] = useState<PublishSummary | null>(null);
  // An EPUB's cover: a picture already attached somewhere in the project (a research note, a map).
  const pictures = (useAttachments().data ?? []).filter(isImage);
  const [coverId, setCoverId] = useState("");

  const folders = useMemo(() => flatten(index).filter((n) => containerKinds.includes(n.kind)), [index]);
  const releases = world?.releases ?? [];
  const validHorizon = releases.some((r) => r.id === horizonId) ? horizonId : "";
  const root = index.byId.get(rootId);

  useEffect(() => {
    let cancelled = false;
    read("getPublishSummary", project.id, { rootId: root?.id ?? null, horizonId: validHorizon || null, canonOnly })
      .then((s) => !cancelled && setSummary(s))
      .catch(() => !cancelled && setSummary(null));
    return () => {
      cancelled = true;
    };
  }, [canonOnly, project.id, root?.id, validHorizon]);

  const run = async (format: Format, options: { root?: boolean; canon?: boolean }) => {
    const params = new URLSearchParams({ project: project.id, format });
    if (options.root && root) params.set("root", root.id);
    if (validHorizon) params.set("horizon", validHorizon);
    if (options.canon && canonOnly) params.set("canon", "1");
    if (format === "epub" && pictures.some((p) => p.id === coverId)) params.set("cover", coverId);
    setBusy(format);
    try {
      toast.success(`Saved ${await download(`/api/export?${params}`)}.`);
      if (format === "wiki") reached("wiki");
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(null);
    }
  };

  if (!world) return <div className="m-6 h-40 animate-pulse rounded-lg bg-muted" />;

  return (
    <div className="flex h-full flex-col">
      <Toolbar>
        <span className="font-medium text-foreground">Publish</span>
        <span className="ml-auto text-xs text-faint">Exports contain the text as last saved, and only what you can read yourself.</span>
      </Toolbar>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid w-full max-w-4xl gap-6 p-5">
          <section className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2">
            <Field label="What">
              <SelectField value={root ? root.id : ""} onValueChange={(v) => setRootId(v)} className={fieldClass}>
                <option value="">The whole project</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.title}
                  </option>
                ))}
              </SelectField>
            </Field>
            <Field label="As of">
              <SelectField value={validHorizon} onValueChange={(v) => setHorizonId(v)} disabled={releases.length === 0} className={fieldClass}>
                <option value="">{releases.length ? "Everything, spoilers included" : "No releases to choose from"}</option>
                {releases.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}: only what&apos;s revealed by then
                  </option>
                ))}
              </SelectField>
            </Field>
            {summary && (
              <p className="text-xs text-muted-foreground sm:col-span-2">
                {summary.manuscript.documents.toLocaleString()} {plural(summary.manuscript.documents, "chapter")} and scenes with text,{" "}
                {summary.manuscript.words.toLocaleString()} words.
              </p>
            )}
          </section>

          <div className="grid gap-4 sm:grid-cols-2">
            <Output
              icon="book-2-linear"
              title="EPUB"
              description="An e-book of the manuscript: folders become parts, chapters start a new page, scenes run on with a break between them. Ready for Kindle and other stores."
              action="Download .epub"
              busy={busy === "epub"}
              onClick={() => void run("epub", { root: true })}
            >
              <label className="grid gap-1 text-ui-sm">
                <span className="text-xs text-muted-foreground">Cover</span>
                <SelectField value={pictures.some((p) => p.id === coverId) ? coverId : ""} onValueChange={(v) => setCoverId(v)} className={fieldClass}>
                  <option value="">{pictures.length ? "No cover" : "No pictures in the project yet"}</option>
                  {pictures.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </SelectField>
                <span className="text-xs text-faint">Attach the cover to any note first (a research note&apos;s Files). Stores ask for 1600 × 2560 pixels; up to 5 MB.</span>
              </label>
              <details className="rounded-md border px-2.5 py-2 text-ui-sm">
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                  Opening pages: copyright, dedication, epigraph{project.settings.frontMatter && Object.keys(project.settings.frontMatter).length ? "" : " (none yet)"}
                </summary>
                <FrontMatterEditor className="mt-2" />
              </details>
            </Output>
            <Output
              icon="printer-linear"
              title="Manuscript or script PDF"
              description="Standard manuscript format, a typeset book page, or screenplay, comic and audio script layouts. Printed to PDF by your browser."
              action="Open the Read view"
              onClick={() => openView("read", root ? { nodeId: root.id } : {})}
            />
            <Output
              icon="notebook-bookmark-linear"
              title="Series bible"
              description="A pitch document: the logline, the story as an outline, the cast, the world and the release plan. One page you can print or send."
              action="Download .html"
              busy={busy === "bible"}
              onClick={() => void run("bible", { root: true })}
            />
            <Output
              icon="global-linear"
              title="Public wiki"
              description="Static pages for characters, places and world entries, with links between them. Host the folder anywhere for free."
              action="Download .zip"
              busy={busy === "wiki"}
              disabled={summary?.wiki.published === 0}
              onClick={() => void run("wiki", { canon: true })}
            >
              <label className="flex items-center gap-2 text-ui-sm">
                <input type="checkbox" checked={canonOnly} onChange={(e) => setCanonOnly(e.target.checked)} />
                Only canon pages and passages
              </label>
              {summary && (
                <p className="text-xs text-muted-foreground">
                  {summary.wiki.published} of {summary.wiki.total} world pages would be published
                  {validHorizon ? ", none of them revealed after the release you picked" : releases.length ? ": the ones a release reveals" : ""}.
                  {summary.wiki.published === 0 && summary.wiki.total > 0 && (
                    <>
                      {" "}
                      {canonOnly ? "Mark pages as canon" : "Tag pages with the release that reveals them"} in the inspector&apos;s Story tab
                      {modules.has("releases") ? ", or in the roadmap" : ""}.
                    </>
                  )}
                </p>
              )}
            </Output>
          </div>

          {summary && summary.manuscript.documents === 0 && summary.wiki.total === 0 && (
            <EmptyState icon="export-bold-duotone" title="Nothing to publish yet" action={project.actions.includes("edit") && { label: "New scene", onClick: () => void actions.create("scene") }}>
              Write a chapter or add a character, then come back.
            </EmptyState>
          )}
        </div>
      </div>
    </div>
  );
}

function Output({
  icon,
  title,
  description,
  action,
  onClick,
  busy,
  disabled,
  children,
}: {
  icon: IconName;
  title: string;
  description: string;
  action: string;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2">
        <Icon name={icon} className="size-5 text-ember-ink" />
        <h2 className="font-display text-xl">{title}</h2>
      </div>
      <p className="text-ui-sm leading-relaxed text-muted-foreground">{description}</p>
      {children}
      <button
        type="button"
        disabled={busy || disabled}
        onClick={onClick}
        className="mt-auto flex h-9 w-fit items-center gap-2 rounded-md bg-foreground px-3.5 text-sm text-background disabled:opacity-50"
      >
        {busy ? "Building…" : action}
      </button>
    </section>
  );
}
