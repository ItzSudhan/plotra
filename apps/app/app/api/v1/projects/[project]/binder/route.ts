import { apiBinderOptions } from "@/lib/api/binder";
import { json, withApi } from "@/lib/api/handler";

type Context = { params: Promise<{ project: string }> };

// GET /api/v1/projects/<id>/binder: the kinds of note it can make (in its own words), its world page types, statuses and labels.
export async function GET(request: Request, { params }: Context) {
  const { project } = await params;
  return withApi(request, "read", async () => json(await apiBinderOptions(project)));
}
