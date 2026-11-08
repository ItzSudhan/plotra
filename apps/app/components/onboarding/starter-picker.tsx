"use client";

import { Icon } from "@plotra/icons";
import { cn } from "@plotra/ui/lib/utils";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { nav } from "@/components/transitions";
import { errorText } from "@/lib/errors";
import { createStarterProject } from "@/lib/starter-actions";
import { audiences, starterCatalog, type AudienceId } from "@/lib/starters/catalog";

/**
 * The starters (lib/starters/catalog.ts): a row of audiences and the starters
 * for the one picked. Choosing a starter creates the project and opens it on
 * its first scene. `title`, when given, is what the project is called instead
 * of the starter's own name (a title already typed into "New project").
 */
export function StarterPicker({
  workspaceSlug,
  audience: initial = "novel",
  title,
  className,
}: {
  workspaceSlug: string;
  audience?: AudienceId;
  title?: () => string;
  className?: string;
}) {
  const router = useRouter();
  const [audience, setAudience] = useState<AudienceId>(initial);
  // Stays set while the new project loads, so nothing can be clicked twice.
  const [creating, setCreating] = useState<string | null>(null);

  const start = async (id: string) => {
    setCreating(id);
    try {
      const { href } = await createStarterProject(workspaceSlug, id, title?.().trim() || undefined);
      router.push(href, { transitionTypes: nav.open });
    } catch (error) {
      toast.error(errorText(error));
      setCreating(null);
    }
  };

  return (
    <div className={className}>
      {/* Toggle buttons rather than tabs: picking an audience just filters the list below. */}
      <div role="group" aria-label="Starters for" className="mb-3 flex flex-wrap gap-1.5">
        {audiences.map((a) => (
          <button
            key={a.id}
            type="button"
            aria-pressed={audience === a.id}
            onClick={() => setAudience(a.id)}
            className={cn(
              "h-8 rounded-full border px-3 text-ui-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 pointer-coarse:h-10",
              audience === a.id && "border-ember/60 bg-ember/[0.06] text-foreground",
            )}
          >
            {a.label}
          </button>
        ))}
      </div>
      <ul aria-label="Starters" className="grid gap-2 sm:grid-cols-2">
        {starterCatalog
          .filter((s) => s.audience === audience)
          .map((s) => (
            <li key={s.id}>
              <button
                type="button"
                disabled={creating !== null}
                onClick={() => void start(s.id)}
                className="flex h-full w-full items-start gap-3 rounded-lg border bg-card p-3 text-left transition-colors outline-none hover:border-ember/50 hover:bg-ember/[0.04] focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-60"
              >
                <Icon name={s.icon} className="mt-0.5 size-5 shrink-0 text-ember-ink" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{creating === s.id ? "Creating…" : s.label}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{s.description}</span>
                </span>
              </button>
            </li>
          ))}
      </ul>
    </div>
  );
}
