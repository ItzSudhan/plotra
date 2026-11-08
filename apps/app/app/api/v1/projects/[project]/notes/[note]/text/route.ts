import { body, json, withApi } from "@/lib/api/handler";
import { writeApiNoteText, type TextChange } from "@/lib/api/notes";

type Context = { params: Promise<{ project: string; note: string }> };

// POST /api/v1/projects/<id>/notes/<id>/text: { mode: "append" | "replace" | "update", markdown, suggest? }.
// Goes through the live document, so people with the note open see it at once.
export async function POST(request: Request, { params }: Context) {
  const { project, note } = await params;
  return withApi(request, "write", async () => json(await writeApiNoteText(project, note, await body<TextChange>(request))));
}
