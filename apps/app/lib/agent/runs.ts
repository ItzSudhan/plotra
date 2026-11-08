import "server-only";
import { schema } from "@plotra/db";
import type { AgentMode, AgentRunStatus } from "@plotra/db/schema";
import { withUser } from "@plotra/db/rls";
import { and, eq, ne } from "drizzle-orm";
import type { LanguageModelUsage } from "ai";
import { track } from "../analytics";
import { creditsFor } from "../billing/credits";
import { rateLimit } from "../rate-limit";

// One row per call to a model (plan.md 2.11 "Trust"): the run log, and the
// tokens it used so people can see what a run costs them on their own bill,
// or the workspace's credits when it ran on the hosted model
// (lib/billing/credits.ts). The rate limit protects the server: a run holds a
// connection and a function open for as long as the model takes.

const { agentRun } = schema;

type RunKind = "agent" | "inline" | "task";

const limits: Record<RunKind, { limit: number; windowSeconds: number }> = {
  agent: { limit: 40, windowSeconds: 600 },
  // Inline actions are small and come in bursts while revising.
  inline: { limit: 120, windowSeconds: 600 },
  task: { limit: 120, windowSeconds: 3600 },
};

/** Counts one run against the user's limit; throws a message for them when they're over it. */
export async function limitRuns(userId: string, kind: RunKind): Promise<void> {
  await rateLimit(kind === "agent" ? "agent" : `agent-${kind}`, userId, limits[kind]);
}

export type RunStart = {
  workspaceId: string;
  projectId: string;
  threadId: string | null;
  userId: string;
  kind: RunKind;
  mode: AgentMode;
  /** "provider:model", never a key (lib/agent/providers.ts `modelLabel`). */
  model: string;
  /** The run is on the model Plotra provides: what it uses counts against the workspace's credits (lib/billing/credits.ts). */
  hosted: boolean;
};

export type Usage = { inputTokens: number; outputTokens: number };

/** The two numbers we keep from what the SDK reports. Providers that report nothing count as zero. */
export const usageOf = (usage: Pick<LanguageModelUsage, "inputTokens" | "outputTokens"> | undefined): Usage => ({
  inputTokens: usage?.inputTokens ?? 0,
  outputTokens: usage?.outputTokens ?? 0,
});

export const addUsage = (a: Usage, b: Usage): Usage => ({ inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens });

/**
 * A run that has started. `finish` may be called from several of the SDK's
 * callbacks (end, abort, error): the first call wins. It runs after the
 * response has begun streaming, so it carries the user id itself instead of
 * reading the session again.
 */
export type Run = { id: string; finish: (status: Exclude<AgentRunStatus, "running" | "undone">, usage?: Usage, error?: string) => Promise<void> };

/** The run's handle: `finish` records how it ended, adding `usage` to what earlier requests of the same run used. */
function handle(id: string, start: RunStart, used: Usage): Run {
  let finished = false;
  return {
    id,
    finish: async (status, usage = { inputTokens: 0, outputTokens: 0 }, error) => {
      if (finished) return;
      finished = true;
      const total = addUsage(used, usage);
      try {
        await withUser(start.userId, (tx) =>
          tx
            .update(agentRun)
            // The error is the plain description shown to the user: never the prompt, never a key.
            .set({
              status,
              inputTokens: total.inputTokens,
              outputTokens: total.outputTokens,
              // Everything the run used, whatever its outcome: a stopped or failed run was still paid for.
              ...(start.hosted && { credits: creditsFor(total) }),
              error: error?.slice(0, 500) ?? null,
              finishedAt: new Date(),
            })
            .where(and(eq(agentRun.id, id), eq(agentRun.userId, start.userId))),
        );
      } catch (cause) {
        console.error("[plotra] couldn't record the end of an agent run", cause);
      }
      // Names and counts only (lib/analytics.ts): nothing of what was asked or answered.
      await track("agent_run", {
        userId: start.userId,
        workspaceId: start.workspaceId,
        projectId: start.projectId,
        properties: { kind: start.kind, mode: start.mode, status, provider: start.model.split(":")[0], hosted: start.hosted },
      });
    },
  };
}

