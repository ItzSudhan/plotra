import { json, withApi } from "@/lib/api/handler";
import { getMobileBacklinks } from "@/lib/api/mobile-views";

type Context = { params: Promise<{ project: string; note: string }> };

// GET /api/mobile/views/<project>/notes/<note>/links: the notes that link to it ("Mentioned in").
export async function GET(request: Request, { params }: Context) {
  const { project, note } = await params;
  return withApi(request, "read", async () => json({ backlinks: await getMobileBacklinks(project, note) }));
}
