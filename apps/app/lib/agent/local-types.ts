import type { AgentMode, AgentUIMessage, BrowserModel, ToolResult } from "./types";

// What travels between the browser and app/api/agent/local when the agent's
// loop runs in the browser (plan.md 2.11 "Local model"). Shared by both ends,
// so nothing here imports server code.

/** One tool as the browser describes it to the model. It has no way to run it: that is a request to the server. */
export type LocalToolDefinition = {
  name: string;
  description: string;
  /** JSON Schema of the tool's input. The server checks every call against its own schema again. */
  inputSchema: Record<string, unknown>;
  /** Whether it only looks or changes the project. A tool that only looks is never asked about, so the browser needn't check first. */
  access: "read" | "write";
};

/** The answer to `POST /api/agent/local/start`: everything the browser needs to run one turn. */
export type LocalStart = {
  runId: string;
  /** The mode the run is in. For the panel's sake: the server reads it from the run, never from a later request. */
  mode: AgentMode;
  /** The model to call, as saved in the person's settings. */
  model: BrowserModel;
  /** "provider:model", as recorded with the run. */
  label: string;
  /** The system prompt, with this run's token for untrusted text already in it. */
  instructions: string;
  tools: LocalToolDefinition[];
  /** The conversation as the server has it, ending with what is to be answered. */
  history: AgentUIMessage[];
  /** How many model calls the run may make. */
  stepLimit: number;
};

/** What the server says about one tool call before it runs it. */
export type ToolDecision =
  /** It may run. */
  | { kind: "run" }
  /** It waits for the writer's yes. */
  | { kind: "ask"; reason: string }
  /** It may not run in this run at all. */
  | { kind: "denied"; reason: string }
  /** This run has no such tool (Ask mode has none that write). */
  | { kind: "unknown" };

export type LocalToolRequest = {
  runId: string;
  toolCallId: string;
  toolName: string;
  input: unknown;
  /** Only ask whether the call may run: nothing is executed. */
  check?: boolean;
};

export type LocalToolAnswer =
  /** The answer to a `check`. */
  | { decision: ToolDecision }
  | { ok: true; output: ToolResult }
  /** The tool ran and failed, or wasn't allowed to run: the message is for the model. */
  | { ok: false; error: string };

export type LocalFinish = {
  runId: string;
  status: "done" | "stopped" | "failed";
  inputTokens: number;
  outputTokens: number;
  /** In plain words, when it failed. */
  error?: string;
  /** The answer as it stands, to be saved in the conversation. Not sent for an inline action. */
  message?: AgentUIMessage;
};

/** The answer to `POST /api/agent/local/inline`: the prompt for one inline action, built on the server. */
export type LocalInlineStart = {
  runId: string;
  model: BrowserModel;
  instructions: string;
  prompt: string;
  maxOutputTokens: number;
};
