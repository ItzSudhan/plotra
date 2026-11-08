"use client";

import { glossaryRules, translationStatuses, type GlossaryRule, type TranslationStatus } from "@plotra/db/schema";
import { Icon } from "@plotra/icons";
import { cn } from "@plotra/ui/lib/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { sharedResource } from "@/components/workflow/data";
import { useStore } from "@/components/workspace/stores";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { glossaryHits, hashText, parseCsv, parseXliff, textDirection, toCsv, toSrt, toVtt, toXliff, type ExchangeRow, type Term, type TranslationRow, type Unit } from "@/lib/l10n";
import { createTerm, deleteTerm, importTranslations, saveTranslation, updateTerm, type TranslationScope } from "@/lib/l10n-actions";
import { read } from "@/lib/read";
import { containerKinds, flatten } from "@/lib/tree";
import { CommitInput, Divider, EmptyState, errorText, fieldClass, Segmented, ToolButton, Toolbar, ToolbarSelect } from "./view-ui";
import { SelectField } from "@plotra/ui/components/select-field";
import { IconButton } from "@plotra/ui/components/icon-button";
import { undoToast } from "@plotra/ui/components/sonner";
import { Tooltip } from "@plotra/ui/components/tooltip";
import { plural } from "@/lib/plural";

// Translate (plan.md 2.8 "Localization & translation"): source and target
// side by side, block by block, with a status per unit and language, a
// glossary of official names and "do not translate" terms, CSV / XLIFF for
// outside translators and SRT / WebVTT subtitles for scripts.

const GLOSSARY_NOTICE = "glossary";
const STRINGS = "__strings";
const ALL = "__all";
const MAX_TEXT = 20_000;

// Text colours that pass contrast; the label always says the status too.
const statusMeta: Record<TranslationStatus, { label: string; className: string }> = {
  draft: { label: "To do", className: "text-muted-foreground" },
  translated: { label: "Translated", className: "text-foreground" },
  reviewed: { label: "Reviewed", className: "text-gold-ink" },
  approved: { label: "Approved", className: "text-teal-ink" },
};

const useGlossaryResource = sharedResource<Term[]>();

function useGlossary() {
  const { project } = useWorkspace();
  return useGlossaryResource(`${project.id}/glossary`, () => read("listGlossary", project.id), GLOSSARY_NOTICE);
}

function save(name: string, text: string, type: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([text], { type }));
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
}

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "project";

