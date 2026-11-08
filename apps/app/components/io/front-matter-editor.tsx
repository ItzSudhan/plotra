"use client";

import { Icon } from "@plotra/icons";
import { cn } from "@plotra/ui/lib/utils";
import { useState } from "react";
import { toast } from "sonner";
import { fieldClass } from "@/components/views/view-ui";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { errorText } from "@/lib/errors";
import { cleanFrontMatter, FRONT_LIMIT, standardCopyright, type FrontMatter } from "@/lib/io/front-matter";
import { updateProjectSettings } from "@/lib/project-actions";

// The project's front matter (lib/io/front-matter.ts): a copyright page, a
// dedication and an epigraph, written once for the book. Kept with the
// project, so every export of it (Word, RTF, plain text with "Front matter"
// in the layout, and every EPUB) uses the same pages. People who can edit
// the project change it; everyone else reads it.

const same = (a: FrontMatter, b: FrontMatter) => JSON.stringify(cleanFrontMatter(a)) === JSON.stringify(cleanFrontMatter(b));

export function FrontMatterEditor({ className }: { className?: string }) {
  const { project, user, projectChanged } = useWorkspace();
  const saved = project.settings.frontMatter ?? {};
  const [draft, setDraft] = useState<FrontMatter>(saved);
  const [busy, setBusy] = useState(false);
  const canEdit = project.actions.includes("edit");
  const dirty = !same(draft, saved);
  const set = (key: keyof FrontMatter, value: string) => setDraft((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setBusy(true);
    try {
      await updateProjectSettings(project.id, { frontMatter: draft });
      projectChanged();
      toast.success("Opening pages saved.");
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const area = (key: "copyright" | "dedication" | "epigraph", label: string, placeholder: string, rows: number) => (
    <label className="grid gap-1 text-xs text-muted-foreground">
      <span className="flex items-center justify-between gap-2">
        {label}
        {key === "copyright" && canEdit && !draft.copyright && (
          <button type="button" onClick={() => set("copyright", standardCopyright(user.name))} className="min-h-7 rounded text-meta underline-offset-2 hover:text-foreground hover:underline">
            Start from a standard one
          </button>
        )}
      </span>
      <textarea
        value={draft[key] ?? ""}
        onChange={(e) => set(key, e.target.value)}
        readOnly={!canEdit}
        rows={rows}
        maxLength={FRONT_LIMIT}
        placeholder={placeholder}
        className={cn(fieldClass, "h-auto resize-y py-1.5 font-prose text-ui-sm leading-relaxed")}
      />
    </label>
  );

  return (
    <div className={cn("grid gap-2", className)}>
      {area("copyright", "Copyright page", "Copyright © 2026 Your Name. All rights reserved.", 3)}
      {area("dedication", "Dedication", "For Mum, who read everything first.", 2)}
      {area("epigraph", "Epigraph", "A quotation to open the book with.", 2)}
      {(draft.epigraph ?? "").trim() && (
        <label className="grid gap-1 text-xs text-muted-foreground">
          Epigraph by, or from
          <input value={draft.epigraphSource ?? ""} onChange={(e) => set("epigraphSource", e.target.value)} readOnly={!canEdit} maxLength={200} placeholder="Ursula K. Le Guin" className={fieldClass} />
        </label>
      )}
      <div className="flex items-center gap-2 text-xs text-faint">
        {canEdit ? (
          <>
            <button
              type="button"
              disabled={!dirty || busy}
              onClick={() => void save()}
              className="inline-flex h-8 items-center gap-1 rounded-md bg-foreground px-2.5 text-xs text-background disabled:opacity-40"
            >
              <Icon name="check-circle-linear" className="size-3.5" />
              {busy ? "Saving…" : "Save opening pages"}
            </button>
            <span>Kept with the project. Leave a box empty to leave that page out.</span>
          </>
        ) : (
          <span>Only people who can edit the project can change these.</span>
        )}
      </div>
    </div>
  );
}
