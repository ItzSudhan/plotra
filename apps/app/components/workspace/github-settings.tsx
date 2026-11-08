"use client";

import { Icon } from "@plotra/icons";
import { Button } from "@plotra/ui/components/button";
import { confirm } from "@plotra/ui/components/dialogs";
import { Input } from "@plotra/ui/components/input";
import { Switch } from "@plotra/ui/components/switch";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { errorText } from "@/lib/errors";
import { getGitSync, removeGitSync, saveGitSync, setGitSyncEnabled, suggestGitFolder, syncGitNow, type GitSyncState } from "@/lib/git-sync-actions";
import { ManagersOnly } from "./structure-settings";
import { useWorkspace } from "./workspace-provider";

// Project settings → GitHub (lib/git-sync.ts): the project kept in a GitHub
// repository as Markdown files, committed a few minutes after each change.
// Managers only: nothing loads for anyone else.

const when = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function GitHubSettings() {
  const { project } = useWorkspace();
  const canManage = project.actions.includes("manage");
  const [state, setState] = useState<GitSyncState | null | undefined>(undefined);
  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState("main");
  const [path, setPath] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!canManage) return;
    let current = true;
    Promise.all([getGitSync(project.id), suggestGitFolder(project.id)])
      .then(([sync, folder]) => {
        if (!current) return;
        setState(sync);
        setRepo(sync?.repo ?? "");
        setBranch(sync?.branch ?? "main");
        setPath(sync ? sync.path : folder);
      })
      .catch((error) => current && toast.error(errorText(error)));
    return () => {
      current = false;
    };
  }, [canManage, project.id]);

  if (!canManage) return <ManagersOnly />;
  if (state === undefined) return <p className="text-ui-sm text-muted-foreground">Loading…</p>;

  const report = ({ state: next, outcome }: { state: GitSyncState; outcome: { ok: boolean; commit: string | null; changed: number; error: string | null } }) => {
    setState(next);
    setToken("");
    if (!outcome.ok) toast.error(errorText(outcome.error, "Couldn't send the changes to GitHub. Check the repository name and the access key."));
    else if (outcome.commit) toast.success(`Sent ${outcome.changed === 1 ? "1 change" : `${outcome.changed} changes`} to ${next.repo}.`);
    else toast.success("GitHub already has everything.");
  };
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-5">
      {state && (
        <div className="grid gap-3 rounded-lg border bg-card p-3.5 text-ui-sm">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <a href={`https://github.com/${state.repo}/tree/${encodeURIComponent(state.branch)}/${state.path}`} target="_blank" rel="noreferrer" className="font-mono text-meta hover:underline">
                {state.repo}/{state.path || ""} on {state.branch}
              </a>
              <p className={state.lastError ? "mt-0.5 text-xs text-destructive" : "mt-0.5 text-xs text-muted-foreground"}>
                {state.lastError
                  ? errorText(state.lastError, "The last copy didn't go through. Check the repository name and the access key.")
                  : state.lastSyncedAt
                    ? `Last copied ${when.format(new Date(state.lastSyncedAt))}.${state.waiting ? " Changes since then go in a few minutes." : ""}`
                    : "Nothing copied yet."}
              </p>
            </div>
            <Switch
              checked={state.enabled}
              disabled={busy}
              aria-label="Keep sending changes to GitHub"
              onCheckedChange={(enabled) => void run(async () => setState(await setGitSyncEnabled(project.id, enabled)))}
            />
          </div>
          <div className="flex flex-wrap gap-2 border-t pt-3">
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run(async () => report(await syncGitNow(project.id)))}>
              <Icon name="refresh-linear" />
              {busy ? "Copying…" : "Copy now"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              className="text-destructive"
              onClick={async () => {
                const ok = await confirm({
                  title: "Stop keeping a copy on GitHub?",
                  description: "Plotra forgets the access key and stops sending changes. Nothing already on GitHub is changed or deleted.",
                  confirmLabel: "Stop",
                });
                if (!ok) return;
                void run(async () => {
                  await removeGitSync(project.id);
                  setState(null);
                  setToken("");
                  toast.success("No longer keeping a copy on GitHub.");
                });
              }}
            >
              Stop
            </Button>
          </div>
        </div>
      )}

      <form
        className="grid gap-3 rounded-lg border border-dashed p-3.5 text-ui-sm"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => report(await saveGitSync(project.id, { repo, branch, path, token })));
        }}
      >
        <p className="font-medium">{state ? "Change where it goes" : "Keep a copy in a GitHub repository"}</p>
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">Repository: your GitHub name, a slash, and the repository&apos;s name</span>
          <Input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="you/my-novel" required className="font-mono text-xs" />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">Branch (leave as main if unsure)</span>
            <Input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" className="font-mono text-xs" />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">Folder in it (empty for the top)</span>
            <Input value={path} onChange={(e) => setPath(e.target.value)} placeholder="manuscript" className="font-mono text-xs" />
          </label>
        </div>
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">
            Access key {state ? `(saved, ending ${state.tokenHint}; leave empty to keep it)` : ""}
          </span>
          <Input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={state ? "Leave empty to keep the saved key" : "Paste the key from GitHub"}
            autoComplete="off"
            className="font-mono text-xs"
          />
          <span className="text-xs leading-relaxed text-muted-foreground">
            A key lets Plotra write to this one repository for you. On GitHub,{" "}
            <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">
              make a new key
            </a>{" "}
            (GitHub calls it a fine-grained token), choose only this repository, and allow it to read and write Contents. Then paste it here.
          </span>
        </label>
        <div>
          <Button type="submit" size="sm" disabled={busy || !repo.trim() || (!state && !token.trim())}>
            {busy ? "Checking…" : "Save and copy"}
          </Button>
        </div>
      </form>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Each note becomes a plain text (Markdown) file, in folders like the binder&apos;s, with links between notes kept, so the copy also opens in Obsidian. Changes are sent a few minutes
        after you make them, and once a day for anything left over. If you delete a note here, its file is deleted there; other files in the folder are left alone.
      </p>
    </div>
  );
}
