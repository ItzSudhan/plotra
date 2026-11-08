"use client";

import { Icon } from "@plotra/icons";
import { Button } from "@plotra/ui/components/button";
import { confirm } from "@plotra/ui/components/dialogs";
import { Input } from "@plotra/ui/components/input";
import { SuggestInput } from "@plotra/ui/components/suggest-input";
import { Switch } from "@plotra/ui/components/switch";
import { authClient } from "@plotra/auth/client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { errorText } from "@/lib/errors";
import {
  createGitHubRepo,
  disconnectGitHub,
  getGitHubConnection,
  getGitSync,
  listGitHubRepos,
  removeGitSync,
  saveGitSync,
  setGitSyncEnabled,
  suggestGitFolder,
  syncGitNow,
  type GitHubConnection,
  type GitHubRepo,
  type GitSyncState,
} from "@/lib/git-sync-actions";
import { ManagersOnly } from "./structure-settings";
import { useWorkspace } from "./workspace-provider";

// Project settings → GitHub (lib/git-sync.ts): the project kept in a GitHub
// repository as Markdown files, committed a few minutes after each change.
// Managers only: nothing loads for anyone else.
//
// With GitHub sign-in set up on the server, the person connects their GitHub
// account in a popup (Better Auth's account linking, back through
// app/api/github/linked), then picks one of their repositories or makes a new
// one. A pasted token still works, for servers without it or anyone who'd
// rather limit the key to one repository.

const when = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Whether GitHub is linked, and if so the repositories it can write to. */
async function fetchConnection(): Promise<{ connection: GitHubConnection; repos: GitHubRepo[] }> {
  const connection = await getGitHubConnection();
  const repos = connection.login ? await listGitHubRepos().catch(() => []) : [];
  return { connection, repos };
}

