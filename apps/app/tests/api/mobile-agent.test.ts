import { describe, expect, test } from "bun:test";
import { phoneAi, toPhoneMessage } from "@/lib/agent/phone";
import { noAi, type AgentUIMessage, type AiState } from "@/lib/agent/types";

// What the phone app is shown of the AI agent (app/api/mobile/agent).

const on: AiState = { workspaceEnabled: true, projectEnabled: true, enabled: true, hasModel: true, modelSource: "user", browserModel: null, forbidden: null };

describe("the agent on the phone", () => {
  test("says why AI is off, and who turns it on", () => {
    expect(phoneAi(on)).toEqual({ on: true, modelSource: "user" });
    expect(phoneAi(noAi)).toMatchObject({ on: false, reason: "workspace" });
    expect(phoneAi({ ...noAi, forbidden: "workspace" })).toMatchObject({ on: false, reason: "promise" });
    expect(phoneAi({ ...noAi, forbidden: "server" })).toMatchObject({ on: false, reason: "server" });
    expect(phoneAi({ ...on, projectEnabled: false, enabled: false })).toMatchObject({ on: false, reason: "project" });
    expect(phoneAi({ ...on, enabled: false })).toMatchObject({ on: false, reason: "edit" });
    expect(phoneAi({ ...on, hasModel: false, modelSource: null })).toMatchObject({ on: false, reason: "no-model" });
    expect(phoneAi({ ...on, browserModel: { provider: "ollama", baseUrl: "http://localhost:11434/v1", agentModel: "m", fastModel: "m" } })).toMatchObject({ on: false, reason: "own-machine" });
  });

  test("reads an answer into text, steps, notes used and what it asks", () => {
    const message = {
      id: "m1",
      role: "assistant",
      metadata: { runId: "r1", mode: "suggest", inputTokens: 10, outputTokens: 5 },
      parts: [
        { type: "step-start" },
        { type: "tool-searchProject", toolCallId: "c1", state: "output-available", input: { query: "letter" }, output: { text: "…", notes: [{ id: "n1", title: "Ch 1" }, { id: "n1", title: "Ch 1" }] } },
        { type: "tool-readNote", toolCallId: "c2", state: "input-available", input: { nodeId: "n2" } },
        { type: "text", text: "Here it is." },
        { type: "text", text: "  " },
        {
          type: "tool-trashNote",
          toolCallId: "c3",
          state: "approval-requested",
          input: { nodeId: "n3" },
          approval: { id: "ap1", requestReason: "Trashing asks first." },
        },
      ],
    } as unknown as AgentUIMessage;
    const view = toPhoneMessage(message);
    expect(view.items).toEqual([
      { type: "step", id: "c1", text: "Searched for “letter”", nodeId: null, state: "done", error: null },
      { type: "step", id: "c2", text: "Reading", nodeId: "n2", state: "running", error: null },
      { type: "text", text: "Here it is." },
      expect.objectContaining({ type: "step", id: "c3", nodeId: "n3", state: "waiting" }),
    ]);
    expect(view.used).toEqual([{ id: "n1", title: "Ch 1" }]);
    expect(view.approvals).toEqual([expect.objectContaining({ id: "ap1", nodeId: "n3" })]);
    expect(view.approvalReason).toBe("Trashing asks first.");
    expect(view).toMatchObject({ runId: "r1", mode: "suggest", tokens: { in: 10, out: 5 } });
  });

  test("keeps what the writer pointed at", () => {
    const view = toPhoneMessage({ id: "u1", role: "user", parts: [{ type: "text", text: "Where?" }, { type: "data-mentions", data: { notes: [{ id: "n1", title: "Ch 1" }] } }] } as AgentUIMessage);
    expect(view).toMatchObject({ role: "user", items: [{ type: "text", text: "Where?" }], mentions: [{ id: "n1", title: "Ch 1" }], tokens: null });
  });
});
