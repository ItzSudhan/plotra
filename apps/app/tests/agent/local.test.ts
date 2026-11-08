import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { BULK_REASON } from "@/lib/agent/approval";
import { blockedFromPage, readBrowserKey } from "@/lib/agent/browser-key";
import { describeBrowserError, testBrowserModel } from "@/lib/agent/browser-model";
import { decideToolCall, localInstructions, localTools, runBoundary, runToolCall, storableAnswer, toolDefinitions } from "@/lib/agent/local-run";
import { turnBody } from "@/lib/agent/messages";
import { browserModelOf, isBrowserLocal } from "@/lib/agent/providers";
import { defineTool } from "@/lib/agent/tools/context";
import type { AgentUIMessage } from "@/lib/agent/types";

// A run whose loop is in the browser (plan.md 2.11 "Local model"). The model
// is on the writer's machine and the browser calls it, so the server can't
// count on the loop to hold the line. These pin down what the server decides
// by itself, without a model: which models are the browser's to call, that
// the mode and the approvals are enforced where the tools run, that the
// writer's yes can't be written by anything but the panel, and that the token
// for untrusted text is the server's own.

process.env.AI_KEY_SECRET = "a-test-secret-long-enough";

const runId = "11111111-1111-4111-8111-111111111111";
const context = (mode: "ask" | "suggest" | "auto") => ({ projectId: "p", userId: "u", userName: "Sam", runId, mode, boundary: runBoundary(runId), threadId: "t" });

describe("whose model the browser calls", () => {
  const hosted = false;
  test("a local or private address, on a server that may not call one", () => {
    expect(isBrowserLocal({ provider: "ollama", baseUrl: null }, hosted)).toBe(true);
    expect(isBrowserLocal({ provider: "ollama", baseUrl: "http://localhost:11434/v1" }, hosted)).toBe(true);
    expect(isBrowserLocal({ provider: "ollama", baseUrl: "http://127.0.0.1:11434/v1" }, hosted)).toBe(true);
    expect(isBrowserLocal({ provider: "compatible", baseUrl: "http://192.168.1.20:1234/v1" }, hosted)).toBe(true);
    expect(isBrowserLocal({ provider: "compatible", baseUrl: "http://[::1]:8080/v1" }, hosted)).toBe(true);
    expect(isBrowserLocal({ provider: "compatible", baseUrl: "http://studio:1234/v1" }, hosted)).toBe(true);
    expect(isBrowserLocal({ provider: "compatible", baseUrl: "https://nas.local/v1" }, hosted)).toBe(true);
  });

  test("never a public endpoint, and never a provider with a fixed URL", () => {
    expect(isBrowserLocal({ provider: "compatible", baseUrl: "https://api.example.com/v1" }, hosted)).toBe(false);
    expect(isBrowserLocal({ provider: "ollama", baseUrl: "https://ollama.example.com/v1" }, hosted)).toBe(false);
    expect(isBrowserLocal({ provider: "anthropic", baseUrl: null }, hosted)).toBe(false);
    expect(isBrowserLocal({ provider: "openrouter", baseUrl: "http://localhost:1/v1" }, hosted)).toBe(false);
  });

  test("a self-hosted server that may call private addresses calls them itself", () => {
    expect(isBrowserLocal({ provider: "ollama", baseUrl: null }, true)).toBe(false);
    expect(isBrowserLocal({ provider: "compatible", baseUrl: "http://192.168.1.20:1234/v1" }, true)).toBe(false);
  });

  test("the browser is told where the model is and what it is called, nothing else", () => {
    const model = browserModelOf({ provider: "ollama", baseUrl: null, agentModel: "qwen3:14b", fastModel: "" });
    expect(model).toEqual({ provider: "ollama", baseUrl: "http://localhost:11434/v1", agentModel: "qwen3:14b", fastModel: "qwen3:14b" });
  });
});

