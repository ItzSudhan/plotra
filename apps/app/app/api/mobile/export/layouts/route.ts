import { json, withApi } from "@/lib/api/handler";
import { compilePapers, compilePresets } from "@/lib/io/compile";

// GET /api/mobile/export/layouts: the layouts Word, RTF, plain text and PDF can
// be set in (lib/io/compile.ts), so the phone offers the web's own choices.
export function GET(request: Request) {
  return withApi(request, "read", async () =>
    json({
      presets: compilePresets.map((p) => ({ id: p.id, title: p.title, description: p.description, options: p.options })),
      papers: Object.entries(compilePapers).map(([id, label]) => ({ id, label })),
    }),
  );
}
