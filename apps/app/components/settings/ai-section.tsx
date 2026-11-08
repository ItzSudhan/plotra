"use client";

import { Icon } from "@plotra/icons";
import { confirm } from "@plotra/ui/components/dialogs";
import { cn } from "@plotra/ui/lib/utils";
import Link from "next/link";
import { nav } from "@/components/transitions";
import { setWorkspaceAi, setWorkspaceNoAi, type WorkspaceAi } from "@/lib/agent-actions";
import type { PlanId } from "@/lib/billing/plans";
import { Section } from "./ui";
import { useRun } from "./use-run";

const dateFormat = new Intl.DateTimeFormat("en", { month: "long", day: "numeric", year: "numeric" });
const dateOf = (iso: string) => dateFormat.format(new Date(iso));

/** Taken out by whoever runs the server: nothing to switch. */
function RemovedNotice() {
  return (
    <Section title="AI in this workspace">
      <div className="flex gap-3 rounded-lg border bg-card p-4 text-ui-sm">
        <Icon name="shield-check-linear" className="mt-0.5 size-4 shrink-0 text-ember-ink" />
        <p>
          <span className="font-medium">There is no AI on this server.</span>{" "}
          <span className="text-muted-foreground">Whoever runs it has taken AI out, so no workspace can switch it on and nobody can add a key.</span>
        </p>
      </div>
    </Section>
  );
}

/** The owner's promise of no AI (lib/agent/no-ai.ts): made, lifted, or not yet made. */
function NoAiPromiseSection({ workspaceSlug, ai }: { workspaceSlug: string; ai: WorkspaceAi }) {
  const { run, pending } = useRun();
  const { promise, isOwner } = ai;
  const lifted = promise?.liftedAt ? promise : null;
  const standing = promise?.active && !lifted ? promise : null;

  return (
    <Section
      title="A promise of no AI"
      description="For a workspace whose writers want none: AI can't be switched on by anyone, and everyone in the workspace sees the promise on its home page."
    >
      <div className="grid gap-3 rounded-lg border bg-card p-4 text-ui-sm">
        {standing ? (
          <p className="flex gap-2">
            <Icon name="shield-check-linear" className="mt-0.5 size-4 shrink-0 text-ember-ink" />
            <span>
              <span className="font-medium">Promised{standing.byName ? ` by ${standing.byName}` : ""} on {dateOf(standing.since)}.</span>{" "}
              <span className="text-muted-foreground">Nobody can switch AI on, admins included. Only the owner can lift it.</span>
            </span>
          </p>
        ) : lifted?.endsAt ? (
          <p className="flex gap-2">
            <Icon name="danger-circle-linear" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span>
              <span className="font-medium">
                Lifted{lifted.liftedByName ? ` by ${lifted.liftedByName}` : ""} on {dateOf(lifted.liftedAt!)}.
              </span>{" "}
              <span className="text-muted-foreground">
                {lifted.active ? `AI stays off until ${dateOf(lifted.endsAt)}; after that the owner may switch it on.` : "The owner may switch AI on again."} The workspace&apos;s home page
                says so for 30 days.
              </span>
            </span>
          </p>
        ) : (
          <p className="text-muted-foreground">
            No promise is made. Making one switches AI off at once and keeps it off. If it is ever lifted, AI stays off for seven more days, and everyone in the
            workspace is shown who lifted it and when.
          </p>
        )}
        {isOwner ? (
          <div>
            {standing ? (
              <button
                type="button"
                disabled={pending}
                onClick={async () => {
                  const ok = await confirm({
                    title: "Lift the promise of no AI?",
                    description: "AI stays off for seven more days, and everyone in the workspace is shown that you lifted it.",
                    confirmLabel: "Lift the promise",
                  });
                  if (!ok) return;
                  void run(() => setWorkspaceNoAi(workspaceSlug, false), "The promise is lifted. AI stays off for seven days.");
                }}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-ui-sm hover:bg-accent disabled:opacity-50"
              >
                Lift the promise…
              </button>
            ) : (
              <button
                type="button"
                disabled={pending}
                onClick={async () => {
                  const ok = await confirm({
                    title: "Promise this workspace no AI?",
                    description: "AI is switched off now, and nobody but you, its owner, can lift the promise.",
                    confirmLabel: "Promise no AI",
                    destructive: false,
                  });
                  if (!ok) return;
                  void run(() => setWorkspaceNoAi(workspaceSlug, true), "This workspace has promised no AI.");
                }}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-ui-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                <Icon name="shield-check-linear" className="size-4" />
                {lifted ? "Promise no AI again" : "Promise no AI"}
              </button>
            )}
          </div>
        ) : (
          <p className="text-xs text-faint">Only the workspace&apos;s owner can make or lift the promise.</p>
        )}
      </div>
    </Section>
  );
}

