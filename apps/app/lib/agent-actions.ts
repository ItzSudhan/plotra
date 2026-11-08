"use server";

// The AI agent's settings and conversations (plan.md 2.11, Phase 9). Every
// function here is a public endpoint and checks permission itself. A model is
// only ever called from here for the "Test" button; runs go through the
// routes under app/api/agent. A model on someone's own machine is never called
// from the server at all: their browser tests it and runs on it.

import { db, schema } from "@plotra/db";
import { aiProviders, type AiProvider } from "@plotra/db/schema";
import { and, eq } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { getAiState } from "./agent/availability";
import { BRIEF_TITLE, briefTemplate } from "./agent/brief-template";
import { listChanges } from "./agent/changes";
import { parseBaseUrl } from "./agent/base-url";
import { encryptKey, keysConfigured } from "./agent/keys";
import { aiRemoved, NOTICE_DAYS, workspaceAiPolicy, type NoAiPromise } from "./agent/no-ai";
import { isBrowserLocal, testModels, type ModelSettings, type TestResult } from "./agent/providers";
import { loadBrowserModel, loadModelSettings } from "./agent/settings";
import { deleteTask, listTasks, loadTask, saveTask } from "./agent/tasks";
import { deleteThread, listThreads, threadMessages, UUID } from "./agent/threads";
import { undoChanges, type UndoResult } from "./agent/undo";
import { providerMeta, type AgentTask, type AgentUIMessage, type AiState, type RunChanges, type ThreadSummary } from "./agent/types";
import { requireProjectAccess } from "./access";
import { listNodes } from "./binder";
import { createNode } from "./binder-actions";
import { track } from "./analytics";
import { requireSession, requireWorkspace } from "./data";
import { userDb } from "./db";
import { rateLimit } from "./rate-limit";
import { readOnly, transaction } from "./request-cache";
import { isDocumentKind } from "./story";
import { indexNodes, liveChildren } from "./tree";
import { requireAdmin } from "./workspace";

const { aiKey, workspaceSettings } = schema;

const MAX_KEY = 500;
const MAX_MODEL = 120;
const MAX_URL = 500;

// ── A person's own model ────────────────────────────────────────────────────

export type AiSettingsInput = {
  provider: AiProvider;
  /** For an OpenAI-compatible endpoint or a local model. */
  baseUrl?: string | null;
  /** Left empty to keep the key already saved. */
  apiKey?: string;
  agentModel: string;
  fastModel?: string;
};

type Cleaned = {
  provider: AiProvider;
  baseUrl: string | null;
  apiKey: string;
  agentModel: string;
  fastModel: string;
  /** The URL is on the person's own machine or network and this server can't call it: their browser will (plan.md 2.11 "Local model"). */
  browser: boolean;
};

/** Checks what the form sent. Throws a message for the user when something is off. */
function clean(input: AiSettingsInput): Cleaned {
  if (!input || !(aiProviders as readonly unknown[]).includes(input.provider)) throw new Error("Choose a provider.");
  const meta = providerMeta[input.provider];
  const agentModel = String(input.agentModel ?? "").trim();
  const fastModel = String(input.fastModel ?? "").trim() || agentModel;
  if (!agentModel) throw new Error("Enter the model to use for the agent.");
  if (agentModel.length > MAX_MODEL || fastModel.length > MAX_MODEL) throw new Error("That model name is too long.");
  const apiKey = String(input.apiKey ?? "").trim();
  if (apiKey.length > MAX_KEY) throw new Error("That doesn't look like an API key.");

  let baseUrl: string | null = null;
  if (meta.baseUrl) {
    const raw = String(input.baseUrl ?? "").trim();
    if (raw.length > MAX_URL) throw new Error("That URL is too long.");
    if (!raw && input.provider === "compatible") throw new Error("Enter the endpoint's URL.");
    // A private address is fine here: where this server may not call it, the browser does (`browser` below).
    if (raw) baseUrl = parseBaseUrl(raw, { allowPrivate: true }).toString().replace(/\/$/, "");
  }
  // Ollama without a URL means the person's own machine.
  return { provider: input.provider, baseUrl, apiKey, agentModel, fastModel, browser: isBrowserLocal({ provider: input.provider, baseUrl }) };
}

