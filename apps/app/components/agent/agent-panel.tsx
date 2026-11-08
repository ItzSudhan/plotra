"use client";

import { Icon } from "@plotra/icons";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@plotra/ui/components/dropdown-menu";
import { confirm } from "@plotra/ui/components/dialogs";
import { IconButton } from "@plotra/ui/components/icon-button";
import { Tooltip } from "@plotra/ui/components/tooltip";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useUi, useWorkspace } from "@/components/workspace/workspace-provider";
import { deleteAgentThread, getAgentThread, getProjectAi, listAgentThreads } from "@/lib/agent-actions";
import { modeMeta, type AgentMode, type AgentUIMessage, type AiState, type ThreadSummary } from "@/lib/agent/types";
import { errorText } from "@/lib/errors";
import { Chat } from "./chat";
import { Jobs } from "./tasks";

// The agent panel (plan.md 2.11 "Where it lives"): a chat in the right
// sidebar, and the same thing as a view in any pane. It is only rendered where
// AI is on for the workspace and the project and the person can edit; someone
// without a model of their own sees how to add one instead of a chat box.

const threadKey = (projectId: string) => `plotra:agent-thread:${projectId}`;
const modeKey = (projectId: string) => `plotra:agent-mode:${projectId}`;
const modes = Object.keys(modeMeta) as AgentMode[];

const dateFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });

/** Shown instead of the chat to someone who has no model to run it on (plan.md 2.11 "No key, no agent"). */
function Setup({ onCheck, checking }: { onCheck: () => void; checking: boolean }) {
  return (
    <div className="grid gap-3 px-4 py-8 text-center">
      <Icon name="key-linear" className="mx-auto size-6 text-faint" />
      <p className="text-ui-sm font-medium">Connect your AI account</p>
      <p className="text-ui-sm text-muted-foreground">
        Plotra&apos;s AI uses your own account with an AI company, such as Anthropic, OpenAI or OpenRouter. You pay them directly for what you use; Plotra never charges for
        AI. You can also use another service that works like OpenAI&apos;s, or a model running on your own computer.
      </p>
      <div className="rounded-lg border bg-muted/40 p-3 text-left text-ui-sm">
        <p className="font-medium">How to get a key</p>
        <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>Sign in to the AI company&apos;s website and find its API keys page.</li>
          <li>Create a new key and copy it. It&apos;s a long line of letters and numbers.</li>
          <li>Paste it into Plotra&apos;s AI settings, then come back here.</li>
        </ol>
      </div>
      <a
        href="/settings"
        target="_blank"
        rel="noopener"
        className="mx-auto inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-ui-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        <Icon name="settings-linear" className="size-4" />
        Open AI settings
      </a>
      <button type="button" onClick={onCheck} disabled={checking} className="mx-auto h-8 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50">
        {checking ? "Checking…" : "I've added it"}
      </button>
    </div>
  );
}

