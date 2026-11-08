import { isStepCount, jsonSchema, streamText, tool, toUIMessageStream, type ChatRequestOptions, type LanguageModelUsage, type ToolApprovalStatus, type ToolSet, type UIMessageChunk } from "ai";
import { readBrowserKey } from "./browser-key";
import { browserModel, describeBrowserError } from "./browser-model";
import type { LocalFinish, LocalInlineStart, LocalStart, LocalToolAnswer, LocalToolRequest } from "./local-types";
import { toModelMessages, turnBody } from "./messages";
import type { AgentMode, AgentUIMessage, ToolResult } from "./types";

// The agent's loop, run in the browser (plan.md 2.11 "Local model"). On the
// hosted version the server can't reach a model on the writer's own machine,
// so this page calls it: the model is asked, it asks for tools, the results go
// back to it, until it answers. It is the same loop as lib/agent/run.ts with
// the two ends swapped. The model call is local, and every tool is a request
// to the server (app/api/agent/local/tool), which runs it as the person and
// decides by itself what the run may do.
//
// Nothing here is trusted by the server, and nothing here needs to be: this
// file only decides when to call the model again. The mode, the permissions
// and what waits for the writer's yes are enforced on the other side.
//
// This file runs in the browser only, and is loaded when a run starts
// (components/agent/chat.tsx), so people on a hosted model don't download it.

type Fetch = typeof fetch;

export type BrowserRun = {
  projectId: string;
  /** For tests: stands in for this app's own routes. */
  api?: Fetch;
  /** For tests: stands in for the request to the model. */
  modelFetch?: Fetch;
  /** For tests: the key for the model at a URL. Left out, the one saved in this browser. */
  apiKey?: (baseUrl: string) => string | null;
  /** For tests: this page's origin, named when the model turns it away. */
  origin?: string;
};

const ROUTES = "/api/agent/local";

