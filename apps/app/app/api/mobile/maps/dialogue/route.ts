import { ApiError, json, withApi } from "@/lib/api/handler";
import { readDialogue } from "../rooms";

// GET /api/mobile/maps/dialogue?project=<id>&note=<id>: { dialogue: { nodes, edges, variables } }, as it is live.
export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const project = params.get("project");
  const note = params.get("note");
  return withApi(request, "read", async () => {
    if (!project || !note) throw new ApiError(400, "Say which dialogue: ?project=<id>&note=<id>.");
    return json({ dialogue: await readDialogue(project, note) });
  });
}
