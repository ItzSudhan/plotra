import { requireNodeAccess } from "@/lib/access";
import { ApiError, body, json, read, withApi } from "@/lib/api/handler";
import { anchorFrom, toMobileThreads } from "@/lib/api/mobile-comments";
import {
  createCommentThread,
  deleteComment,
  editComment,
  getOpenCommentCounts,
  listComments,
  listPeople,
  replyToThread,
  restoreComment,
  setThreadResolved,
} from "@/lib/workflow-actions";

// Comments for the phone app (apps/mobile/src/lib/comments-api.ts). Everything
// goes through the web's own comment functions (lib/workflow-actions.ts), run
// as the token's owner, so who may comment, edit and delete is the web's rule:
// commenting needs the note's `comment` action, editing is your own comments
// only, deleting is your own or anyone's with `manage`.
//
// GET  ?project=&note=  { threads, people, canComment, canManage }: the note's threads, oldest first.
// GET  ?project=        { counts }: open threads per note, for badges.
// POST ?project=&note=  { action, ... }:
//   create  { anchor: { start, end } | null, quote, body } → { id }
//   reply   { threadId, body }                            → { ok }
//   resolve { threadId, resolved }                        → { ok }
//   edit    { commentId, body }                           → { ok }
//   delete  { commentId }                                 → { ok, undo }
//   restore { undo }                                      → { ok }   (puts back what delete took, for a short while)

function params(request: Request) {
  const url = new URL(request.url);
  const project = url.searchParams.get("project");
  if (!project) throw new ApiError(400, "Send ?project=<id>.");
  return { project, note: url.searchParams.get("note") };
}

const text = (value: unknown, name: string) => {
  if (typeof value !== "string") throw new ApiError(400, `Send ${name}.`);
  return value;
};

export function GET(request: Request) {
  return withApi(request, "read", async (caller) => {
    const { project, note } = params(request);
    if (!note) return json({ counts: await getOpenCommentCounts(project) });
    return json(
      await read(async () => {
        const { access } = await requireNodeAccess(project, note);
        const threads = await listComments(project, note);
        const people = await listPeople(project);
        return {
          threads: toMobileThreads(threads, people, caller.session.user.id),
          // For @-mentions, as the web's comment box suggests them.
          people: people.map((p) => ({ id: p.id, name: p.name, image: p.image, guest: p.guest })),
          canComment: access.actions.has("comment"),
          canManage: access.actions.has("manage"),
        };
      }),
    );
  });
}

export function POST(request: Request) {
  return withApi(request, "write", async () => {
    const { project, note } = params(request);
    const input = await body(request);
    switch (input.action) {
      case "create": {
        if (!note) throw new ApiError(400, "Send ?note=<id>.");
        const anchor = anchorFrom(input.anchor);
        if (anchor === undefined) throw new ApiError(400, "Invalid comment position.");
        const quote = typeof input.quote === "string" ? input.quote : null;
        return json(await createCommentThread(project, note, { anchor, quote, body: text(input.body, "body") }));
      }
      case "reply":
        await replyToThread(project, text(input.threadId, "threadId"), text(input.body, "body"));
        return json({ ok: true });
      case "resolve":
        if (typeof input.resolved !== "boolean") throw new ApiError(400, "Send resolved: true or false.");
        await setThreadResolved(project, text(input.threadId, "threadId"), input.resolved);
        return json({ ok: true });
      case "edit":
        await editComment(project, text(input.commentId, "commentId"), text(input.body, "body"));
        return json({ ok: true });
      case "delete": {
        const { undo } = await deleteComment(project, text(input.commentId, "commentId"));
        return json({ ok: true, undo });
      }
      case "restore":
        await restoreComment(project, text(input.undo, "undo"));
        return json({ ok: true });
      default:
        throw new ApiError(400, "Send an action: create, reply, resolve, edit, delete or restore.");
    }
  });
}