export function AgentPanel() {
  const { project, ai: initial } = useWorkspace();
  const [ai, setAi] = useState<AiState>(initial);
  const [checking, setChecking] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentUIMessage[] | null>(null);
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null);
  // Suggest is the default (plan.md 2.11 "Modes"); the browser remembers what was picked per project.
  const [mode, setMode] = useState<AgentMode>("suggest");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(modeKey(project.id));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from localStorage after mount
      if (saved && (modes as string[]).includes(saved)) setMode(saved as AgentMode);
    } catch {}
  }, [project.id]);
  const pickMode = (next: AgentMode) => {
    setMode(next);
    try {
      localStorage.setItem(modeKey(project.id), next);
    } catch {}
  };

  // The key is added on another page: look again when they come back.
  const check = useCallback(async () => {
    setChecking(true);
    try {
      setAi(await getProjectAi(project.id));
    } catch {
      // Offline or signed out: keep what we knew.
    } finally {
      setChecking(false);
    }
  }, [project.id]);
  useEffect(() => {
    if (ai.hasModel) return;
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [ai.hasModel, check]);

  const open = useCallback(
    async (id: string | null) => {
      if (!id) {
        // A new conversation exists on the server once its first message is sent.
        setThreadId(crypto.randomUUID());
        setMessages([]);
        return;
      }
      setThreadId(id);
      setMessages(null);
      try {
        setMessages(await getAgentThread(project.id, id));
      } catch (error) {
        toast.error(errorText(error, "Couldn't open that conversation."));
        setMessages([]);
      }
    },
    [project.id],
  );

  // Back to the conversation this browser last had open in the project.
  useEffect(() => {
    if (!ai.hasModel) return;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(threadKey(project.id));
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from localStorage after mount
    void open(saved);
  }, [ai.hasModel, open, project.id]);
  useEffect(() => {
    if (!threadId) return;
    try {
      localStorage.setItem(threadKey(project.id), threadId);
    } catch {}
  }, [project.id, threadId]);

  const loadThreads = useCallback(() => {
    listAgentThreads(project.id)
      .then(setThreads)
      .catch(() => setThreads([]));
  }, [project.id]);
  // An answer may have planned a long job: look for it once the answer is in.
  const [answers, setAnswers] = useState(0);
  const onAnswer = useCallback(() => {
    loadThreads();
    setAnswers((n) => n + 1);
  }, [loadThreads]);
  // A command that came with a mode ("Draft this scene") switches the panel to it.
  const wanted = useUi().aiDraft?.mode;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- follows a command, not render state
    if (wanted) setMode(wanted);
  }, [wanted]);

  const [historyOpen, setHistoryOpen] = useState(false);
  // A deleted chat can't be brought back, so ask first.
  const remove = async (thread: ThreadSummary) => {
    setHistoryOpen(false);
    const ok = await confirm({
      title: `Delete the chat ‘${thread.title}’?`,
      description: "Its messages are deleted for good. What the AI already changed in your notes stays.",
      confirmLabel: "Delete chat",
    });
    if (!ok) return;
    setThreads((list) => list?.filter((t) => t.id !== thread.id) ?? null);
    try {
      await deleteAgentThread(project.id, thread.id);
      if (thread.id === threadId) void open(null);
    } catch (error) {
      toast.error(errorText(error));
      loadThreads();
    }
  };

  if (!ai.enabled) return <p className="px-4 py-6 text-center text-xs text-faint">AI is switched off for this project.</p>;
  if (!ai.hasModel) return <Setup onCheck={() => void check()} checking={checking} />;

  const current = threads?.find((t) => t.id === threadId);
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-sidebar-border px-2">
        <DropdownMenu
          open={historyOpen}
          onOpenChange={(isOpen) => {
            setHistoryOpen(isOpen);
            if (isOpen) loadThreads();
          }}
        >
          <DropdownMenuTrigger
            aria-label="Your chats"
            className="flex h-8 min-w-0 items-center gap-1.5 rounded-md px-1.5 text-ui-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Icon name="history-linear" className="size-4 shrink-0" />
            <span className="truncate">{current?.title ?? (messages?.length ? "This chat" : "New chat")}</span>
            <Icon name="alt-arrow-down-linear" className="size-3 shrink-0" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-80 w-72 overflow-y-auto">
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Your chats in this project</DropdownMenuLabel>
            {threads === null ? (
              <p className="px-2 py-3 text-center text-xs text-faint">Loading…</p>
            ) : threads.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-faint">No chats yet.</p>
            ) : (
              threads.map((thread) => (
                <DropdownMenuItem key={thread.id} onSelect={() => void open(thread.id)} className="gap-2">
                  <span className="min-w-0 flex-1 truncate">{thread.title}</span>
                  <span className="shrink-0 text-meta text-faint">{dateFormat.format(new Date(thread.updatedAt))}</span>
                  <IconButton
                    icon="trash-bin-minimalistic-linear"
                    label={`Delete the chat ‘${thread.title}’`}
                    size="xs"
                    variant="destructive"
                    onPointerDown={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      void remove(thread);
                    }}
                  />
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <Tooltip content={`${modeMeta[mode].label}: ${modeMeta[mode].description}`}>
            <DropdownMenuTrigger
              aria-label={`What the AI may do: ${modeMeta[mode].label}`}
              className="ml-auto flex h-8 shrink-0 items-center gap-1 rounded-md bg-muted px-2 text-meta text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {modeMeta[mode].label}
              <Icon name="alt-arrow-down-linear" className="size-3" />
            </DropdownMenuTrigger>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">What the AI may do</DropdownMenuLabel>
            {modes.map((option) => (
              <DropdownMenuItem key={option} onSelect={() => pickMode(option)} className="grid gap-0.5">
                <span className="flex items-center gap-1.5 text-ui-sm font-medium">
                  {modeMeta[option].label}
                  {option === mode && <Icon name="check-linear" className="size-3.5" />}
                </span>
                <span className="text-xs text-muted-foreground">{modeMeta[option].description}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <IconButton icon="add-linear" label="New chat" onClick={() => void open(null)} />
      </div>
      <Jobs reload={answers} local={ai.browserModel !== null} />
      {threadId && messages ? (
        // A fresh chat per conversation: `useChat` keeps its state by id.
        <Chat key={threadId} threadId={threadId} initialMessages={messages} mode={mode} local={ai.browserModel !== null} onFinish={onAnswer} />
      ) : (
        <div className="m-3 h-24 animate-pulse rounded-lg bg-muted" />
      )}
    </div>
  );
}
