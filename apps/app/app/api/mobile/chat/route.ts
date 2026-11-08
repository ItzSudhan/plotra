import { requireNodeAccess, requireProjectAccess } from "@/lib/access";
import { ApiError, body, json, read, withApi } from "@/lib/api/handler";
import { deleteChatMessage, listChat, sendChat, type ChatMessageRow } from "@/lib/chat-actions";
import { listPeople } from "@/lib/workflow-actions";

// Chat for the phone app (apps/mobile/src/lib/chat-api.ts): the project's
// conversation, or a note's, through the web's own functions
// (lib/chat-actions.ts), run as the token's owner. Anyone who can read may
// read along, commenters and editors may talk, "@Name" tells that person,
// and you delete your own messages (or anyone's, if you manage the project).
// The phone announces what it sends to open chats as the web does, over the
// project's presence room (`chat:<note id or "project">`).
//
// GET  ?project=[&note=][&before=ISO]  { messages, people, canTalk, canManage }: the latest 100, oldest first; `before` pages back.
// POST ?project=[&note=]  { action: "send", body }        → { message }
//                         { action: "delete", messageId } → { ok }

function params(request: Request) {
  const url = new URL(request.url);
  const project = url.searchParams.get("project");
  if (!project) throw new ApiError(400, "Send ?project=<id>.");
  return { project, note: url.searchParams.get("note") || null, before: url.searchParams.get("before") || undefined };
}

const toPhone = (m: ChatMessageRow, me: string) => ({ id: m.id, authorId: m.authorId, body: m.body, createdAt: new Date(m.createdAt).toISOString(), mine: m.authorId === me });

export function GET(request: Request) {
  return withApi(request, "read", async (caller) => {
    const { project, note, before } = params(request);
    const me = caller.session.user.id;
    return json(
      await read(async () => {
        const actions = note ? (await requireNodeAccess(project, note)).access.actions : (await requireProjectAccess(project)).actions;
        const [messages, people] = await Promise.all([listChat(project, note, before), listPeople(project)]);
        return {
          messages: messages.map((m) => toPhone(m, me)),
          // Names for authors, and who can be @-mentioned, as the web's chat box suggests them.
          people: people.map((p) => ({ id: p.id, name: p.name, image: p.image, guest: p.guest })),
          canTalk: actions.has("comment"),
          canManage: actions.has("manage"),
        };
      }),
    );
  });
}

export function POST(request: Request) {
  return withApi(request, "write", async (caller) => {
    const { project, note } = params(request);
    const input = await body(request);
    switch (input.action) {
      case "send":
        if (typeof input.body !== "string") throw new ApiError(400, "Send body.");
        return json({ message: toPhone(await sendChat(project, note, input.body), caller.session.user.id) });
      case "delete":
        if (typeof input.messageId !== "string") throw new ApiError(400, "Send messageId.");
        await deleteChatMessage(project, input.messageId);
        return json({ ok: true });
      default:
        throw new ApiError(400, "Send an action: send or delete.");
    }
  });
}
