import { body, json, withApi } from "@/lib/api/handler";
import { setMobileProperties } from "@/lib/api/mobile-views";

type Context = { params: Promise<{ project: string; note: string }> };

// PATCH /api/mobile/views/<project>/notes/<note>/properties { key: value | null }: sets a note's fields (Story date, POV, a world page's fields…).
export async function PATCH(request: Request, { params }: Context) {
  const { project, note } = await params;
  return withApi(request, "write", async () => json({ node: await setMobileProperties(project, note, await body(request)) }));
}
