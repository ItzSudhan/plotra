"use client";

import type { BillingInterval } from "@plotra/db/schema";
import { Icon, type IconName } from "@plotra/icons";
import { Button } from "@plotra/ui/components/button";
import { cn } from "@plotra/ui/lib/utils";
import { useState } from "react";
import { toast } from "sonner";
import { openBillingPortal, startCheckout, type BillingView } from "@/lib/billing/actions";
import { freeLimits, MAX_GUESTS, planLabel, proLimits, proPrice } from "@/lib/billing/plans";
import { errorText } from "@/lib/errors";
import { Section } from "./ui";

const MB = 1024 * 1024;
const bytes = (value: number) => (value >= 1024 * MB ? `${+(value / (1024 * MB)).toFixed(1)} GB` : `${Math.round(value / MB)} MB`);
const count = (value: number) => value.toLocaleString("en");
const day = new Intl.DateTimeFormat("en", { month: "long", day: "numeric", year: "numeric" });

/** What the status line says about a subscription that isn't simply active. */
function statusNote(billing: BillingView): string | null {
  const end = billing.periodEnd ? day.format(new Date(billing.periodEnd)) : null;
  switch (billing.status) {
    case "active":
    case "trialing":
      return end ? `Renews on ${end}.` : null;
    case "scheduled_cancel":
      return end ? `Cancelled. Pro stays until ${end}, then the workspace goes back to Free.` : "Cancelled. Pro stays until the end of the paid period.";
    case "past_due":
      return "The last payment didn't go through and is being retried. Update the payment method under Manage billing to keep Pro.";
    case "unpaid":
    case "expired":
      return "The subscription ended because a payment failed. Nothing was deleted; the Free limits apply to anything new.";
    case "canceled":
      return "The subscription was cancelled. Nothing was deleted; the Free limits apply to anything new.";
    case "paused":
      return "The subscription is paused. The Free limits apply until it resumes.";
    default:
      return null;
  }
}

