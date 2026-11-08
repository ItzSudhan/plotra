import { emptyApiTrash, listApiTrash } from "@/lib/api/binder";
import { json, withApi } from "@/lib/api/handler";

type Context = { params: Promise<{ project: string }> };

// GET    /api/v1/projects/<id>/trash: what's in the trash, the latest first, with when and by whom.
// DELETE /api/v1/projects/<id>/trash: empties it, for good.
export async function GET(request: Request, { params }: Context) {
  const { project } = await params;
  return withApi(request, "read", async () => json(await listApiTrash(project)));
}

export async function DELETE(request: Request, { params }: Context) {
  const { project } = await params;
  return withApi(request, "write", async () => json({ deleted: await emptyApiTrash(project) }));
}
