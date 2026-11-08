import { ApiError, json, withApi } from "@/lib/api/handler";
import { searchAllApiNotes } from "@/lib/api/notes";

// GET /api/v1/search?q=…&limit=40: notes in every project you can open that match the words, best first.
export function GET(request: Request) {
  return withApi(request, "read", async () => {
    const url = new URL(request.url);
    const q = url.searchParams.get("q") ?? "";
    if (!q.trim()) throw new ApiError(400, "Add ?q= with what to look for.");
    const limit = Number(url.searchParams.get("limit") ?? 40);
    return json({ hits: await searchAllApiNotes(q, Number.isFinite(limit) ? limit : 40) });
  });
}