export type OpenRun = Run & { projectId: string; threadId: string | null; kind: RunKind; mode: AgentMode; model: string };

/**
 * A run of this user's that is still going, found by its id. For a run whose
 * loop is in the browser (app/api/agent/local): each of its requests arrives
 * on its own, and everything the server lets it do is decided from this row,
 * the mode above all, never from what the request says. Null when the run
 * isn't theirs or has ended.
 */
export async function openRun(userId: string, runId: string): Promise<OpenRun | null> {
  const [row] = await withUser(userId, (tx) =>
    tx
      .select({ workspaceId: agentRun.workspaceId, projectId: agentRun.projectId, threadId: agentRun.threadId, kind: agentRun.kind, mode: agentRun.mode, model: agentRun.model, inputTokens: agentRun.inputTokens, outputTokens: agentRun.outputTokens })
      .from(agentRun)
      .where(and(eq(agentRun.id, runId), eq(agentRun.userId, userId), eq(agentRun.status, "running")))
      .limit(1),
  );
  if (!row) return null;
  const { inputTokens, outputTokens, ...start } = row;
  // Never the hosted model: a run driven from the browser is on the person's own.
  return { ...handle(runId, { ...start, userId, hosted: false }, { inputTokens, outputTokens }), projectId: row.projectId, threadId: row.threadId, kind: row.kind, mode: row.mode, model: row.model };
}

export type ClosedRun = { id: string; projectId: string; threadId: string | null; mode: AgentMode; model: string };

/**
 * Closes the runs of a conversation that never said they ended: a tab closed
 * in the middle of a run whose loop was in the browser. Called before the
 * next run of that conversation starts, so an abandoned one can't be fed tool
 * calls later, and can be undone ("still going" would refuse). Returns the
 * runs it closed.
 */
export async function closeAbandonedRuns(userId: string, threadId: string): Promise<ClosedRun[]> {
  return withUser(userId, (tx) =>
    tx
      .update(agentRun)
      .set({ status: "stopped", finishedAt: new Date() })
      .where(and(eq(agentRun.threadId, threadId), eq(agentRun.userId, userId), eq(agentRun.kind, "agent"), eq(agentRun.status, "running")))
      .returning({ id: agentRun.id, projectId: agentRun.projectId, threadId: agentRun.threadId, mode: agentRun.mode, model: agentRun.model }),
  );
}

/** Inserts the `agent_run` row for a run that is about to call a model. */
export async function startRun(start: RunStart): Promise<Run> {
  const id = crypto.randomUUID();
  const { hosted, ...row } = start;
  // A hosted run counts from the start, as zero, so it is told apart from a run on someone's own model.
  await withUser(start.userId, (tx) => tx.insert(agentRun).values({ id, ...row, credits: hosted ? 0 : null, startedAt: new Date() }));
  return handle(id, start, { inputTokens: 0, outputTokens: 0 });
}

/**
 * Carries on a run that stopped to ask the writer something (lib/agent/approval.ts):
 * the same row, so everything the answer changed is one run to undo. The mode
 * is the one the run began in, whatever the panel says now. Null when the run
 * isn't this user's, isn't in this project, or was undone.
 */
export async function resumeRun(runId: string, start: Omit<RunStart, "mode">): Promise<(Run & { mode: AgentMode }) | null> {
  const [row] = await withUser(start.userId, (tx) =>
    tx
      .update(agentRun)
      .set({ status: "running", finishedAt: null, error: null })
      .where(and(eq(agentRun.id, runId), eq(agentRun.userId, start.userId), eq(agentRun.projectId, start.projectId), ne(agentRun.status, "undone")))
      .returning({ mode: agentRun.mode, inputTokens: agentRun.inputTokens, outputTokens: agentRun.outputTokens }),
  );
  if (!row) return null;
  return { ...handle(runId, { ...start, mode: row.mode }, { inputTokens: row.inputTokens, outputTokens: row.outputTokens }), mode: row.mode };
}