/** The workspace's plan, what it uses, and the way to Pro and back (plan.md 8). */
export function BillingSection({ workspaceSlug, billing }: { workspaceSlug: string; billing: BillingView }) {
  const [leaving, setLeaving] = useState<"month" | "year" | "portal" | null>(null);
  const pro = billing.plan === "pro";
  const note = statusNote(billing);

  // Both lead off the site, to Creem: there is nothing to refresh here afterwards.
  const leave = async (what: NonNullable<typeof leaving>, link: () => Promise<{ url: string }>) => {
    setLeaving(what);
    try {
      window.location.assign((await link()).url);
    } catch (error) {
      toast.error(errorText(error));
      setLeaving(null);
    }
  };

  const { usage } = billing;
  return (
    <div className="grid gap-10">
      <Section title="Plan" description="A plan belongs to the workspace, not to a person: everyone in it shares the same limits.">
        <div className="grid gap-4 rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 text-sm font-medium">
                {planLabel[billing.plan]}
                {pro && billing.interval && <span className="rounded bg-ember/15 px-1.5 text-meta font-normal text-ember-ink">{proPrice[billing.interval].label}</span>}
              </p>
              {note && <p className="mt-0.5 text-ui-sm text-muted-foreground">{note}</p>}
              {!pro && !note && <p className="mt-0.5 text-ui-sm text-muted-foreground">Every feature is included. Pro raises the limits and adds AI.</p>}
            </div>
            {billing.hasCustomer && billing.canManage && (
              <Button type="button" variant="outline" size="sm" disabled={leaving !== null} onClick={() => void leave("portal", () => openBillingPortal(workspaceSlug))}>
                {leaving === "portal" ? "Opening…" : "Manage billing"}
                <Icon name="arrow-right-up-linear" />
              </Button>
            )}
          </div>
          <dl className="grid gap-3 border-t pt-4 sm:grid-cols-2">
            <Meter icon="folder-linear" label="Projects" used={usage.projects.used} limit={usage.projects.limit} format={count} />
            <Meter icon="database-linear" label="Storage" used={usage.storage.used} limit={usage.storage.limit} format={bytes} />
            <Meter icon="users-group-rounded-linear" label="Members" used={usage.members.used} limit={usage.members.limit} format={count} />
            {usage.credits && (
              <Meter
                icon="magic-stick-3-linear"
                label="AI credits this month"
                used={usage.credits.used}
                limit={usage.credits.allowance}
                format={count}
                hint={`Full again on ${day.format(new Date(usage.credits.resetsAt))}. A person's own key uses none.`}
              />
            )}
          </dl>
        </div>
      </Section>

      {!pro && (
        <Section title="Upgrade to Pro" description="Paid through Creem, which handles the card, the tax and the invoice. Cancel whenever you like; Pro then runs to the end of what was paid for.">
          <div className="grid gap-4 rounded-lg border bg-card p-4">
            <ul className="grid gap-2 text-ui-sm sm:grid-cols-2">
              <Perk>Unlimited projects, up from {usage.projects.limit ?? "no limit"}</Perk>
              <Perk>
                {bytes(proLimits.storageBytes!)} of storage, files up to {bytes(proLimits.fileBytes!)}
              </Perk>
              <Perk>
                {proLimits.members} members, up from {freeLimits.members}
              </Perk>
              <Perk>
                Share a project with {MAX_GUESTS} people, up from {freeLimits.guests}
              </Perk>
              {billing.hostedAi && <Perk>{count(proLimits.aiCredits)} AI credits a month: the agent with no key of your own</Perk>}
            </ul>
            {billing.canManage ? (
              <div className="flex flex-wrap gap-2 border-t pt-4">
                {(["year", "month"] as const satisfies readonly BillingInterval[])
                  .filter((interval) => billing.sells[interval])
                  .map((interval, index) => (
                    <Button
                      key={interval}
                      type="button"
                      size="sm"
                      variant={index === 0 ? "default" : "outline"}
                      disabled={leaving !== null}
                      onClick={() => void leave(interval, () => startCheckout(workspaceSlug, interval))}
                    >
                      {leaving === interval ? "Opening checkout…" : proPrice[interval].label}
                      <span className="font-normal opacity-70">{proPrice[interval].note}</span>
                    </Button>
                  ))}
                {!billing.sells.month && !billing.sells.year && <p className="text-ui-sm text-muted-foreground">Pro isn&apos;t on sale on this server yet.</p>}
              </div>
            ) : (
              <p className="border-t pt-4 text-ui-sm text-muted-foreground">Only an owner of the workspace can change its plan.</p>
            )}
          </div>
        </Section>
      )}
    </div>
  );
}

function Perk({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <Icon name="check-circle-linear" className="mt-0.5 size-4 shrink-0 text-ember-ink" />
      <span>{children}</span>
    </li>
  );
}

function Meter({ icon, label, used, limit, format, hint }: { icon: IconName; label: string; used: number; limit: number | null; format: (value: number) => string; hint?: string }) {
  const share = limit ? Math.min(1, used / limit) : 0;
  return (
    <div className="grid gap-1.5">
      <dt className="flex items-center gap-1.5 text-ui-sm text-muted-foreground">
        <Icon name={icon} className="size-4" />
        {label}
      </dt>
      <dd className="grid gap-1.5">
        <span className="text-ui-sm tabular-nums">
          {format(used)}
          <span className="text-muted-foreground"> of {limit === null ? "unlimited" : format(limit)}</span>
        </span>
        {limit !== null && (
          <span className="h-1 overflow-hidden rounded-full bg-muted" role="presentation">
            <span className={cn("block h-full rounded-full", share >= 1 ? "bg-destructive" : "bg-ember")} style={{ width: `${Math.max(share * 100, used > 0 ? 2 : 0)}%` }} />
          </span>
        )}
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </dd>
    </div>
  );
}
