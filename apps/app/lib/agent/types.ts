import type { AgentMode, AgentTaskStep, AiProvider } from "@plotra/db/schema";
import type { UIMessage } from "ai";

// Types and labels the server and the browser share (plan.md 2.11). Nothing
// here imports server code, so client components can use it freely.

export type { AgentMode, AiProvider };

/** Which of a person's two models a call uses: agent runs, or the cheaper one for inline editor actions. */
export type ModelRole = "agent" | "fast";

/**
 * What the workspace needs to know to decide whether to show AI at all, and
 * what to show. Computed once on the server (lib/agent/availability.ts).
 */
export type AiState = {
  /** The workspace's switch: the owner turned AI on. */
  workspaceEnabled: boolean;
  /** The project's own switch (the `ai` module). */
  projectEnabled: boolean;
  /** Both switches are on and this person can edit: AI controls are shown. */
  enabled: boolean;
  /** This person has a model to run it on: their own key, the workspace's hosted AI (Pro), or the instance's. */
  hasModel: boolean;
  /** Whose model that is. */
  modelSource: "user" | "instance" | "hosted" | null;
  /**
   * Set when that model is on the person's own machine or network and this
   * server can't call it: the browser calls it, and the agent's loop runs
   * there (lib/agent/local-loop.ts). Every tool still runs on the server.
   */
  browserModel: BrowserModel | null;
  /**
   * Why AI can't be switched on at all, where it can't: whoever runs the
   * server took it out (`PLOTRA_NO_AI`), or the workspace's owner promised
   * no AI (lib/agent/no-ai.ts).
   */
  forbidden?: "server" | "workspace" | null;
};

export const noAi: AiState = { workspaceEnabled: false, projectEnabled: false, enabled: false, hasModel: false, modelSource: null, browserModel: null };

/** A model the browser calls itself: where it is and what it is called. Its key, if it has one, never leaves the browser. */
export type BrowserModel = { provider: AiProvider; baseUrl: string; agentModel: string; fastModel: string };

/** Where Ollama listens when nobody says otherwise: on the machine it runs on. */
export const OLLAMA_URL = "http://localhost:11434/v1";

/** What the "Test" button reports, wherever the call was made from. */
export type TestResult = { ok: true; message: string } | { ok: false; message: string };

export const providerMeta: Record<
  AiProvider,
  {
    label: string;
    /** The key is required (hosted providers), optional (an endpoint of your own), or not used. */
    key: "required" | "optional";
    /** The person supplies the URL. */
    baseUrl: boolean;
    baseUrlPlaceholder?: string;
    agentModelPlaceholder: string;
    fastModelPlaceholder: string;
    help: string;
  }
> = {
  anthropic: {
    label: "Anthropic",
    key: "required",
    baseUrl: false,
    agentModelPlaceholder: "claude-sonnet-4-5",
    fastModelPlaceholder: "claude-haiku-4-5",
    help: "A key from console.anthropic.com. Model names are the ones in Anthropic's documentation.",
  },
  openai: {
    label: "OpenAI",
    key: "required",
    baseUrl: false,
    agentModelPlaceholder: "gpt-5",
    fastModelPlaceholder: "gpt-5-mini",
    help: "A key from platform.openai.com. Model names are the ones in OpenAI's documentation.",
  },
  openrouter: {
    label: "OpenRouter",
    key: "required",
    baseUrl: false,
    agentModelPlaceholder: "anthropic/claude-sonnet-4.5",
    fastModelPlaceholder: "google/gemini-2.5-flash",
    help: "A key from openrouter.ai. Models are written as provider/model.",
  },
  compatible: {
    label: "OpenAI-compatible endpoint",
    key: "optional",
    baseUrl: true,
    baseUrlPlaceholder: "https://api.example.com/v1",
    agentModelPlaceholder: "model name",
    fastModelPlaceholder: "model name",
    help: "Any server that speaks the OpenAI chat completions API: a gateway, vLLM, LM Studio, llama.cpp.",
  },
  ollama: {
    label: "Ollama (local model)",
    key: "optional",
    baseUrl: true,
    baseUrlPlaceholder: "http://localhost:11434/v1",
    agentModelPlaceholder: "qwen3:14b",
    fastModelPlaceholder: "qwen3:4b",
    help: "A model running on your own machine. The agent needs one that supports tool calling.",
  },
};

/** What rides along with an assistant message: the run it came from and the tokens it used. */
export type AgentMessageMetadata = {
  runId?: string;
  /** The mode the run was in: an answer from a mode that writes may have changes to show and undo. */
  mode?: AgentMode;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
};

/** A note a user pointed the agent at with `@`. */
export type Mention = { id: string; title: string };

export type AgentDataParts = { mentions: { notes: Mention[] } };

export type AgentUIMessage = UIMessage<AgentMessageMetadata, AgentDataParts>;

/** What every agent tool returns: text for the model, and the notes it drew on for the panel to link. */
export type ToolResult = {
  text: string;
  notes: Mention[];
};

/** One thing a run changed, for the list under its answer. */
export type RunChangeSummary = { id: string; nodeId: string | null; summary: string };

/** What a run changed, and whether it has been taken back. */
export type RunChanges = { changes: RunChangeSummary[]; undone: boolean };

export const modeMeta: Record<AgentMode, { label: string; description: string }> = {
  ask: { label: "Ask", description: "Reads what you can read and changes nothing." },
  suggest: { label: "Suggest", description: "Text edits arrive as suggestions; anything else asks you first." },
  auto: { label: "Auto", description: "Changes apply straight away. Asks before trashing, changing canon, or touching many notes." },
};

/** A long job: a saved list of steps, run one request each (lib/agent/tasks.ts). */
export type AgentTask = {
  id: string;
  title: string;
  mode: AgentMode;
  status: "pending" | "running" | "paused" | "done" | "failed";
  steps: AgentTaskStep[];
  updatedAt: Date;
};

export type ThreadSummary = { id: string; title: string; updatedAt: Date };

// ---- Inline editor actions (plan.md 2.11 "Inline in the editor") -----------------

export const inlineActions = ["continue", "rewrite", "shorten", "expand", "tone"] as const;
export type InlineAction = (typeof inlineActions)[number];

export const inlineTones = ["warmer", "darker", "funnier", "more formal", "more casual", "more tense", "more lyrical", "plainer"] as const;
export type InlineTone = (typeof inlineTones)[number];

export const inlineActionMeta: Record<InlineAction, { label: string; needsSelection: boolean }> = {
  continue: { label: "Continue writing", needsSelection: false },
  rewrite: { label: "Rewrite", needsSelection: true },
  shorten: { label: "Shorten", needsSelection: true },
  expand: { label: "Expand", needsSelection: true },
  tone: { label: "Change tone", needsSelection: true },
};

/** One line of the inline route's response (newline-delimited JSON). */
export type InlineEvent =
  | { t: "text"; v: string }
  | { t: "error"; v: string }
  | { t: "done"; inputTokens: number; outputTokens: number };

// ---- Project search -----------------------------------------------------------------

/** Marks around the matched words in a search snippet. Private-use characters, so they can't collide with what people write. */
export const HIT_START = "\uE000";
export const HIT_END = "\uE001";
