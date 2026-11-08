import "server-only";
import { agentModes, type AgentMode } from "@plotra/db/schema";
import { requireNodeAccess, type ProjectAccess } from "../access";
import { listNodes } from "../binder";
import { requireSession } from "../data";
import { assertUnlocked } from "../editorial-guard";
import { indexNodes, isTrashed } from "../tree";
import { answerApprovals, pendingApprovals } from "./approval";
import { loadBrief } from "./brief";
import type { InlineRequest } from "./inline";
import { noteInterruptedRun } from "./local-run";
import { threadTitle } from "./prompt";
import { closeAbandonedRuns, limitRuns, resumeRun, startRun, type Run, type RunStart } from "./runs";
import { ensureThread, loadMessages, saveMessage, truncateFrom } from "./threads";
import type { AgentUIMessage, Mention } from "./types";

// What a request to the agent goes through before a model is called, whoever
// calls it: the server (app/api/agent) or, for a model on the writer's own
// machine, their browser (app/api/agent/local). Who may run, the message
// saved, the run opened. The two differ only in where the loop then runs.

const MAX_TEXT = 8000;
const MAX_MENTIONS = 12;

export type TurnBody = {
  threadId?: unknown;
  projectId?: unknown;
  mode?: unknown;
  /** `submit-message` for a new message, `regenerate-message` to answer the last one again. */
  trigger?: unknown;
  messageId?: unknown;
  text?: unknown;
  mentions?: unknown;
  /** The writer's answers to what the last answer asked: `[{ id, approved }]`. */
  approvals?: unknown;
};

export type Turn = {
  projectId: string;
  threadId: string;
  mode: AgentMode;
  regenerate: boolean;
  messageId: string | null;
  text: string;
  mentionIds: string[];
  answers: Map<string, boolean>;
  /** Answers with no new message: the run that asked carries on. */
  continuing: boolean;
};

/** Reads one turn's request. Null when it names no project or no conversation. */
export function parseTurn(body: TurnBody): Turn | null {
  const projectId = typeof body.projectId === "string" ? body.projectId : "";
  const threadId = typeof body.threadId === "string" ? body.threadId : "";
  const mode = (agentModes as readonly unknown[]).includes(body.mode) ? (body.mode as AgentMode) : "ask";
  const regenerate = body.trigger === "regenerate-message";
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!projectId || !threadId) return null;
  const answers = new Map<string, boolean>();
  for (const item of Array.isArray(body.approvals) ? body.approvals.slice(0, 200) : []) {
    const { id, approved } = (item ?? {}) as { id?: unknown; approved?: unknown };
    if (typeof id === "string") answers.set(id, approved === true);
  }
  return {
    projectId,
    threadId,
    mode,
    regenerate,
    messageId: typeof body.messageId === "string" ? body.messageId : null,
    text,
    mentionIds: Array.isArray(body.mentions) ? body.mentions.filter((id): id is string => typeof id === "string").slice(0, MAX_MENTIONS) : [],
    answers,
    continuing: !regenerate && !text && answers.size > 0,
  };
}

/**
 * Who is asking and whether they may: the session, AI on and a model for them
 * (`requireModel`: lib/agent/availability.ts), the rate limit, the notes they
 * pointed at, and the thread. Call it inside `readOnly`.
 */
export async function prepareTurn<M extends { access: ProjectAccess }>(turn: Turn, requireModel: (projectId: string) => Promise<M>) {
  const { user } = await requireSession();
  // Both switches on, the user can edit, and they have a model (lib/agent/availability.ts).
  const model = await requireModel(turn.projectId);
  if (!turn.regenerate && !turn.continuing && !turn.text) throw new Error("Write a message first.");
  if (turn.text.length > MAX_TEXT) throw new Error("That message is too long. Shorten it, or point at a note with @ instead of pasting it.");
  await limitRuns(user.id, "agent");

  // Notes the user pointed at with @: only ones they can see, named by the server.
  const index = indexNodes(await listNodes(turn.projectId));
  const mentions: Mention[] = [...new Set(turn.mentionIds)].flatMap((id) => {
    const node = index.byId.get(id);
    return node && !isTrashed(index, id) ? [{ id, title: node.title }] : [];
  });

  // The thread has to be this user's, in this project; a new id starts one.
  await ensureThread(user.id, turn.projectId, turn.threadId, threadTitle(turn.text));
  return { ...model, user, mentions, brief: await loadBrief(turn.projectId) };
}