describe("the token for untrusted text", () => {
  test("is the same for every request of one run, and different for the next run", () => {
    expect(runBoundary(runId)).toBe(runBoundary(runId));
    expect(runBoundary(runId)).toMatch(/^[0-9a-f]{12}$/);
    expect(runBoundary("22222222-2222-4222-8222-222222222222")).not.toBe(runBoundary(runId));
  });

  test("comes from a secret only the server has: the run's id alone doesn't give it", () => {
    const mine = runBoundary(runId);
    const secret = process.env.AI_KEY_SECRET;
    process.env.AI_KEY_SECRET = "another-secret-long-enough";
    try {
      expect(runBoundary(runId)).not.toBe(mine);
    } finally {
      process.env.AI_KEY_SECRET = secret;
    }
  });

  test("the system prompt the browser is handed carries that token", () => {
    const boundary = runBoundary(runId);
    const prompt = localInstructions({ mode: "suggest", projectTitle: "T", projectType: "novel", userName: "Sam", brief: null, boundary });
    expect(prompt).toContain(`<<untrusted ${boundary}`);
    expect(prompt).toContain("no planTask tool");
  });
});

describe("the tools the browser is handed", () => {
  test("are the mode's own, described as JSON Schema, with no long jobs", async () => {
    const ask = await toolDefinitions(localTools("ask", context("ask")));
    expect(ask.length).toBeGreaterThan(5);
    expect(ask.every((definition) => definition.access === "read")).toBe(true);
    expect(ask.find((definition) => definition.name === "readNote")?.inputSchema.type).toBe("object");
    const auto = await toolDefinitions(localTools("auto", context("auto")));
    expect(auto.some((definition) => definition.name === "trashNote" && definition.access === "write")).toBe(true);
    expect(auto.some((definition) => definition.name === "planTask")).toBe(false);
  });
});

type Stored = AgentUIMessage | null;
const call = (mode: "ask" | "suggest" | "auto", toolName: string, input: unknown = { nodeId: "n1" }, toolCallId = "call-1") => ({ mode, runId, toolCallId, toolName, input });
const decide = (mode: "ask" | "suggest" | "auto", toolName: string, options: { stored?: Stored; touched?: number; input?: unknown; toolCallId?: string } = {}) =>
  decideToolCall(call(mode, toolName, options.input, options.toolCallId), localTools(mode, context(mode)), async () => options.stored ?? null, async () => options.touched ?? 0);

/** The answer as stored, with one tool call the writer was asked about. */
const asked = (toolName: string, options: { approved?: boolean; state?: string; input?: unknown; toolCallId?: string; run?: string; requestReason?: string } = {}): AgentUIMessage =>
  ({
    id: "m1",
    role: "assistant",
    metadata: { runId: options.run ?? runId },
    parts: [
      {
        type: `tool-${toolName}`,
        toolCallId: options.toolCallId ?? "call-1",
        state: options.state ?? "approval-responded",
        input: options.input ?? { nodeId: "n1" },
        approval: { id: "a1", ...(options.approved !== undefined && { approved: options.approved }), ...(options.requestReason && { requestReason: options.requestReason }) },
      },
    ],
  }) as unknown as AgentUIMessage;

