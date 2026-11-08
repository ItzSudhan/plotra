import { ApiError, json, withApi } from "@/lib/api/handler";
import { readApiNoteValue } from "@/lib/api/mobile-reader";

// GET /api/mobile/note-value?project=&note=[&asOf=<release>]: a note's document
// (its Plate value), for the phone's reader to draw with full formatting
// (lib/api/mobile-reader.ts). `value` is null for boards, which have no text.
// With asOf, passages the audience doesn't know by then are left out.
export function GET(request: Request) {
  return withApi(request, "read", async () => {
    const url = new URL(request.url);
    const project = url.searchParams.get("project");
    const note = url.searchParams.get("note");
    if (!project || !note) throw new ApiError(400, "Send ?project=<id>&note=<id>.");
    return json(await readApiNoteValue(project, note, url.searchParams.get("asOf")));
  });
}
