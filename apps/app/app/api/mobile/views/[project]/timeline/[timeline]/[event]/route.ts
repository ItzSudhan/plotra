import { body, json, withApi } from "@/lib/api/handler";
import { deleteTimelineEvent, updateTimelineEvent } from "@/lib/story-actions";

type Context = { params: Promise<{ project: string; timeline: string; event: string }> };

type EventPatch = { title?: string; description?: string | null; start?: number; end?: number | null; lane?: string | null; color?: string | null; nodeId?: string | null };

// PATCH  /api/mobile/views/<project>/timeline/<timeline>/<event>: changes an event.
// DELETE /api/mobile/views/<project>/timeline/<timeline>/<event>: deletes it.
export async function PATCH(request: Request, { params }: Context) {
  const { project, timeline, event } = await params;
  return withApi(request, "write", async () => json({ event: await updateTimelineEvent(project, timeline, event, await body<EventPatch>(request)) }));
}

export async function DELETE(request: Request, { params }: Context) {
  const { project, timeline, event } = await params;
  return withApi(request, "write", async () => {
    await deleteTimelineEvent(project, timeline, event);
    return json({ ok: true });
  });
}
