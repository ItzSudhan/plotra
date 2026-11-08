import { body, json, withApi } from "@/lib/api/handler";
import { readApiNote, trashApiNote, updateApiNote, type NotePatch } from "@/lib/api/notes";

type Context = { params: Promise<{ project: string; note: string }> };

// GET   /api/v1/projects/<id>/notes/<id>: the note, its text as Markdown. ?asOf=<release> leaves out what isn't revealed by then.
// PATCH /api/v1/projects/<id>/notes/<id>: { title?, synopsis?, tags?, aliases?, status? }.
// DELETE /api/v1/projects/<id>/notes/<id>: moves it, and what's inside it, to the trash.
export async function GET(request: Request, { params }: Context) {
  const { project, note } = await params;
  const asOf = new URL(request.url).searchParams.get("asOf");
  return withApi(request, "read", async () => json({ note: await readApiNote(project, note, asOf) }));
}

export async function PATCH(request: Request, { params }: Context) {
  const { project, note } = await params;
  return withApi(request, "write", async () => json({ note: await updateApiNote(project, note, await body<NotePatch>(request)) }));
}

export async function DELETE(request: Request, { params }: Context) {
  const { project, note } = await params;
  return withApi(request, "write", async () => json({ note: await trashApiNote(project, note) }));
}
