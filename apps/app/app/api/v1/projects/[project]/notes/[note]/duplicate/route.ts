import { duplicateApiNote } from "@/lib/api/binder";
import { json, withApi } from "@/lib/api/handler";

type Context = { params: Promise<{ project: string; note: string }> };

// POST /api/v1/projects/<id>/notes/<id>/duplicate: a copy of it and what's inside it, just after it. The copy comes first.
export async function POST(request: Request, { params }: Context) {
  const { project, note } = await params;
  return withApi(request, "write", async () => json({ notes: await duplicateApiNote(project, note) }, 201));
}
