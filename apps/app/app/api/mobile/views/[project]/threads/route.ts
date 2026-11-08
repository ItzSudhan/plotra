import { body, json, withApi } from "@/lib/api/handler";
import { createThread } from "@/lib/story-actions";

type Context = { params: Promise<{ project: string }> };

// POST /api/mobile/views/<project>/threads { name?, color? }: adds a plot thread at the end.
export async function POST(request: Request, { params }: Context) {
  const { project } = await params;
  return withApi(request, "write", async () => {
    const { name, color } = await body<{ name?: unknown; color?: unknown }>(request);
    return json({ thread: await createThread(project, { name: typeof name === "string" ? name : undefined, color: typeof color === "string" ? color : undefined }) }, 201);
  });
}
