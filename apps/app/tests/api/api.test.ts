import { describe, expect, test } from "bun:test";
import { describeError } from "@/lib/api/handler";
import { handleMessage, tools } from "@/lib/api/mcp";
import { bearerToken, hashToken, isTokenShaped, newToken, tokenPrefix, TOKEN_PREFIX } from "@/lib/api/token";

// The public API and the MCP server (beat-the-competitors.md step 9).

describe("API tokens", () => {
  test("are long, random, recognisable and kept only as a hash", async () => {
    const a = newToken();
    const b = newToken();
    expect(a.startsWith(TOKEN_PREFIX)).toBe(true);
    expect(a).not.toBe(b);
    expect(isTokenShaped(a)).toBe(true);
    expect(isTokenShaped("plt_short")).toBe(false);
    expect(isTokenShaped("ghp_" + a.slice(4))).toBe(false);
    expect(await hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashToken(a)).toBe(await hashToken(a));
    expect(tokenPrefix(a)).toHaveLength(10);
  });

  test("are read from a bearer header only", () => {
    expect(bearerToken("Bearer plt_abc")).toBe("plt_abc");
    expect(bearerToken("bearer   plt_abc ")).toBe("plt_abc");
    expect(bearerToken("Basic abc")).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });
});

describe("errors", () => {
  test("say what happened without saying more", () => {
    expect(describeError(Object.assign(new Error("x"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" }))).toEqual({ status: 404, message: "Not found." });
    expect(describeError(Object.assign(new Error("x"), { digest: "NEXT_REDIRECT;replace;/sign-in;307;" })).status).toBe(401);
    expect(describeError(new Error("You don't have permission to edit this."))).toEqual({ status: 403, message: "You don't have permission to edit this." });
    expect(describeError(new Error("Give the note a title."))).toEqual({ status: 400, message: "Give the note a title." });
    const original = console.error;
    console.error = () => {};
    // A database error's message isn't for the caller.
    expect(describeError(new TypeError("relation \"node\" does not exist"))).toEqual({ status: 500, message: "Something went wrong." });
    console.error = original;
  });
});

describe("the MCP server", () => {
  test("introduces itself in the version the client asked for", async () => {
    const reply = await handleMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }, "read");
    expect(reply).toMatchObject({ id: 1, result: { protocolVersion: "2025-06-18", serverInfo: { name: "plotra" }, capabilities: { tools: {} } } });
    const newer = await handleMessage({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "2099-01-01" } }, "read");
    expect((newer?.result as { protocolVersion: string }).protocolVersion).toBe("2025-11-25");
  });

  test("a read-only token sees only the tools that read", async () => {
    const list = async (scope: "read" | "write") => ((await handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" }, scope))?.result as { tools: { name: string }[] }).tools.map((t) => t.name);
    expect(await list("read")).toEqual(["list_projects", "list_notes", "read_note", "search"]);
    expect(await list("write")).toEqual(tools.map((t) => t.name));
    const call = await handleMessage({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "create_note", arguments: { projectId: "p", title: "x" } } }, "read");
    expect(call?.result).toMatchObject({ isError: true });
  });

  test("notifications get no reply, and the unknown get JSON-RPC errors", async () => {
    expect(await handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, "read")).toBeNull();
    expect(await handleMessage({ jsonrpc: "2.0", id: 4, method: "resources/list" }, "read")).toMatchObject({ error: { code: -32601 } });
    expect(await handleMessage({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "nope" } }, "read")).toMatchObject({ error: { code: -32602 } });
    expect(await handleMessage({ id: 6, method: "ping" } as never, "read")).toMatchObject({ error: { code: -32600 } });
    expect(await handleMessage({ jsonrpc: "2.0", id: 7, method: "ping" }, "read")).toEqual({ jsonrpc: "2.0", id: 7, result: {} });
  });

  test("a tool's missing argument is the model's to fix, not a protocol error", async () => {
    const reply = await handleMessage({ jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "read_note", arguments: { projectId: "p" } } }, "read");
    expect(reply?.result).toMatchObject({ isError: true, content: [{ type: "text", text: "noteId is required." }] });
  });

  test("every tool's input is a closed object schema with its required fields defined", () => {
    for (const tool of tools) {
      const schema = tool.inputSchema as { type: string; properties: Record<string, unknown>; required: string[]; additionalProperties: boolean };
      expect(schema.type).toBe("object");
      expect(schema.additionalProperties).toBe(false);
      for (const key of schema.required) expect(Object.keys(schema.properties)).toContain(key);
    }
  });
});