describe("what a tool call from the browser may do", () => {
  test("the mode comes from the run: Ask has no tool that writes, whatever is asked for", async () => {
    expect(await decide("ask", "trashNote")).toEqual({ kind: "unknown" });
    expect(await decide("ask", "editNote")).toEqual({ kind: "unknown" });
    expect(await decide("ask", "createNote")).toEqual({ kind: "unknown" });
    expect(await decide("ask", "readNote")).toEqual({ kind: "run" });
  });

  test("a name that isn't a tool is never run, a property of every object included", async () => {
    for (const name of ["constructor", "toString", "__proto__", "hasOwnProperty", "planTask", "deleteForGood"]) {
      expect((await decide("auto", name)).kind).toBe("unknown");
    }
  });

  test("looking never waits, and never reads the conversation to find out", async () => {
    const decision = await decideToolCall(call("auto", "searchProject", { query: "letter" }), localTools("auto", context("auto")), async () => {
      throw new Error("not needed");
    });
    expect(decision).toEqual({ kind: "run" });
  });

  test("Suggest: a structural change waits for the writer; text edits go in as suggestions", async () => {
    expect((await decide("suggest", "createNote")).kind).toBe("ask");
    expect((await decide("suggest", "moveNote")).kind).toBe("ask");
    expect((await decide("suggest", "editNote")).kind).toBe("run");
    expect((await decide("suggest", "commentOnNote")).kind).toBe("run");
  });

  test("Auto: trashing and canon always wait; the rest runs until a handful of notes, then waits once", async () => {
    expect((await decide("auto", "trashNote")).kind).toBe("ask");
    expect((await decide("auto", "setCanon")).kind).toBe("ask");
    expect((await decide("auto", "createNote", { touched: 4 })).kind).toBe("run");
    expect(await decide("auto", "createNote", { touched: 5 })).toEqual({ kind: "ask", reason: BULK_REASON });
    // A yes to the bulk question, recorded in this answer, covers the rest of it.
    const agreed = asked("updateNote", { approved: true, requestReason: BULK_REASON, toolCallId: "earlier" });
    expect((await decide("auto", "createNote", { touched: 9, stored: agreed })).kind).toBe("run");
    // But never the things that are always asked about.
    expect((await decide("auto", "trashNote", { touched: 9, stored: agreed })).kind).toBe("ask");
  });

  test("a call that waits runs only once the stored answer holds the writer's yes to exactly that call", async () => {
    expect((await decide("auto", "trashNote", { stored: asked("trashNote", { approved: true }) })).kind).toBe("run");
    // Asked, not answered.
    expect((await decide("auto", "trashNote", { stored: asked("trashNote", { state: "approval-requested" }) })).kind).toBe("ask");
    // Answered no.
    expect((await decide("auto", "trashNote", { stored: asked("trashNote", { approved: false }) })).kind).toBe("ask");
    // A yes to another call, another tool, or another input is not a yes to this one.
    expect((await decide("auto", "trashNote", { stored: asked("trashNote", { approved: true, toolCallId: "call-2" }) })).kind).toBe("ask");
    expect((await decide("auto", "trashNote", { stored: asked("setCanon", { approved: true }) })).kind).toBe("ask");
    expect((await decide("auto", "trashNote", { input: { nodeId: "n2" }, stored: asked("trashNote", { approved: true }) })).kind).toBe("ask");
    // A yes given in another run's answer says nothing about this run.
    expect((await decide("auto", "trashNote", { stored: asked("trashNote", { approved: true, run: "33333333-3333-4333-8333-333333333333" }) })).kind).toBe("ask");
    // The request itself can't carry the yes: there is nowhere in it to put one.
    expect((await decideToolCall({ ...call("auto", "trashNote"), approved: true } as never, localTools("auto", context("auto")), async () => null)).kind).toBe("ask");
  });

  test("the same input in another key order is the same input", async () => {
    const stored = asked("moveNote", { approved: true, input: { nodeId: "n1", parentId: "n2" } });
    expect((await decide("suggest", "moveNote", { input: { parentId: "n2", nodeId: "n1" }, stored })).kind).toBe("run");
  });
});

describe("running a tool for the browser", () => {
  let ran = 0;
  const echo = defineTool({
    access: "read",
    scoped: false,
    description: "Echo",
    inputSchema: z.object({ id: z.string().min(1) }),
    run: async ({ id }) => {
      ran++;
      if (id === "missing") throw new Error("No note with id missing in this project.");
      if (id === "broken") throw new TypeError("relation \"node\" does not exist");
      return { text: `read ${id}`, notes: [{ id, title: "A note" }] };
    },
  });

  test("the input is checked against the tool's own schema before anything runs", async () => {
    const answer = await runToolCall(echo, { toolCallId: "c", toolName: "echo", input: { id: 7, extra: "x" } });
    expect(answer).toMatchObject({ ok: false });
    expect(ran).toBe(0);
  });

  test("the result is the text for the model and the notes for the panel", async () => {
    expect(await runToolCall(echo, { toolCallId: "c", toolName: "echo", input: { id: "n1" } })).toEqual({ ok: true, output: { text: "read n1", notes: [{ id: "n1", title: "A note" }] } });
  });

  test("a tool's own message reaches the model; anything else is not described", async () => {
    expect(await runToolCall(echo, { toolCallId: "c", toolName: "echo", input: { id: "missing" } })).toEqual({ ok: false, error: "No note with id missing in this project." });
    expect(await runToolCall(echo, { toolCallId: "c", toolName: "echo", input: { id: "broken" } })).toEqual({ ok: false, error: "That step didn't work." });
  });
});