/** One request to the server's half of the run (app/api/agent/local). Its errors are sentences written for the writer. */
async function post<T>(config: BrowserRun, path: "start" | "tool" | "finish" | "inline", body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await (config.api ?? fetch)(`${ROUTES}/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal });
  if (!response.ok) throw new Error((await response.text()) || "The run stopped with an error.");
  return (await response.json()) as T;
}

type Usage = { inputTokens: number; outputTokens: number };
const NOTHING: Usage = { inputTokens: 0, outputTokens: 0 };
const usageOf = (usage: Pick<LanguageModelUsage, "inputTokens" | "outputTokens"> | undefined): Usage => ({ inputTokens: usage?.inputTokens ?? 0, outputTokens: usage?.outputTokens ?? 0 });

/**
 * The run's tools as the model sees them. Each is only a description: calling
 * one is a request to the server, which checks the input again, runs the tool
 * as the person, and answers with its result or with why it didn't run.
 */
function browserTools(started: LocalStart, call: (request: LocalToolRequest, signal?: AbortSignal) => Promise<LocalToolAnswer>): ToolSet {
  const tools: ToolSet = {};
  for (const definition of started.tools) {
    tools[definition.name] = tool({
      description: definition.description,
      inputSchema: jsonSchema<unknown>(definition.inputSchema),
      execute: async (input: unknown, { toolCallId, abortSignal }: { toolCallId: string; abortSignal?: AbortSignal }): Promise<ToolResult> => {
        const answer = await call({ runId: started.runId, toolCallId, toolName: definition.name, input }, abortSignal);
        if ("ok" in answer && answer.ok) return answer.output;
        // The server's sentence, for the model to act on ("No note with id…", "It needs the writer's yes first").
        throw new Error("ok" in answer ? answer.error : "That step didn't work.");
      },
      // The model gets the text; the notes list is for the panel.
      toModelOutput: ({ output }: { output: ToolResult }) => ({ type: "text" as const, value: output.text }),
    });
  }
  return tools;
}

type Outcome = { status: LocalFinish["status"]; usage: Usage; error?: string };

/**
 * One turn of a conversation, with the model called from this page. Has the
 * shape of a chat transport's `sendMessages`, so `useChat` can't tell it from
 * the server's stream: the same message parts, the same questions to the
 * writer, the same way of carrying on once they answer.
 */
export async function sendBrowserTurn(
  config: BrowserRun,
  options: { trigger: "submit-message" | "regenerate-message"; chatId: string; messageId: string | undefined; messages: AgentUIMessage[]; abortSignal: AbortSignal | undefined } & ChatRequestOptions,
): Promise<ReadableStream<UIMessageChunk>> {
  const mode = (options.body as { mode?: AgentMode } | undefined)?.mode ?? "ask";
  // The server saves the message (or the writer's answers), opens the run, and says what to run it with.
  const started = await post<LocalStart>(
    config,
    "start",
    turnBody({ threadId: options.chatId, projectId: config.projectId, mode, trigger: options.trigger, messageId: options.messageId, messages: options.messages }),
    options.abortSignal,
  );
  const origin = config.origin ?? (typeof location === "undefined" ? "" : location.origin);
  const describe = (error: unknown) => describeBrowserError(error, started.model, origin);

  // The run is closed on the server exactly once, however it ends.
  let reported = false;
  // Closing the tab in the middle of a run: one last request that outlives the page, so the run doesn't stay open
  // and what it changed can be undone. The answer itself is lost with the page.
  const leaving = () => {
    if (reported) return;
    reported = true;
    void (config.api ?? fetch)(`${ROUTES}/finish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runId: started.runId, status: "stopped", ...NOTHING } satisfies LocalFinish),
      keepalive: true,
    }).catch(() => {});
  };
  const page = typeof window === "undefined" ? null : window;
  page?.addEventListener("pagehide", leaving);
  const report = async (finish: Omit<LocalFinish, "runId">) => {
    if (reported) return;
    reported = true;
    page?.removeEventListener("pagehide", leaving);
    // Not on the run's abort signal: a stopped run still has to be closed.
    await post(config, "finish", { runId: started.runId, ...finish } satisfies LocalFinish).catch(() => {});
  };
  let settle!: (outcome: Outcome) => void;
  const settled = new Promise<Outcome>((resolve) => (settle = resolve));
  const ended = (outcome: Outcome) => {
    settle(outcome);
    // The answer is normally sent along when the stream closes (`onEnd` below); this is for a run that ended without that.
    if (outcome.status !== "done") setTimeout(() => void report({ status: outcome.status, ...outcome.usage, error: outcome.error }), 3000);
  };

  try {
    const call = (request: LocalToolRequest, signal?: AbortSignal) => post<LocalToolAnswer>(config, "tool", request, signal ?? options.abortSignal);
    const tools = browserTools(started, call);
    const writes = new Set(started.tools.filter((definition) => definition.access === "write").map((definition) => definition.name));

    const result = streamText({
      model: browserModel(started.model, "agent", (config.apiKey ?? readBrowserKey)(started.model.baseUrl), { fetch: config.modelFetch }),
      instructions: started.instructions,
      messages: await toModelMessages(started.history, tools),
      tools,
      // Whether a call waits for the writer is the server's to say (lib/agent/local-run.ts), and it says so again when the call is made.
      toolApproval: async ({ toolCall }): Promise<ToolApprovalStatus> => {
        if (!writes.has(toolCall.toolName)) return undefined;
        const answer = await call({ runId: started.runId, toolCallId: toolCall.toolCallId, toolName: toolCall.toolName, input: toolCall.input, check: true });
        const decision = "decision" in answer ? answer.decision : null;
        if (decision?.kind === "ask") return { type: "user-approval", reason: decision.reason };
        if (decision?.kind === "denied") return { type: "denied", reason: decision.reason };
        return undefined;
      },
      stopWhen: isStepCount(started.stepLimit),
      abortSignal: options.abortSignal,
      // One retry for a dropped connection; a second failure is the model's answer.
      maxRetries: 1,
      onEnd: ({ usage }) => ended({ status: "done", usage: usageOf(usage) }),
      onAbort: ({ steps }) => ended({ status: "stopped", usage: steps.reduce<Usage>((total, step) => ({ inputTokens: total.inputTokens + (step.usage.inputTokens ?? 0), outputTokens: total.outputTokens + (step.usage.outputTokens ?? 0) }), NOTHING) }),
      onError: ({ error }) => ended({ status: "failed", usage: NOTHING, error: describe(error) }),
    });

    return toUIMessageStream<ToolSet, AgentUIMessage>({
      stream: result.stream,
      tools,
      originalMessages: started.history,
      // The answer's id is made here; the server stores it under the same one.
      generateMessageId: () => crypto.randomUUID(),
      sendReasoning: false,
      messageMetadata: ({ part }) => {
        if (part.type === "start") return { runId: started.runId, model: started.label, mode: started.mode };
        // What the run used, on the person's own machine.
        if (part.type === "finish") return { runId: started.runId, model: started.label, mode: started.mode, ...usageOf(part.totalUsage) };
      },
      onError: describe,
      onEnd: async ({ responseMessage, isAborted, isCancelled }) => {
        const stopped = isAborted || isCancelled === true;
        // The loop's own callbacks say how it ended and what it used; a stream that closed without them was stopped.
        const outcome = await Promise.race([settled, new Promise<Outcome>((resolve) => setTimeout(() => resolve({ status: stopped ? "stopped" : "done", usage: NOTHING }), 2000))]);
        // A stopped answer is kept as far as it got; one that failed before saying anything isn't.
        const message = responseMessage.role === "assistant" && responseMessage.parts.length ? responseMessage : undefined;
        await report({ status: outcome.status, ...outcome.usage, error: outcome.error, message });
      },
    }) as ReadableStream<UIMessageChunk>;
  } catch (error) {
    await report({ status: "failed", ...NOTHING, error: describe(error) });
    throw new Error(describe(error));
  }
}

