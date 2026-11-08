import { unstable_rethrow } from "next/navigation";
import { requireProjectAccess } from "@/lib/access";
import { track } from "@/lib/analytics";
import { requireSession } from "@/lib/data";
import { publicMessage } from "@/lib/errors";
import { cleanCompile } from "@/lib/io/compile";
import { buildAo3, buildAo3File, buildExport, buildOpml, exportFormats, isExportFormat } from "@/lib/io/export";
import { buildPlotraFile } from "@/lib/io/plotra-file";
import { buildBible } from "@/lib/publish/bible";
import { collect } from "@/lib/publish/collect";
import { buildEpub } from "@/lib/publish/epub";
import { buildWiki } from "@/lib/publish/wiki";
import { readOnly } from "@/lib/request-cache";

// GET /api/export?project=<id>&format=epub|wiki|bible|markdown|docx|rtf|txt|fdx|ao3|opml|plotra[&root=<nodeId>][&horizon=<releaseId>][&canon=1][&layout=single|files][&compile=<json>][&cover=<fileId>][&as=json]
// `ao3` is the manuscript in chapters for Archive of Our Own (lib/io/ao3.ts): a
// zip, or with `as=json` the chapters themselves, for the export dialog's list.
// `compile` is the compile settings (lib/io/compile.ts) for Word, RTF and plain
// text; `cover` an image attached in the project, for an EPUB's cover.
// Builds a publishing output (plan.md 2.8) or a plain export of the text
// (plan.md 2.7: Markdown, DOCX, plain text) from what the signed-in user can
// read and sends it as a download. `layout=files` makes Markdown a zip of files
// mirroring the binder. `plotra` is the whole project, its world, history and
// files included, for another Plotra to import (lib/io/plotra-file.ts); the
// other options don't apply to it. Reading is all it takes, and no quota is checked:
// export always works (plan.md 8.1).

/** Compile settings from the query: JSON, cleaned; standard manuscript format when missing or unreadable. */
function compileFrom(raw: string | null) {
  if (!raw || raw.length > 2000) return cleanCompile(null);
  try {
    return cleanCompile(JSON.parse(raw));
  } catch {
    return cleanCompile(null);
  }
}

const formats = {
  epub: { type: "application/epub+zip" },
  wiki: { type: "application/zip" },
  bible: { type: "text/html; charset=utf-8" },
  plotra: { type: "application/zip" },
  ao3: { type: "application/zip" },
  opml: { type: "text/x-opml; charset=utf-8" },
  ...exportFormats,
} as const;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const projectId = params.get("project") ?? "";
  const format = params.get("format") ?? "";
  if (!projectId || !Object.hasOwn(formats, format)) return new Response("Not found", { status: 404 });

  try {
    const file = await readOnly(async () => {
      const { user } = await requireSession();
      const { project } = await requireProjectAccess(projectId);
      if (format === "plotra") {
        const file = await buildPlotraFile(projectId);
        await track("exported", { userId: user.id, workspaceId: project.organizationId, projectId, properties: { format, scope: "project" } });
        return file;
      }
      const collected = await collect(projectId, {
        rootId: params.get("root") || null,
        horizonId: params.get("horizon") || null,
        canonOnly: params.get("canon") === "1",
      });
      if (format === "opml") {
        const built = buildOpml(collected);
        await track("exported", { userId: user.id, workspaceId: project.organizationId, projectId, properties: { format, scope: collected.root ? "folder" : "project" } });
        return built;
      }
      if (format === "ao3") {
        const built = params.get("as") === "json" ? { json: await buildAo3(collected) } : await buildAo3File(collected);
        await track("exported", { userId: user.id, workspaceId: project.organizationId, projectId, properties: { format, scope: collected.root ? "folder" : "project" } });
        return built;
      }
      const built = isExportFormat(format)
        ? await buildExport(collected, format, params.get("layout") === "files" ? "files" : "single", user.email, compileFrom(params.get("compile")))
        : await (format === "epub" ? buildEpub(collected, { coverFileId: /^[0-9a-f-]{36}$/i.test(params.get("cover") ?? "") ? params.get("cover") : null }) : format === "wiki" ? buildWiki(collected) : buildBible(collected));
      // Which formats people take their work out in; never what was in it.
      await track("exported", { userId: user.id, workspaceId: project.organizationId, projectId, properties: { format, scope: collected.root ? "folder" : "project" } });
      return built;
    });
    if ("json" in file) return Response.json(file.json, { headers: { "cache-control": "no-store" } });
    const body = typeof file.data === "string" ? file.data : Buffer.from(file.data);
    return new Response(body, {
      headers: {
        // A Markdown export "as files" is a zip, so the built file's own type wins.
        "content-type": "type" in file ? file.type : formats[format as keyof typeof formats].type,
        // ASCII file names only (see fileSlug), so no encoding games are needed.
        "content-disposition": `attachment; filename="${file.name}"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    // notFound() and redirect() (no access, signed out) become a plain 404.
    try {
      unstable_rethrow(error);
    } catch {
      return new Response("Not found", { status: 404 });
    }
    return new Response(publicMessage(error), { status: 400 });
  }
}
