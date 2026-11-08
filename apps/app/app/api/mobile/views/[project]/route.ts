import { json, withApi } from "@/lib/api/handler";
import { getMobileViews } from "@/lib/api/mobile-views";

type Context = { params: Promise<{ project: string }> };

// GET /api/mobile/views/<project>: what the phone's timeline, corkboard, plot
// grid and codex draw from: notes with their fields, plot threads and cells,
// calendars, field definitions and world-bible types (lib/api/mobile-views.ts).
export async function GET(request: Request, { params }: Context) {
  const { project } = await params;
  return withApi(request, "read", async () => json(await getMobileViews(project)));
}
