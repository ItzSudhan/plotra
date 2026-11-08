import "server-only";
import { schema } from "@plotra/db";
import type { AgentMode } from "@plotra/db/schema";
import { tool, type Tool } from "ai";
import { eq } from "drizzle-orm";
import { unstable_rethrow } from "next/navigation";
import type { z } from "zod";
import { listNodes } from "../../binder";
import { userDb } from "../../db";
import { computeHorizon, type Horizon } from "../../horizon";
import { readOnly, transaction } from "../../request-cache";
import { indexNodes, isTrashed, type BinderNode, type NodeIndex } from "../../tree";
import type { Mention, ToolResult } from "../types";

// What every agent tool shares (plan.md 2.11 "How it edits"). A tool is a thin
// wrapper around the server functions the app itself uses: each call runs as
// the user who started the run, through `can()` and row-level security. The
// agent has no connection of its own and can't reach what that user can't.

/** What a run knows about itself, handed to every tool. */
export type ToolContext = {
  projectId: string;
  /** Who started the run: every tool call is made as them. */
  userId: string;
  /** Their name, for what the agent leaves behind: "AI, for Sam" in version history and on suggestions. */
  userName: string;
  /** The run's row in `agent_run`: what the write tools record their changes against. */
  runId: string;
  mode: AgentMode;
  /** This run's token for untrusted blocks (lib/agent/untrusted.ts). */
  boundary: string;
  /** The conversation the run belongs to, when it has one. */
  threadId?: string | null;
  /** The run is one step of a long job (lib/agent/tasks.ts): it can't plan another. */
  inTask?: boolean;
};

/** Whether a tool only looks, or changes the project. Ask mode gets read tools only (tools/index.ts). */
export type ToolAccess = "read" | "write";

export type AgentTool = Tool<never, ToolResult> & { access: ToolAccess };

/** A set of tools for one area, built for one run. */
export type ToolFactory = (context: ToolContext) => Record<string, AgentTool>;

const NOT_FOUND = "That doesn't exist in this project, or you can't open it.";

/** Turns Next's control-flow errors (`notFound`, the sign-in redirect) into a message the model can read. */
async function plainErrors<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    try {
      unstable_rethrow(error);
    } catch {
      throw new Error(NOT_FOUND);
    }
    throw error;
  }
}

/**
 * Defines one tool. `run` gets the validated input and returns text for the
 * model plus the notes it drew on, which the panel links. Each call gets its
 * own request scope: one transaction, and access checks made fresh rather
 * than remembered from an earlier step of the run.
 */
export function defineTool<S extends z.ZodType>(definition: {
  access: ToolAccess;
  description: string;
  inputSchema: S;
  /**
   * False for a tool that opens its own transactions: one that creates a note
   * and then writes into it, where the note has to be committed before the
   * collab server can be asked for its document.
   */
  scoped?: boolean;
  run: (input: z.infer<S>) => Promise<ToolResult>;
}): AgentTool {
  const scope = definition.scoped === false ? <T>(run: () => Promise<T>) => run() : definition.access === "write" ? transaction : readOnly;
  const built = tool({
    description: definition.description,
    inputSchema: definition.inputSchema,
    execute: (input: z.infer<S>) => plainErrors(() => scope(() => definition.run(input))),
    // The model gets the text; the notes list is for the panel.
    toModelOutput: ({ output }: { output: ToolResult }) => ({ type: "text" as const, value: output.text }),
  });
  return Object.assign(built as unknown as Tool<never, ToolResult>, { access: definition.access });
}

// ---- Helpers the tools share ----------------------------------------------------------

/** Keeps a tool result within what a model can take in at once, saying so when it cuts. */
export function cap(text: string, max: number, more = "Narrow the request to see the rest."): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n… (cut off: ${more})`;
}

export const mention = (node: Pick<BinderNode, "id" | "title">): Mention => ({ id: node.id, title: node.title });

/** One line that names a note the way the model should cite it. */
export const noteRef = (node: Pick<BinderNode, "id" | "title">) => `${node.title} (id: ${node.id})`;

export type Project = {
  nodes: BinderNode[];
  index: NodeIndex;
  /** A live note the user can see, or null. */
  live: (id: string | null | undefined) => BinderNode | null;
  title: (id: string | null | undefined) => string;
};

/** The project's binder as the user sees it, with the trash left out of lookups. */
export async function loadProject(projectId: string): Promise<Project> {
  const nodes = await listNodes(projectId);
  const index = indexNodes(nodes);
  const live = (id: string | null | undefined) => {
    const node = id ? index.byId.get(id) : undefined;
    return node && !isTrashed(index, node.id) ? node : null;
  };
  return { nodes, index, live, title: (id) => live(id)?.title ?? "a note that no longer exists" };
}

/** A live note by id, or an error the model can act on. */
export function requireLive(project: Project, id: string): BinderNode {
  const node = project.live(id);
  if (!node) throw new Error(`No note with id ${id} in this project. Use searchProject or binderOutline to find the right id.`);
  return node;
}

export type ReleaseInfo = { id: string; title: string; position: string; nodeId: string | null };

/** The project's releases, in shipping order. */
export async function loadReleases(projectId: string): Promise<ReleaseInfo[]> {
  const { release } = schema;
  const rows = await userDb((tx) =>
    tx.select({ id: release.id, title: release.title, position: release.position, nodeId: release.nodeId }).from(release).where(eq(release.projectId, projectId)),
  );
  return rows.sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : a.id < b.id ? -1 : 1));
}

export type AsOf = { horizon: Horizon; release: ReleaseInfo };

/**
 * The spoiler horizon for "as of release X" (lib/horizon.ts): what the
 * audience knows once that release is out. Null when no release was asked for.
 */
export async function loadHorizon(projectId: string, project: Project, releaseId: string | null | undefined): Promise<AsOf | null> {
  if (!releaseId) return null;
  const releases = await loadReleases(projectId);
  const release = releases.find((r) => r.id === releaseId);
  const horizon = release ? computeHorizon(project.nodes, releases, releaseId) : null;
  if (!release || !horizon) throw new Error(`No release with id ${releaseId}. Use listReleases to see the project's releases.`);
  return { horizon, release };
}

/** The line a tool adds when it answered under a horizon, so the model says so too. */
export const asOfNote = (asOf: AsOf | null) => (asOf ? `(As of "${asOf.release.title}": only what the audience knows by then is shown.)\n` : "");
