"use client";

import { Icon } from "@plotra/icons";
import { Button } from "@plotra/ui/components/button";
import { Input } from "@plotra/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@plotra/ui/components/select";
import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { createApiToken, revokeApiToken, type ApiTokenRow, type ConnectedAppRow } from "@/lib/api/token-actions";
import { ConfirmDialog } from "./confirm-dialog";
import { List, Section } from "./ui";
import { useRun } from "./use-run";

// Settings → API tokens (beat-the-competitors.md step 9): tokens for scripts,
// automations and AI assistants (the MCP server) to use Plotra as you. A new
// token is shown once, here, and never again.

const expiries = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "A year" },
  { value: "never", label: "Never" },
];

const noop = () => () => {};
const useOrigin = () => useSyncExternalStore(noop, () => window.location.origin, () => "");

function copy(text: string) {
  void navigator.clipboard.writeText(text).then(
    () => toast.success("Copied."),
    () => toast.error("Couldn't copy. Select it and copy it yourself."),
  );
}

const when = (date: Date | string | null) => (date ? new Date(date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : null);

export function ApiTokens({ tokens, apps }: { tokens: ApiTokenRow[]; apps: ConnectedAppRow[] }) {
  const { run, pending } = useRun();
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"read" | "write">("read");
  const [expiry, setExpiry] = useState("90");
  const [fresh, setFresh] = useState<string | null>(null);
  const base = useOrigin();

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    const done = await run(() => createApiToken(name, scope, expiry === "never" ? null : Number(expiry)));
    if (!done) return;
    setFresh(done.value.token);
    setName("");
  };

  return (
    <Section
      title="API tokens"
      description="Let scripts, automations and AI assistants such as Claude or Cursor read and write your projects, as you. A token can do what you can, in the projects you can open, and no more."
    >
      {fresh && (
        <div className="grid gap-2 rounded-lg border border-ember/40 bg-card p-4">
          <p className="text-sm font-medium">Your new token</p>
          <p className="text-ui-sm text-muted-foreground">Copy it now: it won&apos;t be shown again. Anyone who has it can act as you, so keep it as you would a password.</p>
          <div className="flex gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md border bg-muted px-2 py-1.5 font-mono text-meta">{fresh}</code>
            <Button type="button" size="sm" variant="outline" onClick={() => copy(fresh)}>
              <Icon name="copy-linear" className="size-3.5" />
              Copy
            </Button>
          </div>
          <Button type="button" size="sm" variant="ghost" className="justify-self-start" onClick={() => setFresh(null)}>
            I&apos;ve copied it
          </Button>
        </div>
      )}

      <form onSubmit={create} className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
        <label className="grid gap-1.5 text-ui-sm">
          <span className="text-muted-foreground">Name</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Claude on my laptop" maxLength={80} className="h-8 text-ui-sm" />
        </label>
        <label className="grid gap-1.5 text-ui-sm">
          <span className="text-muted-foreground">Can</span>
          <Select value={scope} onValueChange={(v) => setScope(v as "read" | "write")}>
            <SelectTrigger size="sm" className="w-full text-ui-sm sm:w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="read">Read only</SelectItem>
              <SelectItem value="write">Read and write</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label className="grid gap-1.5 text-ui-sm">
          <span className="text-muted-foreground">Expires</span>
          <Select value={expiry} onValueChange={setExpiry}>
            <SelectTrigger size="sm" className="w-full text-ui-sm sm:w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {expiries.map((e) => (
                <SelectItem key={e.value} value={e.value}>
                  {e.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <Button type="submit" size="sm" disabled={pending || !name.trim()}>
          Make a token
        </Button>
      </form>

      <List empty="No tokens yet.">
        {tokens.map((t) => {
          const expired = t.expiresAt && new Date(t.expiresAt) <= new Date();
          return (
            <li key={t.id} className="flex items-center gap-3 px-3 py-2.5">
              <Icon name="key-minimalistic-linear" className="size-4 shrink-0 text-faint" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{t.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  <span className="font-mono">{t.prefix}…</span> · {t.scope === "write" ? "Read and write" : "Read only"} · {t.lastUsedAt ? `Last used ${when(t.lastUsedAt)}` : "Never used"} ·{" "}
                  {expired ? <span className="text-destructive">Expired</span> : t.expiresAt ? `Expires ${when(t.expiresAt)}` : "Never expires"}
                </p>
              </div>
              <ConfirmDialog
                trigger={
                  <Button type="button" size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive">
                    Revoke
                  </Button>
                }
                title={`Revoke “${t.name}”?`}
                description="Anything using it stops working at once. This can't be undone; you can always make another."
                confirmLabel="Revoke"
                onConfirm={() => run(() => revokeApiToken(t.id), "Revoked.")}
              />
            </li>
          );
        })}
      </List>

      {apps.length > 0 && (
        <div className="grid gap-2">
          <p className="text-ui-sm font-medium">Connected apps</p>
          <List empty="">
            {apps.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-3 py-2.5">
                <Icon name="plug-circle-linear" className="size-4 shrink-0 text-faint" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{a.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {a.scope === "write" ? "Read and write" : "Read only"} · Connected {when(a.createdAt)} · {a.lastUsedAt ? `Last used ${when(a.lastUsedAt)}` : "Never used"}
                  </p>
                </div>
                <ConfirmDialog
                  trigger={
                    <Button type="button" size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive">
                      Disconnect
                    </Button>
                  }
                  title={`Disconnect “${a.name}”?`}
                  description="It loses access at once. You can connect it again from the app whenever you like."
                  confirmLabel="Disconnect"
                  onConfirm={() => run(() => revokeApiToken(a.id), "Disconnected.")}
                />
              </li>
            ))}
          </List>
        </div>
      )}

      <details className="rounded-lg border bg-card text-ui-sm">
        <summary className="cursor-pointer px-4 py-3 font-medium">Connect an AI assistant (MCP)</summary>
        <div className="grid gap-2 border-t px-4 py-3 text-muted-foreground">
          <p>
            Plotra is an MCP server at <code className="rounded bg-muted px-1 font-mono text-meta text-foreground">{base}/api/mcp</code>. In Claude, add it as a custom connector (Settings → Connectors) and sign in when asked: no token needed. Claude Code
            does the same:
          </p>
          <pre className="overflow-x-auto rounded-md bg-muted p-2 font-mono text-meta text-foreground">{`claude mcp add --transport http plotra ${base}/api/mcp`}</pre>
          <p>An assistant only opens projects where AI is switched on, by the workspace&apos;s owner and in the project. Clients that can&apos;t sign in take a token as a bearer token instead:</p>
          <pre className="overflow-x-auto rounded-md bg-muted p-2 font-mono text-meta text-foreground">{`claude mcp add --transport http plotra ${base}/api/mcp \\
  --header "Authorization: Bearer plt_…"`}</pre>
          <p>
            The REST API is at <code className="rounded bg-muted px-1 font-mono text-meta text-foreground">{base}/api/v1</code>, with the same token:
          </p>
          <pre className="overflow-x-auto rounded-md bg-muted p-2 font-mono text-meta text-foreground">{`curl -H "Authorization: Bearer plt_…" ${base}/api/v1/projects`}</pre>
        </div>
      </details>
    </Section>
  );
}
