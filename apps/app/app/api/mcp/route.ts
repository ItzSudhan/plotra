import { json, withApi } from "@/lib/api/handler";
import { handleMessage } from "@/lib/api/mcp";

// POST /api/mcp: Plotra's MCP server, Streamable HTTP with JSON answers
// (lib/api/mcp.ts). Signs in with an API token like the rest of the API, or
// with the token an app got by connecting through OAuth (lib/api/oauth.ts); a
// read-only one only sees the tools that read.
export async function POST(request: Request) {
  return withApi(request, "read", async (caller) => {
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error." } }, 400);
    }
    const batch = Array.isArray(payload);
    const messages = (batch ? payload : [payload]) as Parameters<typeof handleMessage>[0][];
    const replies = (await Promise.all(messages.map((m) => handleMessage(m, caller.scope)))).filter((r) => r !== null);
    // Only notifications: accepted, nothing to say.
    if (!replies.length) return new Response(null, { status: 202 });
    return json(batch ? replies : replies[0]);
  }, { mcp: true });
}

// No server-to-client stream: everything is answered in the POST.
export function GET() {
  return new Response("Method not allowed", { status: 405, headers: { allow: "POST" } });
}

export function DELETE() {
  return new Response(null, { status: 405, headers: { allow: "POST" } });
}
