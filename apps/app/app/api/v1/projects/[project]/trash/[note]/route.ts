import { deleteApiNote, restoreApiNote } from "@/lib/api/binder";
import { json, withApi } from "@/lib/api/handler";

type Context = { params: Promise<{ project: string; note: string }> };

// POST   /api/v1/projects/<id>/trash/<id>: puts it back (at the top level if its folder is still in the trash).
// DELETE /api/v1/projects/<id>/trash/<id>: deletes it, and what's inside it, for good.
export async function POST(request: Request, { params }: Context) {
  const { project, note } = await params;
  return withApi(request, "write", async () => json({ note: await restoreApiNote(project, note) }));
}

export async function DELETE(request: Request, { params }: Context) {
  const { project, note } = await params;
  return withApi(request, "write", async () => {
    await deleteApiNote(project, note);
    return json({ ok: true });
  });
}