const REMOVED = "Whoever runs this server has taken AI out of it.";

const BROWSER_TEST = "This model is on your own machine, so it is tested from your browser. Use Test in Settings → AI.";

/**
 * Whether a model at this URL would be called by this server or by the
 * person's browser. The settings form asks before it saves or tests, so a key
 * for a model the browser calls is never sent here at all.
 */
export async function whereModelRuns(input: Pick<AiSettingsInput, "provider" | "baseUrl">): Promise<"server" | "browser"> {
  await requireSession();
  if (!input || !(aiProviders as readonly unknown[]).includes(input.provider)) return "server";
  const raw = String(input.baseUrl ?? "").trim().slice(0, MAX_URL);
  try {
    const baseUrl = providerMeta[input.provider].baseUrl && raw ? parseBaseUrl(raw, { allowPrivate: true }).toString() : null;
    return isBrowserLocal({ provider: input.provider, baseUrl }) ? "browser" : "server";
  } catch {
    // Not a URL yet: saving will say so.
    return "server";
  }
}

/**
 * Saves the current user's provider, models and key. The key is encrypted
 * before it is stored and never read back out. For a model the browser calls,
 * no key is stored at all: it stays in that browser, and one sent by mistake
 * is dropped.
 */
export async function saveAiSettings(input: AiSettingsInput): Promise<void> {
  return transaction(async () => {
    const { user } = await requireSession();
    if (aiRemoved()) throw new Error(REMOVED);
    if (!keysConfigured()) throw new Error("This server isn't set up for personal AI keys. Whoever runs it needs to set AI_KEY_SECRET.");
    const next = clean(input);
    await rateLimit("ai-settings", user.id, { limit: 30, windowSeconds: 3600 });
    const [existing] = await userDb((tx) => tx.select({ provider: aiKey.provider, encryptedKey: aiKey.encryptedKey }).from(aiKey).where(eq(aiKey.userId, user.id)).limit(1));
    // An empty key field keeps the saved key, but only for the provider it was saved for.
    const kept = existing && existing.provider === next.provider ? existing.encryptedKey : null;
    const encryptedKey = next.browser ? null : next.apiKey ? encryptKey(next.apiKey, user.id) : kept;
    if (!encryptedKey && providerMeta[next.provider].key === "required") throw new Error(`Enter your ${providerMeta[next.provider].label} key.`);
    const values = { provider: next.provider, baseUrl: next.baseUrl, encryptedKey, agentModel: next.agentModel, fastModel: next.fastModel };
    await userDb((tx) => tx.insert(aiKey).values({ userId: user.id, ...values }).onConflictDoUpdate({ target: aiKey.userId, set: values }));
  });
}

/** Forgets the current user's key and models. */
export async function removeAiSettings(): Promise<void> {
  return transaction(async () => {
    const { user } = await requireSession();
    await userDb((tx) => tx.delete(aiKey).where(eq(aiKey.userId, user.id)));
  });
}

/**
 * The "Test" button: one tiny real call. With `input`, tests what is in the
 * form before it is saved (an empty key field means the saved key); without,
 * tests whatever the user's runs would use.
 */
export async function testAiSettings(input?: AiSettingsInput): Promise<TestResult> {
  const settings = await readOnly(async (): Promise<ModelSettings | { error: string }> => {
    const { user } = await requireSession();
    if (aiRemoved()) return { error: REMOVED };
    await rateLimit("ai-test", user.id, { limit: 12, windowSeconds: 600 });
    // The server never calls a model on someone's own machine, not even to test it.
    if (!input && (await loadBrowserModel())) return { error: BROWSER_TEST };
    const saved = await loadModelSettings();
    if (!input) return saved ?? { error: "There's nothing to test yet. Add a provider and a model first." };
    const next = clean(input);
    if (next.browser) return { error: BROWSER_TEST };
    // The saved key is only reused for the provider it was saved for: a key must never be sent to a different host.
    const apiKey = next.apiKey || (saved?.source === "user" && saved.provider === next.provider && (saved.baseUrl ?? null) === next.baseUrl ? saved.apiKey : null);
    if (!apiKey && providerMeta[next.provider].key === "required") return { error: `Enter your ${providerMeta[next.provider].label} key.` };
    return { provider: next.provider, baseUrl: next.baseUrl, apiKey, agentModel: next.agentModel, fastModel: next.fastModel, source: "user" };
  });
  if ("error" in settings) return { ok: false, message: settings.error };
  // Outside the scope above: the call can take seconds, and a transaction shouldn't sit open meanwhile.
  return testModels(settings);
}