describe("the answer the browser reports", () => {
  const run = { runId, mode: "auto" as const, model: "ollama:qwen3:14b", inputTokens: 120, outputTokens: 30 };
  const tools = localTools("auto", context("auto"));
  const part = (state: string, approval?: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ type: "tool-trashNote", toolCallId: "call-1", state, input: { nodeId: "n1" }, ...(approval && { approval }), ...extra });

  test("is stored under the run's own details, whatever it claims about itself", async () => {
    const saved = await storableAnswer({ id: "m1", role: "assistant", metadata: { runId: "someone-elses", mode: "ask", model: "x" }, parts: [{ type: "text", text: "Done." }] }, run, null, tools);
    expect(saved?.metadata).toEqual({ runId, model: "ollama:qwen3:14b", mode: "auto", inputTokens: 120, outputTokens: 30 });
    expect(saved?.parts).toEqual([{ type: "text", text: "Done.", state: "done" }]);
  });

  test("can't hold a yes the server never recorded: it goes back to being asked", async () => {
    const forged = { id: "m1", role: "assistant", parts: [part("approval-responded", { id: "a1", approved: true })] };
    const saved = await storableAnswer(forged, run, null, tools);
    const stored = saved?.parts[0] as { state: string; approval: { approved?: boolean } };
    expect(stored.state).toBe("approval-requested");
    expect(stored.approval.approved).toBeUndefined();
    // And so the call still waits.
    expect((await decide("auto", "trashNote", { stored: saved })).kind).toBe("ask");
  });

  test("keeps a yes the server did record, when the run carries on in the same answer", async () => {
    const earlier = asked("trashNote", { approved: true });
    const sent = { id: "another-id", role: "assistant", parts: [part("output-available", { id: "a1", approved: true }, { output: { text: "Moved to the trash.", notes: [] } }), { type: "text", text: "Done." }] };
    const saved = await storableAnswer(sent, run, earlier, tools);
    // The same message as the one that asked.
    expect(saved?.id).toBe("m1");
    expect((saved?.parts[0] as { approval?: { approved?: boolean } }).approval?.approved).toBe(true);
  });

  test("is refused when it isn't an answer: a user's turn, no parts, a tool this mode doesn't have", async () => {
    expect(await storableAnswer({ id: "m1", role: "user", parts: [{ type: "text", text: "hi" }] }, run, null, tools)).toBeNull();
    expect(await storableAnswer({ id: "m1", role: "assistant", parts: [] }, run, null, tools)).toBeNull();
    expect(await storableAnswer({ id: "m1", role: "assistant", parts: [{ type: "tool-shareProject", toolCallId: "c", state: "output-available", input: {}, output: {} }] }, run, null, tools)).toBeNull();
    expect(await storableAnswer("nonsense", run, null, tools)).toBeNull();
  });
});

