import { body, json, withApi } from "@/lib/api/handler";
import { readApiNote, updateApiNote, type NotePatch } from "@/lib/api/notes";

type Context = { params: Promise<{ project: string; note: string }> };

// GET   /api/v1/projects/<id>/notes/<id>: the note, its text as Markdown.
// PATCH /api/v1/projects/<id>/notes/<id>: { title?, synopsis?, tags?, aliases?, status? }.
export async function GET(request: Request, { params }: Context) {
  const { project, note } = await params;
  return withApi(request, "read", async () => json({ note: await readApiNote(project, note) }));
}

export async function PATCH(request: Request, { params }: Context) {
  const { project, note } = await params;
  return withApi(request, "write", async () => json({ note: await updateApiNote(project, note, await body<NotePatch>(request)) }));
}
