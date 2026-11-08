import { ApiError, json, read, withApi } from "@/lib/api/handler";
import { getProjectLinks } from "@/lib/knowledge-actions";

// GET /api/mobile/maps/links?project=<id>: every link between notes the caller
// can see, for the phone's graph (the web's graph-view.tsx reads the same).
export function GET(request: Request) {
  const project = new URL(request.url).searchParams.get("project");
  return withApi(request, "read", async () => {
    if (!project) throw new ApiError(400, "Say which project: ?project=<id>.");
    return json({ links: await read(() => getProjectLinks(project)) });
  });
}
