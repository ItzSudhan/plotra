import { ApiError, body, json, withApi } from "@/lib/api/handler";
import { changeBoard, parseBoardChange, readBoard } from "../rooms";

// GET  /api/mobile/maps/board?project=<id>&note=<id>: { board: { map, cards, edges, marks } }, as it is live.
// POST /api/mobile/maps/board { project, note, action, … }: move { id, x, y }, add-text { text, x, y },
//   set-text { id, text }. Made in the board's live room. { id }: the card's.

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const project = params.get("project");
  const note = params.get("note");
  return withApi(request, "read", async () => {
    if (!project || !note) throw new ApiError(400, "Say which board: ?project=<id>&note=<id>.");
    return json({ board: await readBoard(project, note) });
  });
}

export function POST(request: Request) {
  return withApi(request, "write", async () => {
    const input = await body(request);
    if (typeof input.project !== "string" || typeof input.note !== "string") throw new ApiError(400, "Send project and note.");
    return json(await changeBoard(input.project, input.note, parseBoardChange(input)));
  });
}
