import { body, json, withApi } from "@/lib/api/handler";
import { createApiNote, listApiNotes, type NewNote } from "@/lib/api/notes";

type Context = { params: Promise<{ project: string }> };

// GET  /api/v1/projects/<id>/notes: the project's notes in binder order.
// POST /api/v1/projects/<id>/notes: { title, kind?, parentId?, markdown?, tags?, synopsis? } makes one.
export async function GET(request: Request, { params }: Context) {
  const { project } = await params;
  return withApi(request, "read", async () => json({ notes: await listApiNotes(project) }));
}

export async function POST(request: Request, { params }: Context) {
  const { project } = await params;
  return withApi(request, "write", async () => json({ note: await createApiNote(project, await body<NewNote>(request)) }, 201));
}
