import { readApiNoteDetails, updateApiNoteDetails, type DetailsPatch } from "@/lib/api/binder";
import { body, json, withApi } from "@/lib/api/handler";

type Context = { params: Promise<{ project: string; note: string }> };

// GET   /api/v1/projects/<id>/notes/<id>/details: its custom fields and their values, canon, reveal, label and the choices for each.
// PATCH /api/v1/projects/<id>/notes/<id>/details: { properties?, canon?, canonReason?, canonReleaseId?, reveal?, label?, entityTypeId? }.
export async function GET(request: Request, { params }: Context) {
  const { project, note } = await params;
  return withApi(request, "read", async () => json({ details: await readApiNoteDetails(project, note) }));
}

export async function PATCH(request: Request, { params }: Context) {
  const { project, note } = await params;
  return withApi(request, "write", async () => json({ details: await updateApiNoteDetails(project, note, await body<DetailsPatch>(request)) }));
}