// ── The workspace's switch ──────────────────────────────────────────────────

export type WorkspaceAi = {
  /** The switch as it stands: off whenever AI can't be on. */
  enabled: boolean;
  /** Whoever runs the server took AI out of it (`PLOTRA_NO_AI`). */
  removed: boolean;
  /** The owner's promise of no AI, while there's something to show about it. */
  promise: NoAiPromise | null;
  /** Only the owner switches AI on or off, and makes or lifts the promise. */
  isOwner: boolean;
};

/** Whether AI is on for a workspace, and why it can't be. For its owners and admins (the settings page). */
export async function getWorkspaceAi(workspaceSlug: string): Promise<WorkspaceAi> {
  return readOnly(async () => {
    const { workspace, role } = await requireAdmin(workspaceSlug);
    const { enabled, promise } = await workspaceAiPolicy(workspace.id);
    return { enabled, removed: aiRemoved(), promise, isOwner: role === "owner" };
  });
}

/** Turns AI on or off for a whole workspace (plan.md 2.11 "Trust"). The owner only, not admins, and never on against a promise of no AI. */
export async function setWorkspaceAi(workspaceSlug: string, enabled: boolean): Promise<void> {
  return transaction(async () => {
    const { workspace, role, userId } = await requireAdmin(workspaceSlug);
    if (role !== "owner") throw new Error("Only the workspace's owner can switch AI on or off.");
    const aiEnabled = enabled === true;
    if (aiEnabled) {
      if (aiRemoved()) throw new Error(REMOVED);
      const { promise } = await workspaceAiPolicy(workspace.id);
      if (promise?.active) {
        throw new Error(
          promise.endsAt
            ? `The promise of no AI was lifted, and AI can be switched on from ${new Date(promise.endsAt).toUTCString().slice(5, 16)}.`
            : "This workspace has promised no AI. Only its owner can lift the promise.",
        );
      }
    }
    // `workspace_settings` is read-only for the user connection: written here, after the owner check above.
    await db
      .insert(workspaceSettings)
      .values({ workspaceId: workspace.id, aiEnabled })
      .onConflictDoUpdate({ target: workspaceSettings.workspaceId, set: { aiEnabled } });
    if (aiEnabled) await track("ai_enabled", { userId, workspaceId: workspace.id });
  });
}

/**
 * The owner promises the workspace no AI, or lifts the promise
 * (lib/agent/no-ai.ts). Promising switches AI off at once and keeps it off.
 * Lifting it leaves AI off, and it can't be switched on for NOTICE_DAYS more:
 * meanwhile everyone in the workspace sees who lifted it.
 */
export async function setWorkspaceNoAi(workspaceSlug: string, promise: boolean): Promise<void> {
  return transaction(async () => {
    const { workspace, role, userId } = await requireAdmin(workspaceSlug);
    if (role !== "owner") throw new Error("Only the workspace's owner can make or lift a promise of no AI.");
    if (typeof promise !== "boolean") throw new Error("Choose to promise or to lift.");
    await rateLimit("no-ai", userId, { limit: 20, windowSeconds: 3600 });
    const now = new Date();
    const { promise: current } = await workspaceAiPolicy(workspace.id);
    if (promise) {
      // Promising again during the notice simply renews the promise.
      const set = { aiEnabled: false, noAiSince: now, noAiById: userId, noAiLiftedAt: null, noAiLiftedById: null };
      await db.insert(workspaceSettings).values({ workspaceId: workspace.id, ...set }).onConflictDoUpdate({ target: workspaceSettings.workspaceId, set });
      await track("no_ai_promised", { userId, workspaceId: workspace.id });
      return;
    }
    if (!current?.active || current.liftedAt) throw new Error(`There is no promise to lift. ${current?.endsAt ? "It was lifted already." : ""}`.trim());
    await db.update(workspaceSettings).set({ noAiLiftedAt: now, noAiLiftedById: userId, aiEnabled: false }).where(eq(workspaceSettings.workspaceId, workspace.id));
    await track("no_ai_lifted", { userId, workspaceId: workspace.id, properties: { noticeDays: NOTICE_DAYS } });
  });
}

