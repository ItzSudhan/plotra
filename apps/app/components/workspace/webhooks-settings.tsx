"use client";

import { webhookEvents, type WebhookEvent } from "@plotra/db/schema";
import { Icon } from "@plotra/icons";
import { Button } from "@plotra/ui/components/button";
import { confirm } from "@plotra/ui/components/dialogs";
import { Input } from "@plotra/ui/components/input";
import { Switch } from "@plotra/ui/components/switch";
import { cn } from "@plotra/ui/lib/utils";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { errorText } from "@/lib/errors";
import { createWebhook, deleteWebhook, listWebhooks, rotateWebhookSecret, testWebhook, updateWebhook, type WebhookRow } from "@/lib/webhook-actions";
import { deliveryText, statusIn } from "./settings-helpers";
import { ManagersOnly } from "./structure-settings";
import { useWorkspace } from "./workspace-provider";

// Project settings → Webhooks (lib/webhooks.ts): where this project tells
// another service when something happens in it. Managers only: the list and
// its secrets don't load for anyone else.

const eventLabels: Record<WebhookEvent, string> = {
  "note.created": "A note is made",
  "note.updated": "A note is saved (at most every 5 minutes a note)",
  "note.renamed": "A note is renamed",
  "note.trashed": "A note goes in the trash",
  "note.restored": "A note comes back from the trash",
  "comment.added": "A comment or a reply",
  "version.named": "A version is named",
  "version.restored": "A version is restored",
  "release.cut": "A release is made",
  "project.shared": "The project is shared with someone",
};