export function GitHubSettings() {
  const { project } = useWorkspace();
  const canManage = project.actions.includes("manage");
  const [state, setState] = useState<GitSyncState | null | undefined>(undefined);
  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState("main");
  const [path, setPath] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [connection, setConnection] = useState<GitHubConnection>({ available: false, login: null });
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  /** Linked: pick a repository, or make one. Not linked: the pasted key. */
  const [mode, setMode] = useState<"pick" | "create" | "token">("pick");
  const [newName, setNewName] = useState("");
  const [newPrivate, setNewPrivate] = useState(true);
  const [connecting, setConnecting] = useState(false);

  const loadConnection = useCallback(async () => {
    const next = await fetchConnection();
    setConnection(next.connection);
    setRepos(next.repos);
    return next.connection;
  }, []);

  useEffect(() => {
    if (!canManage) return;
    let current = true;
    Promise.all([getGitSync(project.id), suggestGitFolder(project.id), fetchConnection()])
      .then(([sync, folder, { connection: linked, repos: list }]) => {
        if (!current) return;
        setConnection(linked);
        setRepos(list);
        setState(sync);
        setRepo(sync?.repo ?? "");
        setBranch(sync?.branch ?? "main");
        setPath(sync ? sync.path : folder);
        setNewName(folder);
        setMode(linked.available ? "pick" : "token");
      })
      .catch((error) => current && toast.error(errorText(error)));
    return () => {
      current = false;
    };
  }, [canManage, project.id]);

  // The popup says when GitHub is connected (app/api/github/linked).
  useEffect(() => {
    if (!canManage || typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel("plotra-github");
    channel.onmessage = (event: MessageEvent<{ ok?: boolean; message?: string }>) => {
      setConnecting(false);
      if (!event.data?.ok) {
        toast.error(event.data?.message ?? "GitHub wasn't connected.");
        return;
      }
      loadConnection()
        .then((linked) => {
          if (linked.login) {
            setMode("pick");
            toast.success(`Connected to GitHub as ${linked.login}.`);
          }
        })
        .catch((error) => toast.error(errorText(error)));
    };
    return () => channel.close();
  }, [canManage, loadConnection]);

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

  const connect = async () => {
    // Opened now, while the click still counts, and pointed at GitHub once Better Auth has the link.
    const popup = window.open("about:blank", "plotra-github", "popup,width=640,height=760");
    setConnecting(true);
    try {
      const { data, error } = await authClient.linkSocial({
        provider: "github",
        scopes: ["repo"],
        callbackURL: "/api/github/linked",
        errorCallbackURL: "/api/github/linked",
        disableRedirect: true,
      });
      if (error || !data?.url) throw new Error(error?.message || "Couldn't reach GitHub.");
      if (popup && !popup.closed) popup.location.href = data.url;
      else window.location.href = data.url;
    } catch (error) {
      popup?.close();
      setConnecting(false);
      toast.error(errorText(error));
    }
  };

  const submit = () =>
    run(async () => {
      if (mode === "create") {
        const made = await createGitHubRepo({ name: newName, private: newPrivate });
        setRepos((list) => [made, ...list]);
        setRepo(made.fullName);
        setBranch(made.defaultBranch);
        setMode("pick");
        report(await saveGitSync(project.id, { repo: made.fullName, branch: made.defaultBranch, path, useGitHub: true }));
      } else if (mode === "pick") {
        report(await saveGitSync(project.id, { repo, branch, path, useGitHub: true }));
      } else {
        report(await saveGitSync(project.id, { repo, branch, path, token }));
      }
    });

  const linked = connection.available && connection.login !== null;
  const canSubmit =
    mode === "create" ? Boolean(newName.trim()) : mode === "pick" ? linked && Boolean(repo.trim()) : Boolean(repo.trim()) && (Boolean(state) || Boolean(token.trim()));

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

{connection.available && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3.5 text-ui-sm">
          {linked ? (
            <>
              <p className="min-w-0 flex-1">
                Connected to GitHub as <span className="font-medium">{connection.login}</span>
              </p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={async () => {
                  const ok = await confirm({
                    title: "Disconnect GitHub?",
                    description: "Plotra stops listing your repositories. Projects already keeping a copy on GitHub go on doing so until you stop them here, or remove Plotra in your GitHub settings.",
                    confirmLabel: "Disconnect",
                  });
                  if (!ok) return;
                  void run(async () => {
                    await disconnectGitHub();
                    await loadConnection();
                    setMode("pick");
                  });
                }}
              >
                Disconnect
              </Button>
            </>
          ) : (
            <>
              <p className="min-w-0 flex-1 text-muted-foreground">Connect your GitHub account to pick a repository, or make a new one, without copying any keys.</p>
              <Button type="button" size="sm" disabled={connecting} onClick={() => void connect()}>
                <Icon name="link-linear" />
                {connecting ? "Waiting for GitHub…" : "Connect GitHub"}
              </Button>
            </>
          )}
        </div>
      )}

      {(linked || mode === "token") && (
        <form
          className="grid gap-3 rounded-lg border border-dashed p-3.5 text-ui-sm"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <p className="font-medium">{state ? "Change where it goes" : "Keep a copy in a GitHub repository"}</p>

          {linked && mode !== "token" && (
            <div className="flex gap-1 rounded-md bg-muted p-0.5 text-xs" role="tablist">
              {(
                [
                  ["pick", "A repository I have"],
                  ["create", "A new repository"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={mode === id}
                  onClick={() => setMode(id)}
                  className={`flex-1 rounded px-2 py-1.5 ${mode === id ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {mode === "create" ? (
            <div className="grid gap-2">
              <label className="grid gap-1">
                <span className="text-xs text-muted-foreground">Name of the new repository, on {connection.login}</span>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="my-novel" required className="font-mono text-xs" />
              </label>
              <label className="flex items-center gap-2 text-xs">
                <Switch checked={newPrivate} onCheckedChange={setNewPrivate} aria-label="Private repository" />
                <span>{newPrivate ? "Private: only you, and people you add on GitHub, can see it" : "Public: anyone can see it"}</span>
              </label>
            </div>
          ) : (
            <label className="grid gap-1">
              <span className="text-xs text-muted-foreground">
                {mode === "pick" ? "Repository: start typing to find one of yours" : "Repository: your GitHub name, a slash, and the repository's name"}
              </span>
              {mode === "pick" ? (
                <SuggestInput
                  value={repo}
                  suggestions={repos.map((r) => r.fullName)}
                  onChange={(e) => {
                    const value = e.target.value;
                    setRepo(value);
                    const found = repos.find((r) => r.fullName === value);
                    if (found) setBranch(found.defaultBranch);
                  }}
                  placeholder={repos[0]?.fullName ?? "you/my-novel"}
                  required
                  className="h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 font-mono text-xs shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
                />
              ) : (
                <Input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="you/my-novel" required className="font-mono text-xs" />
              )}
            </label>
          )}

          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1">
              <span className="text-xs text-muted-foreground">Branch (leave as main if unsure)</span>
              <Input value={mode === "create" ? "main" : branch} disabled={mode === "create"} onChange={(e) => setBranch(e.target.value)} placeholder="main" className="font-mono text-xs" />
            </label>
            <label className="grid gap-1">
              <span className="text-xs text-muted-foreground">Folder in it (empty for the top)</span>
              <Input value={path} onChange={(e) => setPath(e.target.value)} placeholder="manuscript" className="font-mono text-xs" />
            </label>
          </div>

          {mode === "token" && (
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
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="sm" disabled={busy || !canSubmit}>
              {busy ? "Checking…" : mode === "create" ? "Make it and copy" : "Save and copy"}
            </Button>
            {connection.available && mode === "token" && (
              <button type="button" className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground" onClick={() => setMode("pick")}>
                {linked ? "Use my connected GitHub account instead" : "Cancel"}
              </button>
            )}
          </div>
        </form>
      )}

      {connection.available && mode !== "token" && (
        <button type="button" className="-mt-2 justify-self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground" onClick={() => setMode("token")}>
          Paste an access key instead
        </button>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        Each note becomes a plain text (Markdown) file, in folders like the binder&apos;s, with links between notes kept, so the copy also opens in Obsidian. Changes are sent a few minutes
        after you make them, and once a day for anything left over. If you delete a note here, its file is deleted there; other files in the folder are left alone.
      </p>
    </div>
  );
}
