import { fetch as streamingFetch } from "expo/fetch";
import type { Client } from "./api";
import { splitLines } from "./agent-text";
import { useResource } from "./cache";
import { useClient } from "./session";

// The project's AI agent, through /api/mobile/agent (the server runs the web
// panel's own code: apps/app/lib/agent/answer.ts). AI is off until a
// workspace owner turns it on; the server says whether it's on here for this
// person and, if not, why. Conversations are kept on the server: a turn sends
// only the new message, or the answers to what the AI asked.
//
// The answer is read as it arrives with expo/fetch (React Native's own fetch
// doesn't hand over a response body bit by bit): one JSON object per line,
// each the whole answer so far.

export type AgentMode = "ask" | "suggest" | "auto";

export const modes: Record<AgentMode, { label: string; description: string }> = {
  ask: { label: "Ask", description: "Reads what you can read and changes nothing." },
  suggest: { label: "Suggest", description: "Text edits arrive as suggestions; anything else asks you first." },
  auto: { label: "Auto", description: "Changes apply straight away. Asks before trashing, changing canon, or touching many notes." },
};

export type NoteRef = { id: string; title: string };
export type AgentStep = { type: "step"; id: string; text: string; nodeId: string | null; state: "running" | "waiting" | "done" | "failed" | "denied"; error: string | null };
export type AgentItem = { type: "text"; text: string } | AgentStep;

/** One message as the phone shows it (apps/app/lib/agent/phone.ts). */
export type AgentMessage = {
  id: string;
  role: "user" | "assistant";
  items: AgentItem[];
  mentions: NoteRef[];
  used: NoteRef[];
  approvals: { id: string; text: string; nodeId: string | null }[];
  approvalReason: string | null;
  runId: string | null;
  mode: AgentMode | null;
  tokens: { in: number; out: number } | null;
};

export type AiHere =
  | { on: true; modelSource: "user" | "instance" | "hosted" | null }
  | { on: false; reason: "server" | "promise" | "workspace" | "project" | "edit" | "own-machine" | "no-model"; message: string };

export type AgentThread = { id: string; title: string; updatedAt: string };

const base = (projectId: string, extra: Record<string, string> = {}) => `/api/mobile/agent?${new URLSearchParams({ project: projectId, ...extra })}`;

export const loadAgent = (client: Client, projectId: string) => client.request<{ ai: AiHere; threads: AgentThread[] }>(base(projectId));

export const loadThread = (client: Client, projectId: string, threadId: string) =>
  client.request<{ messages: AgentMessage[] }>(base(projectId, { thread: threadId })).then((r) => r.messages);

export const runChanges = (client: Client, projectId: string, runId: string) =>
  client.request<{ changes: { id: string; nodeId: string | null; summary: string }[]; undone: boolean }>(base(projectId, { run: runId }));

export const undoRun = (client: Client, projectId: string, runId: string) =>
  client.request<{ failed: string[] }>(base(projectId), { method: "POST", body: { action: "undo", runId } });

export const deleteThread = (client: Client, projectId: string, threadId: string) =>
  client.request<{ ok: true }>(base(projectId), { method: "POST", body: { action: "delete", threadId } });

export type Turn = {
  threadId: string;
  projectId: string;
  mode: AgentMode;
  text?: string;
  /** Notes pointed at with @. */
  mentions?: string[];
  /** Answers to what the last answer asked. */
  approvals?: { id: string; approved: boolean }[];
  /** "Try again": answer the last message again, replacing `messageId`. */
  regenerate?: { messageId: string | null };
};

/** A line of the answer's stream. */
export type TurnEvent = { message: AgentMessage } | { done: true } | { error: string };

/**
 * Runs one turn, calling `onEvent` for each snapshot. Resolves when the answer
 * is in (or stopped); throws ApiError / OfflineError when it couldn't start.
 */
export async function runTurn(client: Client, turn: Turn, onEvent: (event: TurnEvent) => void, signal: AbortSignal): Promise<void> {
  const body = {
    threadId: turn.threadId,
    projectId: turn.projectId,
    mode: turn.mode,
    text: turn.text ?? "",
    mentions: turn.mentions ?? [],
    approvals: turn.approvals ?? [],
    trigger: turn.regenerate ? "regenerate-message" : "submit-message",
    messageId: turn.regenerate?.messageId ?? undefined,
  };
  const response = await client.raw("/api/mobile/agent/turn", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", accept: "application/x-ndjson" } }, (url, init) => {
    // Stop, or leaving the screen, ends the request; the server then stops the run and keeps what it said.
    const controller = new AbortController();
    const stop = () => controller.abort();
    if (signal.aborted) stop();
    signal.addEventListener("abort", stop);
    init.signal.addEventListener("abort", stop);
    return streamingFetch(url, { method: init.method, headers: init.headers, body: init.body as string, signal: controller.signal }) as unknown as Promise<Response>;
  });
  const reader = (response.body as ReadableStream<Uint8Array> | null)?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { lines, rest } = splitLines(buffer);
      buffer = rest;
      for (const line of lines) {
        try {
          onEvent(JSON.parse(line) as TurnEvent);
        } catch {
          // Half a line from a dropped connection: the next snapshot has it all.
        }
      }
    }
  } catch (error) {
    if (signal.aborted) return;
    throw error;
  }
}

/** The key the AI's state for a project is kept under (shared by the menus and the Ask screen). */
export const agentKey = (projectId: string) => `agent:${projectId}`;

/**
 * Whether to offer "Ask AI" in a project's menus: yes where it's on, or off
 * only until someone switches it on (the screen then says how). Never where
 * the workspace promised no AI or the server has none, and not before we know.
 */
export function useOfferAi(projectId: string): boolean {
  const client = useClient();
  const { data } = useResource(agentKey(projectId), () => loadAgent(client, projectId));
  return !!data && (data.ai.on || !["server", "promise"].includes(data.ai.reason));
}