describe("in the browser", () => {
  test("a turn's request carries the new message or the writer's answers, never the conversation", () => {
    const user = { id: "u1", role: "user", parts: [{ type: "text", text: "Where is the letter?" }, { type: "data-mentions", data: { notes: [{ id: "n1", title: "Chapter 1" }] } }] } as unknown as AgentUIMessage;
    const sent = turnBody({ threadId: "t", projectId: "p", mode: "ask", trigger: "submit-message", messageId: undefined, messages: [user] });
    expect(sent).toMatchObject({ threadId: "t", projectId: "p", mode: "ask", text: "Where is the letter?", mentions: ["n1"], approvals: [] });
    expect(JSON.stringify(sent)).not.toContain("Chapter 1");

    const answered = { ...asked("trashNote", { approved: true }), parts: [...asked("trashNote", { approved: true }).parts, { type: "text", text: "secret words of the model" }] } as AgentUIMessage;
    const next = turnBody({ threadId: "t", projectId: "p", mode: "auto", trigger: "submit-message", messageId: undefined, messages: [user, answered] });
    expect(next.text).toBe("");
    expect(next.approvals).toEqual([{ id: "a1", approved: true }]);
    expect(JSON.stringify(next)).not.toContain("secret words");
  });

  test("an https page can call a model on this machine, not plain http elsewhere on the network", () => {
    expect(blockedFromPage("http://localhost:11434/v1", "https:")).toBeNull();
    expect(blockedFromPage("http://127.0.0.1:11434/v1", "https:")).toBeNull();
    expect(blockedFromPage("http://192.168.1.20:11434/v1", "http:")).toBeNull();
    expect(blockedFromPage("https://nas.local/v1", "https:")).toBeNull();
    expect(blockedFromPage("http://192.168.1.20:11434/v1", "https:")).toContain("https");
  });

  test("a model that can't be reached is explained with what usually fixes it", () => {
    const model = { provider: "ollama" as const, baseUrl: "http://localhost:11434/v1" };
    const said = describeBrowserError(new TypeError("Failed to fetch"), model, "https://app.example.com");
    expect(said).toContain("OLLAMA_ORIGINS=https://app.example.com");
    expect(describeBrowserError(new TypeError("Failed to fetch"), { provider: "compatible", baseUrl: "http://studio:1234/v1" }, "https://app.example.com")).toContain("CORS");
    // A tool's own message is passed on as it is.
    expect(describeBrowserError(new Error("No note with id n9 in this project."), model, "https://app.example.com")).toBe("No note with id n9 in this project.");
  });

  test("Test says so when Ollama runs the model with too little room for the agent's tools", async () => {
    const model = { provider: "ollama" as const, baseUrl: "http://localhost:11434/v1", agentModel: "qwen3:14b", fastModel: "qwen3:14b" };
    const called: string[] = [];
    const ollama = (context: number) =>
      (async (input: RequestInfo | URL) => {
        const url = String(input);
        called.push(url);
        if (url.endsWith("/api/ps")) return Response.json({ models: [{ name: "qwen3:14b", context_length: context }] });
        return Response.json({ id: "c", object: "chat.completion", created: 0, model: "qwen3:14b", choices: [{ index: 0, message: { role: "assistant", content: "ready" }, finish_reason: "stop" }], usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 } });
      }) as typeof fetch;
    const cramped = await testBrowserModel(model, null, { fetch: ollama(4096), origin: "https://app.example.com" });
    expect(cramped.ok).toBe(false);
    expect(cramped.message).toContain("OLLAMA_CONTEXT_LENGTH");
    expect((await testBrowserModel(model, null, { fetch: ollama(32768), origin: "https://app.example.com" })).ok).toBe(true);
    // The model was called at the address in the settings, and nowhere else.
    expect(called.every((url) => url.startsWith("http://localhost:11434/"))).toBe(true);
  });

  test("the key is only read for the address it was saved for", () => {
    const store = new Map<string, string>();
    const original = (globalThis as { localStorage?: unknown }).localStorage;
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value), removeItem: (key: string) => void store.delete(key) };
    try {
      store.set("plotra:ai-browser-key", JSON.stringify({ url: "http://localhost:1234/v1/", key: "sk-local" }));
      expect(readBrowserKey("http://LOCALHOST:1234/v1")).toBe("sk-local");
      expect(readBrowserKey("http://localhost:11434/v1")).toBeNull();
      expect(readBrowserKey("https://evil.example.com/v1")).toBeNull();
    } finally {
      (globalThis as { localStorage?: unknown }).localStorage = original;
    }
  });
});