/** The workspace's AI switch (plan.md 2.11 "Trust"): off until the owner turns it on. */
export function AiSection({ workspaceSlug, ai, hosted }: { workspaceSlug: string; ai: WorkspaceAi; /** The workspace's plan, where Pro includes hosted AI; null where it doesn't exist. */ hosted: PlanId | null }) {
  const { run, pending } = useRun();
  if (ai.removed) return <RemovedNotice />;
  const { enabled } = ai;
  const locked = ai.promise?.active ?? false;

  return (
    <div className="grid gap-10">
      <Section title="AI in this workspace" description="Off until the workspace's owner turns it on. While it is off, no AI control is shown anywhere in the workspace's projects.">
        <div className="grid gap-4 rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p id="workspace-ai-label" className="text-sm font-medium">
                Allow AI in this workspace
              </p>
              <p className="mt-0.5 text-ui-sm text-muted-foreground">
                {enabled ? "On. Each project still has its own switch." : locked ? "Off, and kept off by the promise below." : "Off."}
                {!ai.isOwner && " Only the workspace's owner can change this."}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-labelledby="workspace-ai-label"
              disabled={pending || !ai.isOwner || (locked && !enabled)}
              onClick={() => void run(() => setWorkspaceAi(workspaceSlug, !enabled), enabled ? "AI is off for this workspace." : "AI is on for this workspace.")}
              className={cn(
                "relative h-5 w-9 shrink-0 rounded-full after:absolute after:-inset-1.5 after:content-[''] transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50",
                enabled ? "bg-ember" : "bg-muted-foreground/30",
              )}
            >
              <span className={cn("absolute top-0.5 left-0.5 size-4 rounded-full bg-background shadow-xs transition-transform", enabled && "translate-x-4")} />
            </button>
          </div>
          <ul className="grid gap-2 border-t pt-4 text-ui-sm text-muted-foreground">
            <li className="flex gap-2">
              <Icon name="widget-4-linear" className="mt-0.5 size-4 shrink-0" />
              <span>
                <span className="text-foreground">Then switch it on per project.</span> Open a project, then Project settings → Tools → AI agent. Only people who can edit a project can
                use AI in it.
              </span>
            </li>
            <li className="flex gap-2">
              <Icon name="key-linear" className="mt-0.5 size-4 shrink-0" />
              <span>
                {hosted === "pro" ? (
                  <>
                    <span className="text-foreground">AI is included in Pro.</span> Runs use the workspace&apos;s monthly credits, shown under{" "}
                    <Link href={`/w/${workspaceSlug}/settings?tab=billing`} className="text-foreground underline underline-offset-2">
                      Plan &amp; billing
                    </Link>
                    . Anyone who adds a key of their own in{" "}
                    <Link href="/settings" transitionTypes={nav.forward} className="text-foreground underline underline-offset-2">
                      their settings
                    </Link>{" "}
                    runs on that instead and uses no credits.
                  </>
                ) : (
                  <>
                    <span className="text-foreground">Everyone brings their own model.</span> Each person adds a key for a provider they choose, in{" "}
                    <Link href="/settings" transitionTypes={nav.forward} className="text-foreground underline underline-offset-2">
                      their own settings
                    </Link>
                    .{" "}
                    {hosted === "free" ? (
                      <>
                        Or{" "}
                        <Link href={`/w/${workspaceSlug}/settings?tab=billing`} className="text-foreground underline underline-offset-2">
                          upgrade to Pro
                        </Link>
                        , which includes AI with no key.
                      </>
                    ) : (
                      "Plotra has no model of its own and never charges for one."
                    )}
                  </>
                )}
              </span>
            </li>
            <li className="flex gap-2">
              <Icon name="shield-check-linear" className="mt-0.5 size-4 shrink-0" />
              <span>
                <span className="text-foreground">What leaves Plotra.</span> When someone uses AI, the notes it reads are sent to the provider that person chose
                {hosted === "pro" ? ", or to the provider behind Plotra's included AI when they have no key of their own," : ""} and nowhere else. Nothing is sent unless someone asks.
              </span>
            </li>
          </ul>
        </div>
      </Section>
      <NoAiPromiseSection workspaceSlug={workspaceSlug} ai={ai} />
    </div>
  );
}