export function TranslateView({ nodeId }: { nodeId?: string }) {
  const { project, setUi } = useWorkspace();
  const locales = useMemo(() => project.settings.locales ?? [], [project.settings.locales]);
  const [tab, setTab] = useState<"translate" | "glossary">("translate");
  const [locale, setLocale] = useState(locales[0] ?? "");
  const current = locales.includes(locale) ? locale : (locales[0] ?? "");

  if (locales.length === 0) {
    return (
      <EmptyState icon="translation-bold-duotone" title="No languages yet" action={{ label: "Add languages in project settings", icon: "settings-linear", onClick: () => setUi({ projectSettings: true }) }}>
        Choose the languages this project is translated into, and each gets its own translation of every paragraph and line of game text.
      </EmptyState>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {tab === "translate" ? (
        <Translate key={current} locale={current} locales={locales} onLocale={setLocale} initialRoot={nodeId} tabs={<Tabs tab={tab} onTab={setTab} />} />
      ) : (
        <Glossary locales={locales} tabs={<Tabs tab={tab} onTab={setTab} />} />
      )}
    </div>
  );
}

function Tabs({ tab, onTab }: { tab: "translate" | "glossary"; onTab: (tab: "translate" | "glossary") => void }) {
  return (
    <Segmented
      value={tab}
      onChange={onTab}
      options={[
        { value: "translate", label: "Translate" },
        { value: "glossary", label: "Glossary" },
      ]}
    />
  );
}

function Translate({
  locale,
  locales,
  onLocale,
  initialRoot,
  tabs,
}: {
  locale: string;
  locales: string[];
  onLocale: (locale: string) => void;
  initialRoot?: string;
  tabs: React.ReactNode;
}) {
  const { project, binder, modules, openNode, openView } = useWorkspace();
  const { index } = useStore(binder);
  const canEdit = project.actions.includes("edit");
  const terms = useGlossary().data ?? [];
  const [scopeId, setScopeId] = useState<string>(initialRoot ?? (modules.has("interactive") ? STRINGS : ALL));
  const [filter, setFilter] = useState<TranslationStatus | "all" | "stale">("all");
  const [units, setUnits] = useState<Unit[] | null>(null);
  const [rows, setRows] = useState<Map<string, TranslationRow>>(new Map());
  const [truncated, setTruncated] = useState(false);
  const [tick, setTick] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  // Rows with a typed translation not saved yet, so leaving the page can warn.
  const dirty = useRef(new Set<string>());
  const sourceLocale = project.settings.sourceLocale ?? "en";

  // Folders and chapters, and any note with notes inside it (the binder offers Translate on those too).
  const folders = useMemo(
    () => flatten(index).filter((n) => containerKinds.includes(n.kind) || (index.children.get(n.id) ?? []).some((c) => !c.deletedAt) || n.id === scopeId),
    [index, scopeId],
  );

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty.current.size) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  const scope = useMemo<TranslationScope>(
    () => (scopeId === STRINGS ? { strings: true } : { rootId: scopeId === ALL || !index.byId.has(scopeId) ? null : scopeId }),
    // Only the chosen scope matters, not every binder change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scopeId],
  );

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- show the skeleton while another scope loads
    setUnits(null);
    read("getTranslationUnits", project.id, scope, locale)
      .then((data) => {
        if (cancelled) return;
        setUnits(data.units);
        setRows(new Map(data.translations.map((t) => [t.unitKey, t])));
        setTruncated(data.truncated);
      })
      .catch((error) => {
        if (cancelled) return;
        setUnits([]);
        toast.error(errorText(error));
      });
    return () => {
      cancelled = true;
    };
  }, [locale, project.id, scope, tick]);

  const isStale = (unit: Unit) => {
    const row = rows.get(unit.key);
    return Boolean(row?.text.trim() && row.sourceHash && row.sourceHash !== hashText(unit.source));
  };
  const statusOf = (unit: Unit): TranslationStatus => rows.get(unit.key)?.status ?? "draft";

  // A status change sends no text: the server keeps what's stored, so it can't undo a text save still in flight.
  const store = useCallback(
    async (unit: Unit, patch: { text?: string; status?: TranslationStatus }) => {
      try {
        const saved = await saveTranslation(project.id, { unitKey: unit.key, locale, text: patch.text, status: patch.status, source: unit.source });
        setRows((prev) => new Map(prev).set(unit.key, saved));
      } catch (error) {
        toast.error(errorText(error));
      }
    },
    [locale, project.id],
  );

  const exchange = (): ExchangeRow[] =>
    (units ?? []).map((u) => ({ key: u.key, source: u.source, target: rows.get(u.key)?.text ?? "", status: statusOf(u), context: [u.speaker, u.context].filter(Boolean).join(" · ") }));
  const baseName = `${slug(project.title)}-${scopeId === STRINGS ? "strings" : scopeId === ALL ? "all" : slug(index.byId.get(scopeId)?.title ?? "folder")}-${locale}`;

  // Each line in the chosen language, or its source while it has no translation.
  const exportSubtitles = (format: "srt" | "vtt") => {
    const lines = (units ?? []).filter((u) => u.type === "dialogue").map((u) => ({ text: rows.get(u.key)?.text.trim() || u.source, speaker: u.speaker }));
    if (!lines.length) return toast.message("No script dialogue here: subtitles are made from dialogue lines of script-format scenes.");
    if (format === "srt") save(`${baseName}.srt`, toSrt(lines), "application/x-subrip;charset=utf-8");
    else save(`${baseName}.vtt`, toVtt(lines), "text/vtt;charset=utf-8");
  };

  const importFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = /\.xlf$|\.xliff$/i.test(file.name) || text.includes("<xliff") ? parseXliff(text) : parseCsv(text);
      if (!parsed.length) throw new Error("No translations found in that file.");
      const sources = Object.fromEntries((units ?? []).map((u) => [u.key, u.source]));
      const result = await importTranslations(project.id, locale, parsed, sources);
      toast.success(`Imported ${result.imported} ${plural(result.imported, "translation")}${result.skipped ? `, skipped ${result.skipped} (empty, or not in this scope)` : ""}.`);
      setTick((t) => t + 1);
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  const counts = useMemo(() => {
    const c: Record<TranslationStatus, number> = { draft: 0, translated: 0, reviewed: 0, approved: 0 };
    for (const u of units ?? []) c[rows.get(u.key)?.status ?? "draft"]++;
    return c;
  }, [rows, units]);
  const total = units?.length ?? 0;
  const done = total - counts.draft;

  const shown = (units ?? []).filter((u) => (filter === "all" ? true : filter === "stale" ? isStale(u) : statusOf(u) === filter));

  return (
    <>
      <Toolbar>
        {tabs}
        <Divider />
        <ToolbarSelect
          label="Scope"
          value={scopeId}
          onChange={setScopeId}
          options={[
            ...(modules.has("interactive") ? [{ value: STRINGS, label: "Strings and dialogue lines" }] : []),
            { value: ALL, label: "Every document" },
            ...folders.map((f) => ({ value: f.id, label: f.title })),
          ]}
        />
        <ToolbarSelect label="Into" value={locale} onChange={onLocale} options={locales.map((l) => ({ value: l, label: l }))} />
        <ToolbarSelect
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "Everything" },
            ...translationStatuses.map((s) => ({ value: s, label: `${statusMeta[s].label} (${counts[s]})` })),
            { value: "stale", label: "Source changed since" },
          ]}
        />
        <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
          {done} / {total} translated
        </span>
        <Divider />
        <ToolButton icon="download-linear" label="Export CSV for a translator" onClick={() => save(`${baseName}.csv`, toCsv(exchange()), "text/csv;charset=utf-8")}>
          CSV
        </ToolButton>
        <ToolButton
          icon="download-linear"
          label="Export XLIFF 1.2 for a translation tool"
          onClick={() =>
            save(`${baseName}.xlf`, toXliff({ original: baseName, sourceLocale, targetLocale: locale, rows: exchange() }), "application/xliff+xml;charset=utf-8")
          }
        >
          XLIFF
        </ToolButton>
        <ToolButton icon="subtitles-linear" label="Export subtitles (SRT) of the translated dialogue" onClick={() => exportSubtitles("srt")}>
          SRT
        </ToolButton>
        <ToolButton icon="subtitles-linear" label="Export subtitles (WebVTT) of the translated dialogue" onClick={() => exportSubtitles("vtt")}>
          VTT
        </ToolButton>
        <ToolButton icon="upload-linear" label="Import a translated CSV or XLIFF" disabled={!canEdit} onClick={() => fileRef.current?.click()}>
          Import
        </ToolButton>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlf,.xliff,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void importFile(file);
          }}
        />
      </Toolbar>
      <div className="min-h-0 flex-1 overflow-auto">
        {units === null ? (
          <div className="m-6 h-40 animate-pulse rounded-lg bg-muted" />
        ) : total === 0 ? (
          <EmptyState
            icon="translation-bold-duotone"
            title="Nothing to translate here"
            action={scopeId === STRINGS ? { label: "Open Strings", icon: "text-field-focus-linear", onClick: () => openView("strings") } : scopeId !== ALL && { label: "Translate every document", icon: "documents-linear", onClick: () => setScopeId(ALL) }}
          >
            {scopeId === STRINGS ? "Add game text in the Strings view, or lines in a dialogue." : "There's no saved text in this part of the project yet."}
          </EmptyState>
        ) : (
          <table className="w-full table-fixed border-separate border-spacing-0 text-ui-sm">
            <thead className="sticky top-0 z-10">
              <tr className="text-left text-meta font-medium text-muted-foreground">
                <th className="border-b bg-sidebar px-3 py-1.5 font-medium">Source ({sourceLocale})</th>
                <th className="border-b bg-sidebar px-3 py-1.5 font-medium">{locale}</th>
                <th className="w-32 border-b bg-sidebar px-3 py-1.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {truncated && (
                <tr>
                  <td colSpan={3} className="border-b bg-gold/10 px-3 py-1.5 text-xs">
                    This is a large scope: only its first 300 documents are shown. Pick a folder to work through the rest.
                  </td>
                </tr>
              )}
              {shown.map((unit, i) => {
                const row = rows.get(unit.key);
                const hits = glossaryHits(unit.source, row?.text ?? "", terms, locale);
                const newDocument = unit.nodeId && unit.nodeId !== shown[i - 1]?.nodeId && scopeId !== STRINGS;
                return (
                  <UnitRow
                    key={unit.key}
                    unit={unit}
                    row={row}
                    stale={isStale(unit)}
                    hits={hits}
                    editable={canEdit}
                    sourceLocale={sourceLocale}
                    locale={locale}
                    onDirty={(isDirty) => (isDirty ? dirty.current.add(unit.key) : dirty.current.delete(unit.key))}
                    heading={newDocument ? unit.context : undefined}
                    onOpen={unit.nodeId ? () => openNode(unit.nodeId!, "split") : undefined}
                    onText={(text) => void store(unit, { text })}
                    onStatus={(status) => void store(unit, { status })}
                  />
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function UnitRow({
  unit,
  row,
  stale,
  hits,
  editable,
  sourceLocale,
  locale,
  onDirty,
  heading,
  onOpen,
  onText,
  onStatus,
}: {
  unit: Unit;
  row: TranslationRow | undefined;
  stale: boolean;
  hits: ReturnType<typeof glossaryHits>;
  editable: boolean;
  sourceLocale: string;
  locale: string;
  onDirty: (dirty: boolean) => void;
  heading?: string;
  onOpen?: () => void;
  onText: (text: string) => void;
  onStatus: (status: TranslationStatus) => void;
}) {
  const saved = row?.text ?? "";
  const [draft, setDraft] = useState(saved);
  const [synced, setSynced] = useState(saved);
  if (saved !== synced) {
    setSynced(saved);
    // Keep what's being typed if the box was edited again while the last save was on its way.
    if (draft === synced) setDraft(saved);
  }
  // A translation typed but not yet blurred is saved when the row goes away (another scope, language or tab).
  const pending = useRef({ draft, saved, onText, onDirty });
  useEffect(() => {
    pending.current = { draft, saved, onText, onDirty };
    onDirty(draft !== saved);
  });
  useEffect(
    () => () => {
      const { draft, saved, onText, onDirty } = pending.current;
      onDirty(false);
      if (draft !== saved) onText(draft);
    },
    [],
  );
  const status = row?.status ?? "draft";
  const over = unit.charLimit != null && draft.length > unit.charLimit;

  return (
    <>
      {heading && (
        <tr>
          <td colSpan={3} className="border-b bg-muted/60 px-3 py-1">
            <button type="button" onClick={onOpen} className="font-display text-base hover:underline">
              {heading}
            </button>
          </td>
        </tr>
      )}
      <tr className="align-top">
        <td className="border-b px-3 py-2">
          {unit.speaker && <p className="text-meta font-medium text-muted-foreground">{unit.speaker}</p>}
          <p lang={sourceLocale} dir={textDirection(sourceLocale)} className="leading-snug whitespace-pre-wrap">
            {unit.source}
          </p>
          {unit.key.startsWith("str:") && (
            <p className="mt-1 font-mono text-meta text-faint">
              {unit.key.slice(4)}
              {unit.context ? ` · ${unit.context}` : ""}
            </p>
          )}
          {hits.length > 0 && (
            <ul className="mt-1.5 flex flex-wrap gap-1">
              {hits.map((hit) => (
                <Tooltip key={hit.term.toLowerCase()} content={hit.note ?? (hit.rule === "keep" ? "Do not translate" : "Official translation")}>
                  <li tabIndex={0} className={cn("rounded px-1.5 py-px text-meta", hit.missing ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground")}>
                    {hit.term} → {hit.rule === "keep" ? "keep as is" : hit.expected}
                    {hit.missing && " (missing)"}
                    {hit.note && <span className="sr-only">. {hit.note}</span>}
                  </li>
                </Tooltip>
              ))}
            </ul>
          )}
        </td>
        <td className="border-b p-0">
          <textarea
            value={draft}
            readOnly={!editable}
            lang={locale}
            dir={textDirection(locale)}
            maxLength={MAX_TEXT}
            rows={Math.min(8, Math.max(2, Math.ceil(unit.source.length / 60)))}
            placeholder={editable ? "Translation…" : ""}
            aria-label={`Translation into ${locale}`}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => draft !== saved && onText(draft)}
            className="block size-full min-h-full resize-none bg-transparent px-3 py-2 leading-snug outline-none placeholder:text-faint focus-visible:bg-accent/30 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
          />
          {unit.charLimit != null && (
            <p className={cn("px-3 pb-1 text-right text-meta tabular-nums", over ? "text-destructive" : "text-faint")}>
              {draft.length} / {unit.charLimit}
            </p>
          )}
        </td>
        <td className="border-b px-2 py-2">
          <SelectField
            value={status}
            disabled={!editable}
            aria-label="Status"
            onValueChange={(v) => onStatus(v as TranslationStatus)}
            className={cn("h-7 w-full rounded-md border border-transparent bg-transparent px-1 font-medium hover:border-input", statusMeta[status].className)}
          >
            {translationStatuses.map((s) => (
              <option key={s} value={s}>
                {statusMeta[s].label}
              </option>
            ))}
          </SelectField>
          {stale && (
            <p className="mt-1 flex items-center gap-1 px-1 text-meta text-gold-ink">
              <Icon name="danger-triangle-linear" className="size-3 shrink-0" aria-hidden />
              Source changed since
            </p>
          )}
        </td>
      </tr>
    </>
  );
}

function Glossary({ locales, tabs }: { locales: string[]; tabs: React.ReactNode }) {
  const { project, notify } = useWorkspace();
  const { data: terms, refresh } = useGlossary();
  const canEdit = project.actions.includes("edit");
  const [term, setTerm] = useState("");
  const termRef = useRef<HTMLInputElement>(null);

  // Removing is undoable: the term comes back with everything it had.
  const remove = async (t: Term) => {
    if (!(await run(() => deleteTerm(project.id, t.id)))) return;
    undoToast(`Removed ‘${t.term}’ from the glossary`, () =>
      void run(() => createTerm(project.id, { term: t.term, rule: t.rule, locale: t.locale, translation: t.translation, note: t.note })),
    );
  };

  const run = async (work: () => Promise<unknown>) => {
    try {
      await work();
      notify(GLOSSARY_NOTICE);
      refresh();
      return true;
    } catch (error) {
      toast.error(errorText(error));
      return false;
    }
  };

  return (
    <>
      <Toolbar>
        {tabs}
        <Divider />
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!term.trim()) return;
            void run(() => createTerm(project.id, { term })).then((ok) => ok && setTerm(""));
          }}
        >
          <input
            ref={termRef}
            value={term}
            disabled={!canEdit}
            onChange={(e) => setTerm(e.target.value)}
            aria-label="New glossary term"
            placeholder="A name or invented word…"
            className={cn(fieldClass, "w-56")}
          />
          <button type="submit" disabled={!canEdit || !term.trim()} className="h-8 shrink-0 rounded-md bg-foreground px-2.5 text-background disabled:opacity-50">
            Add term
          </button>
        </form>
        <span className="ml-auto text-xs text-faint">Terms found in a source are shown beside it, and flagged when the translation doesn&apos;t use them.</span>
      </Toolbar>
      <div className="min-h-0 flex-1 overflow-auto">
        {terms === null ? (
          <div className="m-6 h-40 animate-pulse rounded-lg bg-muted" />
        ) : terms.length === 0 ? (
          <EmptyState icon="notebook-bookmark-linear" title="No terms yet" action={canEdit && { label: "Add a term", onClick: () => termRef.current?.focus() }}>
            The glossary keeps names and invented words consistent: the official spelling in each language, and what must never be translated.
          </EmptyState>
        ) : (
          <table className="w-full min-w-[48rem] border-separate border-spacing-0 text-ui-sm">
            <thead className="sticky top-0 z-10">
              <tr className="text-left text-meta font-medium text-muted-foreground">
                {["Term", "Rule", "Language", "Official translation", "Note", ""].map((h) => (
                  <th key={h} className="border-b bg-sidebar px-2 py-1.5 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {terms.map((t) => (
                <tr key={t.id}>
                  <td className="w-56 border-b px-1 py-1">
                    <label className="contents">
                      <span className="sr-only">Term</span>
                    <CommitInput value={t.term} disabled={!canEdit} className="border-transparent font-medium hover:border-input" onCommit={(value) => value.trim() && void run(() => updateTerm(project.id, t.id, { term: value }))} />
                    </label>
                  </td>
                  <td className="w-44 border-b px-1 py-1">
                    <SelectField
                      value={t.rule}
                      disabled={!canEdit}
                      aria-label="Rule"
                      onValueChange={(v) => void run(() => updateTerm(project.id, t.id, { rule: v as GlossaryRule }))}
                      className={cn(fieldClass, "border-transparent hover:border-input")}
                    >
                      {glossaryRules.map((r) => (
                        <option key={r} value={r}>
                          {r === "keep" ? "Do not translate" : "Translate as…"}
                        </option>
                      ))}
                    </SelectField>
                  </td>
                  <td className="w-36 border-b px-1 py-1">
                    <SelectField
                      value={t.locale ?? ""}
                      disabled={!canEdit}
                      aria-label="Language"
                      onValueChange={(v) => void run(() => updateTerm(project.id, t.id, { locale: v || null }))}
                      className={cn(fieldClass, "border-transparent hover:border-input")}
                    >
                      <option value="">Every language</option>
                      {locales.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </SelectField>
                  </td>
                  <td className="border-b px-1 py-1">
                    <label className="contents">
                      <span className="sr-only">Official translation of {t.term}</span>
                    <CommitInput
                      value={t.translation ?? ""}
                      disabled={!canEdit || t.rule === "keep"}
                      placeholder={t.rule === "keep" ? "kept as written" : t.locale ? "—" : "pick a language first"}
                      className="border-transparent hover:border-input"
                      onCommit={(value) => void run(() => updateTerm(project.id, t.id, { translation: value }))}
                    />
                    </label>
                  </td>
                  <td className="border-b px-1 py-1">
                    <label className="contents">
                      <span className="sr-only">Note on {t.term}</span>
                      <CommitInput value={t.note ?? ""} disabled={!canEdit} placeholder="—" className="border-transparent hover:border-input" onCommit={(value) => void run(() => updateTerm(project.id, t.id, { note: value }))} />
                    </label>
                  </td>
                  <td className="w-9 border-b py-1">
                    {canEdit && (
                      <IconButton icon="trash-bin-minimalistic-linear" label={`Remove ‘${t.term}’`} variant="destructive" onClick={() => void remove(t)} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