export type OpenedTurn = {
  /** The conversation as stored, ending with the user's new message, or with the answer whose questions they just answered. */
  history: AgentUIMessage[];
  run: Run;
  /** The mode the run is in: the one it began in when it carries on after a question, whatever the panel says now. */
  mode: AgentMode;
};

/**
 * Saves what the writer sent (a message, or their answers to what the last
 * answer asked) and opens the run that will answer it: a new one, or the one
 * that stopped to ask. Throws a message for the writer when there is nothing
 * to answer. `browser` is a run whose loop is in the browser: an earlier one
 * that never reported its end is closed first.
 */
export async function openTurn(turn: Turn, who: { userId: string; mentions: Mention[] }, start: Omit<RunStart, "mode" | "threadId" | "projectId" | "userId" | "kind">, options: { browser?: boolean } = {}): Promise<OpenedTurn> {
  const { projectId, threadId, text } = turn;
  const userId = who.userId;
  const base = { ...start, projectId, threadId, userId, kind: "agent" as const };
  const asMessage = (): AgentUIMessage => ({
    id: crypto.randomUUID(),
    role: "user",
    parts: [{ type: "text", text }, ...(who.mentions.length ? [{ type: "data-mentions" as const, data: { notes: who.mentions } }] : [])],
  });
  let history = await loadMessages(userId, threadId);

  if (turn.continuing) {
    const asking = history.at(-1);
    if (!pendingApprovals(asking).length || !asking) throw new Error("There's nothing waiting for an answer.");
    // Unanswered questions count as "no": the run doesn't stop twice over the same step.
    await saveMessage(userId, projectId, threadId, answerApprovals(asking, turn.answers, "The writer didn't answer this one."));
    history = await loadMessages(userId, threadId);
    // The same run, in the mode it began in: what it changes before and after the question is one thing to undo.
    const resumed = asking.metadata?.runId ? await resumeRun(asking.metadata.runId, base) : null;
    if (!resumed) throw new Error("That run can't be continued. Send a new message instead.");
    return { history, run: resumed, mode: resumed.mode };
  }

  // A run whose loop was in a browser that went away: closed now, with a line to undo it from if it changed anything.
  if (options.browser) for (const abandoned of await closeAbandonedRuns(userId, threadId)) await noteInterruptedRun(userId, abandoned);

  if (turn.regenerate) {
    // "Try again": forget the answer being replaced, and anything after it.
    if (turn.messageId) await truncateFrom(userId, threadId, turn.messageId);
  } else {
    // Moving on without answering what the last answer asked is a "no" to it.
    const asking = history.at(-1);
    if (asking && pendingApprovals(asking).length) await saveMessage(userId, projectId, threadId, answerApprovals(asking, new Map(), "The writer moved on without answering."));
    await saveMessage(userId, projectId, threadId, asMessage());
  }
  history = await loadMessages(userId, threadId);
  // Trying again after a request that failed before the message was saved (a rate limit, say): it is sent along again, so save it now.
  if (turn.regenerate && history.at(-1)?.role !== "user" && text) {
    await saveMessage(userId, projectId, threadId, asMessage());
    history = await loadMessages(userId, threadId);
  }
  if (history.at(-1)?.role !== "user") throw new Error("There's nothing to answer yet. Write a message first.");
  return { history, run: await startRun({ ...base, mode: turn.mode }), mode: turn.mode };
}

/**
 * The same for an inline editor action (plan.md 2.11 "Inline in the editor"):
 * the result is meant for one note, so the person has to be able to edit it
 * now. Call it inside `readOnly`.
 */
export async function prepareInline<M extends { access: ProjectAccess }>(input: InlineRequest, requireModel: (projectId: string) => Promise<M>) {
  const { user } = await requireSession();
  const model = await requireModel(input.projectId);
  // The result is meant for this note, so the user has to be able to edit it now (a locked note can't take it).
  await requireNodeAccess(input.projectId, input.nodeId, "edit");
  await assertUnlocked(input.projectId, input.nodeId);
  await limitRuns(user.id, "inline");
  const note = (await listNodes(input.projectId)).find((n) => n.id === input.nodeId);
  return { ...model, user, title: note?.title ?? "Untitled", brief: await loadBrief(input.projectId) };
}
