"use client";

import { undoToast } from "@plotra/ui/components/sonner";
import { Icon } from "@plotra/icons";
import { cn } from "@plotra/ui/lib/utils";
import { useEffect, useRef, useState } from "react";
import { fieldClass } from "@/components/views/view-ui";
import { useCompilePrefs } from "@/components/workspace/shell-prefs";
import {
  chapterStyles,
  compileFonts,
  compilePapers,
  compilePresets,
  compileSeparators,
  compileSpacings,
  type CompileOptions,
  type CompilePreset,
} from "@/lib/io/compile";
import { SelectField } from "@plotra/ui/components/select-field";
import { FrontMatterEditor } from "./front-matter-editor";

// How an export is laid out (lib/io/compile.ts): a preset, or settings changed
// one by one, and a way to keep those as a preset of your own. Plain text only
// has words, so it's offered only what it can show.

const same = (a: CompileOptions, b: CompileOptions) => (Object.keys(a) as Array<keyof CompileOptions>).every((key) => a[key] === b[key]);

export function CompilePanel({ options, onChange, plain }: { options: CompileOptions; onChange: (next: CompileOptions) => void; plain: boolean }) {
  const own = useCompilePrefs();
  // Undo runs after the removal has re-rendered: it needs the newest list, not this render's.
  const latest = useRef(own);
  useEffect(() => {
    latest.current = own;
  });
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState<string | null>(null);
  const all: CompilePreset[] = [...compilePresets, ...own.presets];
  const current = all.find((p) => same(p.options, options));
  const set = <K extends keyof CompileOptions>(key: K, value: CompileOptions[K]) => onChange({ ...options, [key]: value });
  const check = (key: "indent" | "sceneTitles" | "pageBreaks" | "titlePage" | "header" | "frontMatter", label: string) => (
    <label className="flex items-center gap-2">
      <input type="checkbox" checked={options[key]} onChange={(e) => set(key, e.target.checked)} className="size-4 accent-[var(--ember)]" />
      {label}
    </label>
  );

  return (
    <section aria-label="Layout" className="grid gap-2 rounded-md border p-3 text-ui-sm">
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-muted-foreground">Layout</span>
        <SelectField
          value={current?.id ?? "custom"}
          onValueChange={(v) => {
            const preset = all.find((p) => p.id === v);
            if (preset) onChange(preset.options);
          }}
          className={cn(fieldClass, "h-8 flex-1")}
        >
          <optgroup label="Presets">
            {compilePresets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </optgroup>
          {own.presets.length > 0 && (
            <optgroup label="Yours">
              {own.presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </optgroup>
          )}
          {!current && <option value="custom">Your own settings</option>}
        </SelectField>
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
          {open ? "Hide" : "Change"}
          <Icon name={open ? "alt-arrow-up-linear" : "alt-arrow-down-linear"} className="size-3.5" />
        </button>
      </div>
      {current?.description && !open && <p className="text-xs text-muted-foreground">{current.description}</p>}

      {open && (
        <div className="grid gap-2">
          {!plain && (
            <div className="grid grid-cols-3 gap-2">
              <label className="grid gap-1 text-xs text-muted-foreground">
                Font
                <SelectField value={options.font} onValueChange={(v) => set("font", v as CompileOptions["font"])} className={fieldClass}>
                  {Object.entries(compileFonts).map(([id, f]) => (
                    <option key={id} value={id}>
                      {f.label}
                    </option>
                  ))}
                </SelectField>
              </label>
              <label className="grid gap-1 text-xs text-muted-foreground">
                Size
                <SelectField value={options.size} onValueChange={(v) => set("size", Number(v))} className={fieldClass}>
                  {[10, 11, 12, 13, 14, 16].map((n) => (
                    <option key={n} value={n}>
                      {n} pt
                    </option>
                  ))}
                </SelectField>
              </label>
              <label className="grid gap-1 text-xs text-muted-foreground">
                Spacing
                <SelectField value={options.spacing} onValueChange={(v) => set("spacing", v as CompileOptions["spacing"])} className={fieldClass}>
                  {Object.entries(compileSpacings).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </SelectField>
              </label>
            </div>
          )}
          {!plain && (
            <label className="grid grid-cols-[auto_1fr] items-center gap-2 text-xs text-muted-foreground">
              Paper
              <SelectField value={options.paper} onValueChange={(v) => set("paper", v as CompileOptions["paper"])} className={fieldClass}>
                {Object.entries(compilePapers).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </SelectField>
            </label>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-xs text-muted-foreground">
              Chapter headings
              <SelectField value={options.chapters} onValueChange={(v) => set("chapters", v as CompileOptions["chapters"])} className={fieldClass}>
                {Object.entries(chapterStyles).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </SelectField>
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              Between scenes
              <SelectField value={options.separator} onValueChange={(v) => set("separator", v as CompileOptions["separator"])} disabled={options.sceneTitles} className={fieldClass}>
                {Object.entries(compileSeparators).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </SelectField>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            {check("sceneTitles", "Scene titles instead of separators")}
            {check("titlePage", "Title page")}
            {!plain && check("indent", "Indent paragraphs")}
            {!plain && check("pageBreaks", "Chapters on a new page")}
            {!plain && check("header", "Running header with page numbers")}
            {check("frontMatter", "Opening pages: copyright, dedication, epigraph")}
          </div>
          {options.frontMatter && (
            <details className="rounded-md border px-2.5 py-2">
              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">Write the opening pages</summary>
              <FrontMatterEditor className="mt-2" />
            </details>
          )}
          <div className="flex flex-wrap items-center gap-2 border-t pt-2">
            {naming === null ? (
              <button type="button" disabled={own.full} onClick={() => setNaming("")} className="h-8 rounded-md text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50">
                {own.full ? "You have 12 presets of your own" : "Save these settings as a preset…"}
              </button>
            ) : (
              <form
                className="flex flex-1 items-center gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!naming.trim()) return;
                  own.add(naming.trim().slice(0, 60), options);
                  setNaming(null);
                }}
              >
                <input autoFocus value={naming} onChange={(e) => setNaming(e.target.value)} aria-label="Name for this preset" placeholder="Name it: Agent submission, ARC…" maxLength={60} className={cn(fieldClass, "flex-1")} />
                <button type="submit" className="h-8 rounded-md bg-foreground px-2 text-xs text-background">
                  Save
                </button>
                <button type="button" onClick={() => setNaming(null)} className="h-8 rounded-md px-2 text-xs hover:bg-accent">
                  Cancel
                </button>
              </form>
            )}
            {current && current.id.startsWith("own-") && naming === null && (
              <button
                type="button"
                onClick={() => {
                  const removed = current;
                  own.remove(removed.id);
                  undoToast(`Removed the preset ‘${removed.title}’`, () => latest.current.add(removed.title, removed.options));
                }}
                className="ml-auto h-8 rounded-md text-xs text-destructive underline-offset-4 hover:underline"
              >
                Remove “{current.title}”
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
