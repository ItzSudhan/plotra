import { ApiError, body, json, withApi } from "@/lib/api/handler";
import { deleteAgentThread, getAgentThread, getProjectAi, getRunChanges, listAgentThreads, undoAgentRun } from "@/lib/agent-actions";
import { phoneAi, toPhoneMessage } from "@/lib/agent/phone";

// The AI agent for the phone app (apps/mobile/src/lib/agent-api.ts), through
// the web panel's own functions (lib/agent-actions.ts), run as the token's
// owner: AI is off until a workspace owner turns it on, each project has its
// own switch, only people who can edit may use it, and it runs on their own
// model (lib/agent/availability.ts). The answers themselves come from
// app/api/mobile/agent/turn.
//
// GET  ?project=              { ai, threads }: whether AI is on here for this person (and if not, why), and their chats.
// GET  ?project=&thread=      { messages }: one chat, as the phone shows it (lib/agent/phone.ts).
// GET  ?project=&run=         { changes, undone }: what a run changed.
// POST ?project=  { action: "delete", threadId } → { ok }
//                 { action: "undo", runId }      → { failed }

function project(request: Request) {
  const id = new URL(request.url).searchParams.get("project");
  if (!id) throw new ApiError(400, "Send ?project=<id>.");
  return id;
}

const text = (value: unknown, name: string) => {
  if (typeof value !== "string") throw new ApiError(400, `Send ${name}.`);
  return value;
};

export function GET(request: Request) {
  return withApi(request, "read", async () => {
    const projectId = project(request);
    const params = new URL(request.url).searchParams;
    const thread = params.get("thread");
    const run = params.get("run");
    if (thread) return json({ messages: (await getAgentThread(projectId, thread)).map(toPhoneMessage) });
    if (run) return json(await getRunChanges(projectId, run));
    const ai = phoneAi(await getProjectAi(projectId));
    // Nobody is shown chats from a project where AI is off for them.
    const threads = ai.on ? await listAgentThreads(projectId) : [];
    return json({ ai, threads: threads.map((t) => ({ id: t.id, title: t.title, updatedAt: new Date(t.updatedAt).toISOString() })) });
  });
}

export function POST(request: Request) {
  return withApi(request, "write", async () => {
    const projectId = project(request);
    const input = await body(request);
    switch (input.action) {
      case "delete":
        await deleteAgentThread(projectId, text(input.threadId, "threadId"));
        return json({ ok: true });
      case "undo": {
        const { failed } = await undoAgentRun(projectId, text(input.runId, "runId"));
        return json({ failed });
      }
      default:
        throw new ApiError(400, "Send an action: delete or undo.");
    }
  });
}
