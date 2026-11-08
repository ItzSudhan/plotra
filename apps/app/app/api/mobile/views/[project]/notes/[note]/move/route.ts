import { ApiError, body, json, withApi } from "@/lib/api/handler";
import { moveMobileNote } from "@/lib/api/mobile-views";

type Context = { params: Promise<{ project: string; note: string }> };

// POST /api/mobile/views/<project>/notes/<note>/move { afterId }: reorders a
// corkboard card among its siblings: after `afterId`, or first when it's null.
export async function POST(request: Request, { params }: Context) {
  const { project, note } = await params;
  return withApi(request, "write", async () => {
    const { afterId } = await body<{ afterId?: unknown }>(request);
    if (typeof afterId !== "string" && afterId !== null) throw new ApiError(400, "Send afterId: the card to go after, or null for first.");
    return json({ node: await moveMobileNote(project, note, afterId) });
  });
}