/** The workspace's promise of no AI, for its home page: every member sees it. */
export async function getNoAiPromise(workspaceSlug: string): Promise<{ removed: boolean; promise: NoAiPromise | null }> {
  return readOnly(async () => {
    // 404s for anyone who isn't a member.
    const workspace = await requireWorkspace(workspaceSlug);
    return { removed: aiRemoved(), promise: (await workspaceAiPolicy(workspace.id)).promise };
  });
}

// ── In a project ────────────────────────────────────────────────────────────

/** Whether AI is on for this project and this user, and whether they have a model: for the panel to re-check. */
export async function getProjectAi(projectId: string): Promise<AiState> {
  return readOnly(async () => {
    await requireProjectAccess(projectId);
    return getAiState(projectId);
  });
}

/** The current user's conversations in a project, newest first. */
export async function listAgentThreads(projectId: string): Promise<ThreadSummary[]> {
  return readOnly(async () => {
    const { user } = await requireSession();
    await requireProjectAccess(projectId);
    return listThreads(user.id, projectId);
  });
}

/** One of the current user's conversations. Empty when it isn't theirs. */
export async function getAgentThread(projectId: string, threadId: string): Promise<AgentUIMessage[]> {
  return readOnly(async () => {
    const { user } = await requireSession();
    await requireProjectAccess(projectId);
    if (typeof threadId !== "string" || !UUID.test(threadId)) return [];
    return threadMessages(user.id, projectId, threadId);
  });
}

export async function deleteAgentThread(projectId: string, threadId: string): Promise<void> {
  return transaction(async () => {
    const { user } = await requireSession();
    await requireProjectAccess(projectId);
    if (typeof threadId !== "string" || !UUID.test(threadId)) return;
    await deleteThread(user.id, projectId, threadId);
  });
}

// ── What a run changed, and taking it back (plan.md 2.11 "Checkpoints") ─────

/** The run, if it is in this project and the current user may see it. */
async function runFor(projectId: string, runId: string) {
  if (typeof runId !== "string" || !UUID.test(runId)) return null;
  const { agentRun } = schema;
  const [row] = await userDb((tx) =>
    tx.select({ id: agentRun.id, userId: agentRun.userId, status: agentRun.status }).from(agentRun).where(and(eq(agentRun.id, runId), eq(agentRun.projectId, projectId))).limit(1),
  );
  return row ?? null;
}

/** What a run changed, for the list under its answer. */
export async function getRunChanges(projectId: string, runId: string): Promise<RunChanges> {
  return readOnly(async () => {
    await requireProjectAccess(projectId);
    const run = await runFor(projectId, runId);
    if (!run) return { changes: [], undone: false };
    const changes = await listChanges(runId);
    return { changes: changes.map((c) => ({ id: c.id, nodeId: c.nodeId, summary: c.summary ?? c.action })), undone: run.status === "undone" };
  });
}

/**
 * "Undo run": takes back everything a run changed, newest first, as the person
 * undoing (so through the same access checks and locks as their own edits).
 * Only the person the agent worked for can undo its run. Returns what couldn't
 * be taken back, with why.
 */
