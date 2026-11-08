import { json, withApi } from "@/lib/api/handler";
import { listApiReleases } from "@/lib/api/notes";

type Context = { params: Promise<{ project: string }> };

// GET /api/v1/projects/<id>/releases: the project's books, episodes or sessions, in shipping order.
export async function GET(request: Request, { params }: Context) {
  const { project } = await params;
  return withApi(request, "read", async () => json({ releases: await listApiReleases(project) }));
}