const when = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function EventPicker({ value, onChange, disabled }: { value: WebhookEvent[]; onChange: (next: WebhookEvent[]) => void; disabled?: boolean }) {
  const all = value.length === 0;
  return (
    <fieldset className="grid gap-1.5 text-ui-sm" disabled={disabled}>
      <legend className="sr-only">What to send</legend>
      <label className="flex min-h-8 items-center gap-2">
        <input type="checkbox" checked={all} onChange={(e) => onChange(e.target.checked ? [] : ["note.created"])} className="size-4 accent-[var(--ember)]" />
        Every event, including ones added later
      </label>
      {!all && (
        <div className="grid gap-1 pl-6 sm:grid-cols-2">
          {webhookEvents.map((event) => (
            <label key={event} className="flex min-h-8 items-center gap-2 text-ui-sm">
              <input
                type="checkbox"
                checked={value.includes(event)}
                onChange={(e) => {
                  const next = e.target.checked ? [...value, event] : value.filter((v) => v !== event);
                  if (next.length) onChange(next);
                }}
                className="size-4 shrink-0 accent-[var(--ember)]"
              />
              <span>{eventLabels[event]}</span>
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

function Hook({ hook, projectId, onChange, onDelete }: { hook: WebhookRow; projectId: string; onChange: (row: WebhookRow) => void; onDelete: () => void }) {
  const [busy, setBusy] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const run = async <T,>(work: () => Promise<T>, done?: (value: T) => void) => {
    setBusy(true);
    try {
      done?.(await work());
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(false);
    }
  };
  const failing = hook.failures > 0 || (!hook.enabled && hook.lastError);
  const result = hook.lastError ? deliveryText(hook.lastStatus ?? statusIn(hook.lastError), hook.lastError) : deliveryText(hook.lastStatus, null);

  return (
    <li className="grid gap-3 rounded-lg border bg-card p-3.5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-meta">{hook.url}</p>
          <p className={cn("mt-0.5 text-xs", failing ? "text-destructive" : "text-muted-foreground")}>
            {hook.lastDeliveryAt
              ? `Last message, ${when.format(new Date(hook.lastDeliveryAt))}: ${result}${hook.failures > 1 ? ` ${hook.failures} in a row didn't get through.` : ""}`
              : "Nothing sent yet."}
            {!hook.enabled && hook.failures >= 20 ? " Switched off after 20 in a row didn't get through." : ""}
          </p>
        </div>
        <Switch checked={hook.enabled} disabled={busy} aria-label={`Send messages to ${hook.url}`} onCheckedChange={(enabled) => void run(() => updateWebhook(projectId, hook.id, { enabled }), onChange)} />
      </div>
      <EventPicker value={hook.events} disabled={busy} onChange={(events) => void run(() => updateWebhook(projectId, hook.id, { events }), onChange)} />
      <div className="grid gap-1 text-xs text-muted-foreground">
        <span>
          <span className="font-medium text-foreground">Secret key.</span> Give it to the other service, so it can tell a message really came from Plotra.
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-meta text-foreground">{showSecret ? hook.secret : `${hook.secret.slice(0, 10)}${"•".repeat(16)}`}</code>
          <Button type="button" size="sm" variant="ghost" onClick={() => setShowSecret(!showSecret)}>
            {showSecret ? "Hide" : "Show"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() =>
              navigator.clipboard.writeText(hook.secret).then(
                () => toast.success("Secret key copied."),
                () => toast.error("Couldn't copy. Show it and copy it."),
              )
            }
          >
            <Icon name="copy-linear" />
            Copy
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={async () => {
              const ok = await confirm({
                title: "Make a new secret key?",
                description: "The old key stops working at once. Until you give the other service the new one, it can't check that messages came from Plotra.",
                confirmLabel: "Make a new key",
              });
              if (!ok) return;
              void run(() => rotateWebhookSecret(projectId, hook.id), (row) => {
                onChange(row);
                setShowSecret(true);
              });
            }}
          >
            <Icon name="refresh-linear" />
            New key
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 border-t pt-3">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() =>
            void run(
              () => testWebhook(projectId, hook.id),
              (result) => {
                if (result.ok) toast.success("Delivered. The other service accepted it.");
                else toast.error(deliveryText(result.status ?? statusIn(result.error), result.error));
                void listWebhooks(projectId).then((rows) => {
                  const fresh = rows.find((row) => row.id === hook.id);
                  if (fresh) onChange(fresh);
                });
              },
            )
          }
        >
          <Icon name="bolt-linear" />
          Send a test
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          className="text-destructive"
          onClick={async () => {
            const ok = await confirm({
              title: "Remove this webhook?",
              description: `Nothing more is sent to ${hook.url}, and its secret key is forgotten.`,
              confirmLabel: "Remove",
            });
            if (!ok) return;
            void run(() => deleteWebhook(projectId, hook.id), onDelete);
          }}
        >
          Remove
        </Button>
      </div>
    </li>
  );
}

export function WebhooksSettings() {
  const { project } = useWorkspace();
  const canManage = project.actions.includes("manage");
  const [hooks, setHooks] = useState<WebhookRow[] | null>(null);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!canManage) return;
    let current = true;
    listWebhooks(project.id)
      .then((rows) => current && setHooks(rows))
      .catch((error) => current && toast.error(errorText(error)));
    return () => {
      current = false;
    };
  }, [canManage, project.id]);

  if (!canManage) return <ManagersOnly />;
  if (!hooks) return <p className="text-ui-sm text-muted-foreground">Loading…</p>;

  const add = async () => {
    setBusy(true);
    try {
      const row = await createWebhook(project.id, { url, events });
      setHooks([...hooks, row]);
      setUrl("");
      setEvents([]);
      toast.success("Webhook added. Give its secret key to the other service.");
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6">
      {hooks.length > 0 && (
        <ul className="grid gap-3">
          {hooks.map((hook) => (
            <Hook
              key={hook.id}
              hook={hook}
              projectId={project.id}
              onChange={(row) => setHooks((all) => all?.map((h) => (h.id === row.id ? row : h)) ?? null)}
              onDelete={() => setHooks((all) => all?.filter((h) => h.id !== hook.id) ?? null)}
            />
          ))}
        </ul>
      )}
      <form
        className="grid gap-3 rounded-lg border border-dashed p-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <label className="grid gap-1.5 text-ui-sm">
          <span className="font-medium">{hooks.length ? "Another webhook" : "Add a webhook"}</span>
          <span className="text-xs text-muted-foreground">The web address the other service gave you for receiving messages.</span>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/plotra-hook" inputMode="url" required className="font-mono text-xs" />
        </label>
        <EventPicker value={events} onChange={setEvents} />
        <div>
          <Button type="submit" size="sm" disabled={busy || !url.trim()}>
            <Icon name="add-linear" />
            Add webhook
          </Button>
        </div>
      </form>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Each message says what happened, to which note, who did it and when: titles only, never your writing. If one doesn&apos;t get through, Plotra tries twice more;
        after 20 in a row the webhook switches itself off.
      </p>
      <details className="text-xs leading-relaxed text-muted-foreground">
        <summary className="w-fit cursor-pointer rounded-md py-1 font-medium hover:text-foreground">Details for developers</summary>
        <div className="mt-2 grid gap-2">
          <p>
            Each event is an HTTP POST of JSON. The <code className="font-mono">Plotra-Signature</code> header signs the body with the secret key. Event names:
          </p>
          <ul className="grid gap-0.5 sm:grid-cols-2">
            {webhookEvents.map((event) => (
              <li key={event}>
                <code className="font-mono">{event}</code>: {eventLabels[event].toLowerCase()}
              </li>
            ))}
          </ul>
        </div>
      </details>
    </div>
  );
}
