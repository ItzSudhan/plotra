import { ApiError, body, json, withApi } from "@/lib/api/handler";
import { setSceneThread } from "@/lib/story-actions";

type Context = { params: Promise<{ project: string }> };

// PUT /api/mobile/views/<project>/cells { nodeId, threadId, note }: a plot grid
// cell. An empty note keeps the scene in the thread; null takes it out.
export async function PUT(request: Request, { params }: Context) {
  const { project } = await params;
  return withApi(request, "write", async () => {
    const { nodeId, threadId, note } = await body<{ nodeId?: unknown; threadId?: unknown; note?: unknown }>(request);
    if (typeof nodeId !== "string" || typeof threadId !== "string" || (typeof note !== "string" && note !== null)) throw new ApiError(400, "Send nodeId, threadId and note (text, or null).");
    await setSceneThread(project, nodeId, threadId, note);
    return json({ ok: true });
  });
}
