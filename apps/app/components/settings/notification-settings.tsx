"use client";

import type { EmailPreference } from "@plotra/db/schema";
import { cn } from "@plotra/ui/lib/utils";
import { updateUserPrefs, type UserPrefs } from "@/lib/notify-actions";
import { Section } from "./ui";
import { useRun } from "./use-run";

// Settings → Notifications (plan.md 2.6): whether notifications are also
// emailed. They always show under the bell in a project; this only decides
// what reaches the inbox.

const choices: Array<{ value: EmailPreference; label: string; description: string }> = [
  { value: "daily", label: "A daily digest", description: "One email a day listing what you haven't read. Nothing is sent on a day with nothing new." },
  { value: "each", label: "Each one", description: "An email when it happens, up to twelve an hour. Anything past that waits for the next day's digest." },
  { value: "off", label: "Off", description: "No notification emails. Invitations and sharing emails still arrive, since they carry the link you need." },
];

export function NotificationSettings({ prefs }: { prefs: UserPrefs }) {
  const { run, pending } = useRun();

  return (
    <Section
      title="Email notifications"
      description="Mentions, replies to your comment threads, review requests and decisions. Emails say who did what and where, and never include the text itself."
    >
      <div role="radiogroup" aria-label="Email notifications" className="grid divide-y rounded-lg border bg-card">
        {choices.map((choice) => {
          const checked = prefs.emailNotifications === choice.value;
          return (
            <label key={choice.value} className={cn("flex cursor-pointer items-start gap-3 p-4", pending && "cursor-default opacity-60")}>
              <input
                type="radio"
                name="email-notifications"
                value={choice.value}
                checked={checked}
                disabled={pending}
                onChange={() => void run(() => updateUserPrefs({ emailNotifications: choice.value }), "Saved.")}
                className="mt-0.5 size-4 accent-ember"
              />
              <span className="grid gap-0.5">
                <span className="text-sm font-medium">{choice.label}</span>
                <span className="text-ui-sm text-muted-foreground">{choice.description}</span>
              </span>
            </label>
          );
        })}
      </div>
    </Section>
  );
}
