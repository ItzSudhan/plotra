import { ApiError, json, withApi } from "@/lib/api/handler";
import { searchApiNotes } from "@/lib/api/notes";

type Context = { params: Promise<{ project: string }> };

// GET /api/v1/projects/<id>/search?q=…&limit=20: notes matching the words, best first.
export async function GET(request: Request, { params }: Context) {
  const { project } = await params;
  return withApi(request, "read", async () => {
    const url = new URL(request.url);
    const q = url.searchParams.get("q") ?? "";
    if (!q.trim()) throw new ApiError(400, "Add ?q= with what to look for.");
    const limit = Number(url.searchParams.get("limit") ?? 20);
    return json({ hits: await searchApiNotes(project, q, Number.isFinite(limit) ? limit : 20) });
  });
}
