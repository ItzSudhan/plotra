import { ApiError, json, withApi } from "@/lib/api/handler";
import { readMobileVersion } from "@/lib/api/mobile-history";

// GET /api/mobile/history/version?project=&version=: { value }, a saved
// version's document for the phone's reader. Null for boards (canvases,
// dialogues), which are looked at on the web.
export function GET(request: Request) {
  return withApi(request, "read", async () => {
    const url = new URL(request.url);
    const project = url.searchParams.get("project");
    const version = url.searchParams.get("version");
    if (!project || !version) throw new ApiError(400, "Send ?project=<id>&version=<id>.");
    return json(await readMobileVersion(project, version));
  });
}
