import { body, json, withApi } from "@/lib/api/handler";
import { deleteThread, updateThread } from "@/lib/story-actions";

type Context = { params: Promise<{ project: string; thread: string }> };

// PATCH  /api/mobile/views/<project>/threads/<thread> { name?, color?, closedNodeId? }: renames, recolours, resolves (null reopens).
// DELETE /api/mobile/views/<project>/threads/<thread>: deletes it and its cells.
export async function PATCH(request: Request, { params }: Context) {
  const { project, thread } = await params;
  return withApi(request, "write", async () => {
    const { name, color, closedNodeId } = await body<{ name?: unknown; color?: unknown; closedNodeId?: unknown }>(request);
    return json({
      thread: await updateThread(project, thread, {
        ...(typeof name === "string" && { name }),
        ...(typeof color === "string" && { color }),
        ...((typeof closedNodeId === "string" || closedNodeId === null) && { closedNodeId }),
      }),
    });
  });
}

export async function DELETE(request: Request, { params }: Context) {
  const { project, thread } = await params;
  return withApi(request, "write", async () => {
    await deleteThread(project, thread);
    return json({ ok: true });
  });
}
