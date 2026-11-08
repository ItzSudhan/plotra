import { moveApiNote } from "@/lib/api/binder";
import type { MoveTo } from "@/lib/api/binder-place";
import { body, json, withApi } from "@/lib/api/handler";

type Context = { params: Promise<{ project: string; note: string }> };

// POST /api/v1/projects/<id>/notes/<id>/move: { step: "up"|"down"|"in"|"out" },
// or { parentId } (null: the top level) to go at the end of a folder, or { before | after: <note id> }.
export async function POST(request: Request, { params }: Context) {
  const { project, note } = await params;
  return withApi(request, "write", async () => json({ note: await moveApiNote(project, note, await body<MoveTo>(request)) }));
}