export async function undoAgentRun(projectId: string, runId: string): Promise<UndoResult> {
  const { user } = await requireSession();
  const changes = await readOnly(async () => {
    await requireProjectAccess(projectId, "edit");
    const run = await runFor(projectId, runId);
    if (!run || run.userId !== user.id) throw new Error("That run isn't yours to undo.");
    if (run.status === "undone") throw new Error("That run has already been undone.");
    if (run.status === "running") throw new Error("That run is still going. Stop it first.");
    return listChanges(runId);
  });
  await rateLimit("agent-undo", user.id, { limit: 20, windowSeconds: 600 });
  // Not one transaction: each change is undone in its own (lib/agent/undo.ts), so one that fails doesn't keep the rest.
  const result = await undoChanges({ projectId, userId: user.id, userName: user.name, runId }, changes);
  await transaction(() => userDb((tx) => tx.update(schema.agentRun).set({ status: "undone" }).where(and(eq(schema.agentRun.id, runId), eq(schema.agentRun.userId, user.id)))));
  return result;
}

// ── Long jobs (plan.md Phase 9d) ─────────────────────────────────────────────

/** The current user's jobs in a project, newest first. */
export async function listAgentTasks(projectId: string): Promise<AgentTask[]> {
  return readOnly(async () => {
    await requireProjectAccess(projectId);
    return listTasks(projectId);
  });
}

/** Pauses a job: the step in flight finishes, and no further one starts until it is resumed. */
export async function pauseAgentTask(projectId: string, taskId: string): Promise<void> {
  return transaction(async () => {
    await requireProjectAccess(projectId, "edit");
    const task = await loadTask(projectId, taskId);
    if (task && task.status !== "done") await saveTask({ ...task, status: "paused" });
  });
}

export async function deleteAgentTask(projectId: string, taskId: string): Promise<void> {
  return transaction(async () => {
    await requireProjectAccess(projectId, "edit");
    await deleteTask(projectId, taskId);
  });
}

/** Undoes every step of a job that ran, last step first. */
export async function undoAgentTask(projectId: string, taskId: string): Promise<UndoResult> {
  const task = await readOnly(async () => {
    await requireProjectAccess(projectId, "edit");
    return loadTask(projectId, taskId);
  });
  if (!task) throw new Error("That job no longer exists.");
  const total: UndoResult = { undone: 0, failed: [], nodeIds: [] };
  for (const step of [...task.steps].reverse()) {
    if (!step.runId) continue;
    try {
      const result = await undoAgentRun(projectId, step.runId);
      total.undone += result.undone;
      total.failed.push(...result.failed);
      total.nodeIds.push(...result.nodeIds);
    } catch (error) {
      // Already undone, or a step that never started: nothing to take back.
      if (!(error instanceof Error && /already been undone/.test(error.message))) total.failed.push(`${step.title}: ${error instanceof Error ? error.message : "couldn't be undone"}`);
    }
  }
  await transaction(() => saveTask({ id: task.id, status: "paused", steps: task.steps.map((s) => ({ id: s.id, title: s.title, prompt: s.prompt, status: "pending" as const })) }));
  return total;
}

// ── The story brief (plan.md 2.11 "What it knows") ───────────────────────────

/**
 * Creates the project's story brief from its template: a note at the top of
 * the binder that is sent with every run. Returns the note that holds it (the
 * existing one when there already is a brief).
 */
export async function createStoryBrief(projectId: string): Promise<{ nodeId: string; created: boolean }> {
  return transaction(async () => {
    await requireProjectAccess(projectId, "edit");
    const index = indexNodes(await listNodes(projectId));
    const top = liveChildren(index, null);
    const existing = top.find((n) => isDocumentKind(n.kind) && n.title.trim().toLowerCase() === BRIEF_TITLE.toLowerCase());
    if (existing) return { nodeId: existing.id, created: false };
    const made = await createNode(projectId, { parentId: null, kind: "note", title: BRIEF_TITLE, position: generateKeyBetween(null, top[0]?.position ?? null) });
    // The collab server seeds a note it has never stored from this column (lib/collab/sync.ts `loadRoomState`).
    await userDb((tx) => tx.update(schema.node).set({ content: briefTemplate, synopsis: "What every AI run is told about this story: voice, tense, point of view, rules, things to avoid." }).where(eq(schema.node.id, made.id)));
    return { nodeId: made.id, created: true };
  });
}
