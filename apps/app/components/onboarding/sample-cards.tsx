"use client";

import { Icon } from "@plotra/icons";
import { cn } from "@plotra/ui/lib/utils";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { errorText } from "@/lib/errors";
import { nav } from "@/components/transitions";
import { createSampleProject } from "@/lib/sample-actions";
import { sampleCatalog } from "@/lib/samples/catalog";

/**
 * The sample projects, one per launch audience (plan.md Phase 8 "Onboarding").
 * Choosing one creates a copy in the workspace and opens it on its first
 * scene, with a try-out to follow (lib/onboarding/steps.ts).
 */
export function SampleCards({ workspaceSlug, className }: { workspaceSlug: string; className?: string }) {
  const router = useRouter();
  // Stays set while the new project loads, so the card can't be clicked twice.
  const [creating, setCreating] = useState<string | null>(null);

  const start = async (id: string) => {
    setCreating(id);
    try {
      const { href } = await createSampleProject(workspaceSlug, id);
      router.push(href, { transitionTypes: nav.open });
    } catch (error) {
      toast.error(errorText(error));
      setCreating(null);
    }
  };

  return (
    <ul className={cn("grid gap-2", className)}>
      {sampleCatalog.map((sample) => (
        <li key={sample.id}>
          <button
            type="button"
            disabled={creating !== null}
            onClick={() => void start(sample.id)}
            className="flex w-full items-start gap-3 rounded-lg border bg-card p-3 text-left transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 hover:border-ember/50 hover:bg-ember/[0.04] disabled:pointer-events-none disabled:opacity-60"
          >
            <Icon name={sample.icon} className="mt-0.5 size-6 shrink-0 text-ember-ink" />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{creating === sample.id ? "Creating…" : sample.label}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{sample.description}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