/**
 * An inline editor action (continue, rewrite, shorten, expand, change tone)
 * with the model called from this page. The server checks the person may edit
 * the note and builds the prompt (app/api/agent/local/inline); the text comes
 * back through `onText` as it is written. Resolves with the tokens used;
 * throws a sentence for the writer when it fails.
 */
export async function runBrowserInline(config: BrowserRun, request: Record<string, unknown>, handlers: { onText: (text: string) => void; signal: AbortSignal }): Promise<Usage> {
  const started = await post<LocalInlineStart>(config, "inline", { ...request, projectId: config.projectId }, handlers.signal);
  const origin = config.origin ?? (typeof location === "undefined" ? "" : location.origin);
  const report = (finish: Omit<LocalFinish, "runId">) => post(config, "finish", { runId: started.runId, ...finish } satisfies LocalFinish).catch(() => {});
  let usage = NOTHING;
  try {
    const result = streamText({
      model: browserModel(started.model, "fast", (config.apiKey ?? readBrowserKey)(started.model.baseUrl), { fetch: config.modelFetch }),
      instructions: started.instructions,
      prompt: started.prompt,
      maxOutputTokens: started.maxOutputTokens,
      maxRetries: 1,
      abortSignal: handlers.signal,
      // Errors are reported to the writer below. Without a handler the SDK logs them whole, request and all.
      onError: () => {},
    });
    for await (const part of result.stream) {
      if (part.type === "text-delta") handlers.onText(part.text);
      else if (part.type === "error") throw part.error;
      else if (part.type === "finish") usage = usageOf(part.totalUsage);
    }
    await report({ status: handlers.signal.aborted ? "stopped" : "done", ...usage });
    return usage;
  } catch (error) {
    const message = describeBrowserError(error, started.model, origin);
    await report({ status: handlers.signal.aborted ? "stopped" : "failed", ...usage, error: message });
    throw new Error(message);
  }
}
