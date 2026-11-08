import { Icon } from "@plotra/icons";
import type { NoAiPromise } from "@/lib/agent/no-ai";

const dateFormat = new Intl.DateTimeFormat("en", { month: "long", day: "numeric", year: "numeric" });
const dateOf = (iso: string) => dateFormat.format(new Date(iso));

/**
 * A workspace's promise of no AI, on its home page, for every member to see
 * (lib/agent/no-ai.ts); and, for 30 days after it's lifted, who lifted it and
 * when AI may come back. Nothing when there is no promise.
 */
export function NoAiBanner({ promise, removed }: { promise: NoAiPromise | null; removed: boolean }) {
  if (removed) {
    return (
      <p className="mb-6 flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-ui-sm text-muted-foreground">
        <Icon name="shield-check-linear" className="size-4 shrink-0 text-ember-ink" />
        <span>
          <span className="font-medium text-foreground">No AI.</span> This copy of Plotra has no AI in it.
        </span>
      </p>
    );
  }
  if (!promise) return null;
  if (promise.liftedAt) {
    return (
      <p className="mb-6 flex items-start gap-2 rounded-lg border border-dashed px-3 py-2 text-ui-sm text-muted-foreground">
        <Icon name="danger-circle-linear" className="mt-0.5 size-4 shrink-0" />
        <span>
          <span className="font-medium text-foreground">The promise of no AI was lifted</span>
          {promise.liftedByName ? ` by ${promise.liftedByName}` : ""} on {dateOf(promise.liftedAt)}.{" "}
          {promise.active && promise.endsAt ? `AI stays off until ${dateOf(promise.endsAt)}.` : "AI may now be switched on by the workspace's owner."}
        </span>
      </p>
    );
  }
  return (
    <p className="mb-6 flex items-start gap-2 rounded-lg border bg-card px-3 py-2 text-ui-sm text-muted-foreground">
      <Icon name="shield-check-linear" className="mt-0.5 size-4 shrink-0 text-ember-ink" />
      <span>
        <span className="font-medium text-foreground">No AI in this workspace.</span>{" "}
        {promise.byName ?? "Its owner"} promised it on {dateOf(promise.since)}: nobody can switch AI on, and only the owner can lift the promise.
      </span>
    </p>
  );
}
