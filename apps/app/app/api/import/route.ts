import { accessFailure, fail, isOwnRequest, readLimited } from "@/app/api/files/store";
import { track } from "@/lib/analytics";
import { getSession } from "@/lib/data";
import { publicMessage } from "@/lib/errors";
import { assertCanImport, createImported, type PendingPicture } from "@/lib/io/import";
import { importPlotraFile, MAX_PLOTRA_BYTES, type ImportedProject } from "@/lib/io/plotra-file";
import { discardPlotraUpload, readPlotraUploadToken, takePlotraUpload, type PlotraUploadClaims } from "@/lib/io/plotra-upload";
import { functionBodyCap } from "@/lib/quotas";
import { gunzipCapped, MAX_IMPORT_BYTES, MAX_IMPORT_FILES, MAX_UNPACKED_IMPORT_BYTES, planUpload, type UploadedFile } from "@/lib/io/upload";
import { extras, summarize, type ImportOptions, type ImportPreview } from "@/lib/io/outline";
import { rateLimit } from "@/lib/rate-limit";
import { encode } from "@/lib/read-codec";
import { readOnly, transaction } from "@/lib/request-cache";

// POST /api/import?project=<id>[&parent=<nodeId>]&split=file|headings[&breaks=1][&kind=scene|note][&lines=keep][&preview=1]
// The body is a multipart form with one or more `file` fields: Markdown, DOCX,
// RTF or plain text (plan.md 2.7); or a project from another app, read whole: a
// Scrivener project's binder and text (lib/io/scrivener.ts), a Plottr file
// (lib/io/plottr.ts), or a World Anvil export's articles (lib/io/worldanvil.ts),
// which the dialog picks out of a folder or a zip and sends gzipped. When a folder is uploaded (an Obsidian vault),
// each file comes with a `path` field, in the same order, saying where in the
// folder it was; the folders are created too. A vault's pictures aren't sent: only their
// paths, as `picture` fields, so a note's `![[map.png]]` can be told where its picture is
// (lib/io/vault-pictures.ts). The files are read here, on the server, and their notes
// created in one transaction; the answer is the new binder nodes, and the pictures the
// notes show, for the dialog to upload (`{ nodes, pictures }`).
// With `preview=1` nothing is created: the answer says what would be.
//
// POST /api/import?format=plotra&workspace=<slug>
// The body is a `.plotra` file (lib/io/plotra-file.ts), as it is, or, as JSON,
// `{ token }` for one sent straight to object storage (/api/import/direct). It becomes a
// new project in the workspace (and a new world beside it, when it carries
// one); the answer is where to open it.
//
// Carries the same `x-plotra-request` header as file uploads (app/api/files/store.ts),
// which a page on another site can't send.

const PREVIEW_ENTRIES = 200;
const MAX_DEPTH = 12;

/** The folders of a path a browser sent (`Vault/Places/Verona.md`), as names a binder can hold. */
const foldersOf = (path: string) =>
  path
    .split(/[/\\]/)
    .slice(0, -1)
    .map((name) => name.replace(/\s+/g, " ").trim().slice(0, 200))
    .filter((name) => name && name !== "." && name !== "..")
    .slice(0, MAX_DEPTH);

export async function POST(request: Request) {
  if (!isOwnRequest(request)) return fail(403, "Forbidden.");
  const session = await getSession();
  if (!session) return fail(401, "Sign in first.");
  const params = new URL(request.url).searchParams;
  if (params.get("format") === "plotra") return importProjectFile(request, session.user.id, params.get("workspace") ?? "");
  const projectId = params.get("project") ?? "";
  const parentId = params.get("parent") || null;
  const preview = params.get("preview") === "1";
  if (!projectId) return fail(400, "Which project is this for?");
  const options: ImportOptions = {
    split: params.get("split") === "headings" ? "headings" : "file",
    breaks: params.get("breaks") === "1",
    kind: params.get("kind") === "note" ? "note" : "scene",
    lines: params.get("lines") === "keep" ? "keep" : "wrap",
  };

  // Before reading a byte: nobody without edit access gets to upload megabytes.
  let workspaceId: string;
  try {
    workspaceId = (await readOnly(() => assertCanImport(projectId, parentId))).organizationId;
  } catch (error) {
    return accessFailure(error);
  }
  // Parsing a manuscript is real work, so both the preview and the import are limited per person.
  try {
    if (preview) await rateLimit("import-preview", session.user.id, { limit: 120, windowSeconds: 600 });
    else await rateLimit("import", session.user.id, { limit: 30, windowSeconds: 600 });
  } catch (error) {
    return fail(429, publicMessage(error, "Try again in a few minutes."));
  }

  const megabytes = Math.round(MAX_IMPORT_BYTES / (1024 * 1024));
  const tooLarge = () => fail(413, `An import can be up to ${megabytes} MB. Import it in parts.`);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) return fail(400, "That upload couldn't be read.");
  // A form is parsed whole, so its declared size has to be known and within bounds first.
  const declared = Number(request.headers.get("content-length") ?? NaN);
  if (!Number.isFinite(declared)) return fail(411, "The upload didn't say how large it is.");
  if (declared > MAX_IMPORT_BYTES + 256 * 1024) return tooLarge();

  let files: UploadedFile[];
  let pictures: string[] = [];
  try {
    const form = await request.formData();
    // Folder names cleaned as the notes' are, so a picture's path and a note's folder agree.
    pictures = form
      .getAll("picture")
      .filter((path): path is string => typeof path === "string" && path.length < 1000)
      .slice(0, MAX_IMPORT_FILES)
      .map((path) => [...foldersOf(path), path.split(/[/\\]/).at(-1)!.slice(0, 200)].join("/"));
    const entries = form.getAll("file").filter((entry): entry is File => entry instanceof File);
    const sent = form.getAll("path");
    // Only when every file has one: a path that belongs to another file would put a note in the wrong folder.
    const paths = sent.length === entries.length && sent.every((path) => typeof path === "string") ? (sent as string[]) : null;
    if (!entries.length) return fail(400, "No file in the upload.");
    if (entries.length > MAX_IMPORT_FILES) return fail(400, `Import up to ${MAX_IMPORT_FILES} files at a time.`);
    if (entries.reduce((sum, file) => sum + file.size, 0) > MAX_IMPORT_BYTES) return tooLarge();
    files = await Promise.all(
      entries.map(async (file, i) => ({
        name: file.name.split(/[/\\]/).at(-1)!.slice(0, 200),
        bytes: new Uint8Array(await file.arrayBuffer()),
        ...(paths && { folder: foldersOf(paths[i]) }),
      })),
    );
  } catch {
    return fail(400, "That upload couldn't be read.");
  }
  // A Scrivener project's text arrives gzipped (components/io/import-dialog.tsx). What it says it
  // unpacks to (a gzip's last four bytes) is checked first, all files together, to answer clearly;
  // unpacking itself stops at what's left of the limit, whatever a gzip claims.
  const packed = files.filter((file) => file.name.endsWith(".gz"));
  if (packed.length) {
    const unpacked = packed.reduce((sum, file) => sum + (file.bytes.length >= 4 ? new DataView(file.bytes.buffer, file.bytes.byteOffset + file.bytes.length - 4).getUint32(0, true) : 0), 0);
    if (unpacked > MAX_UNPACKED_IMPORT_BYTES) return fail(413, `That project's text is over ${MAX_UNPACKED_IMPORT_BYTES / 1024 / 1024} MB. Import it in parts.`);
    let left = MAX_UNPACKED_IMPORT_BYTES;
    try {
      files = files.map((file) => {
        if (!file.name.endsWith(".gz")) return file;
        const bytes = gunzipCapped(file.bytes, left);
        left -= bytes.length;
        return { ...file, name: file.name.slice(0, -3), bytes };
      });
    } catch (error) {
      return error instanceof Error && error.message.includes("too large") ? fail(413, "That upload is too large to import.") : fail(400, "That upload couldn't be read.");
    }
  }

  try {
    const { outline, leftOut, format, threads } = await planUpload(files, options, pictures);
    if (preview) {
      const { pictures: shows, properties } = extras(outline);
      const body: ImportPreview = {
        summary: summarize(outline),
        ...(shows > 0 && { pictures: shows }),
        ...(properties > 0 && { properties }),
        ...(leftOut > 0 && { leftOut }),
        ...(["scrivener", "plottr", "worldanvil"].includes(format) && { format }),
        ...(threads.length > 0 && { threads: threads.length }),
        entries: outline.slice(0, PREVIEW_ENTRIES).map(({ parent, kind, title }) => ({ parent, kind, title })),
      };
      return Response.json(body, { headers: { "cache-control": "no-store" } });
    }
    let shown: PendingPicture[] = [];
    const created = await transaction(() => createImported(projectId, parentId, outline, threads, { onPictures: (found) => (shown = found) }));
    // Which formats come in and how much; never a title or a word of it.
    await track("imported", {
      userId: session.user.id,
      workspaceId,
      projectId,
      properties: { format, files: files.length, notes: created.length, split: ["scrivener", "plottr", "worldanvil"].includes(format) ? "project" : options.split },
    });
    return new Response(encode({ nodes: created, pictures: shown }), { status: 201, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  } catch (error) {
    // Access lost in between shows as it would for any other request; the rest is something about the files.
    const denied = accessFailure(error);
    return denied.status === 404 ? denied : fail(400, publicMessage(error, "The import failed."));
  }
}

/** A `.plotra` file in, as a new project. */
async function importProjectFile(request: Request, userId: string, workspaceSlug: string) {
  if (!workspaceSlug) return fail(400, "Which workspace is this for?");
  // Sent straight to object storage first (lib/io/plotra-upload.ts): the body is just its token.
  let claims: PlotraUploadClaims | null = null;
  if (request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    let token: unknown;
    try {
      ({ token } = await request.json());
    } catch {
      return fail(400, "That request couldn't be read.");
    }
    // Only the person who uploaded it, into the workspace they said, and only while it's fresh.
    claims = typeof token === "string" ? readPlotraUploadToken(token, userId, workspaceSlug) : null;
    if (!claims) return fail(400, "That upload has expired. Try again.");
  }
  try {
    await rateLimit("import-project", userId, { limit: 10, windowSeconds: 600 });
  } catch (error) {
    // The uploaded file isn't kept for a later try: the next one sends it again.
    if (claims) await discardPlotraUpload(claims);
    return fail(429, publicMessage(error, "Try again in a few minutes."));
  }
  if (claims) {
    const upload = claims;
    return createFromFile(userId, workspaceSlug, (run) => takePlotraUpload(upload, run));
  }
  const limit = Math.min(MAX_PLOTRA_BYTES, functionBodyCap());
  const bytes = await readLimited(request, limit).catch(() => null);
  if (!bytes) return fail(413, `A project file can be up to ${Math.floor(limit / (1024 * 1024))} MB here.`);
  if (!bytes.length) return fail(400, "No file in the upload.");
  return createFromFile(userId, workspaceSlug, (run) => run(bytes));
}

/** Imports the file's bytes, however they arrived, and answers where the new project is. */
async function createFromFile(userId: string, workspaceSlug: string, withBytes: (run: (bytes: Uint8Array) => Promise<ImportedProject>) => Promise<ImportedProject>) {
  try {
    const created = await withBytes((bytes) => transaction(() => importPlotraFile(workspaceSlug, bytes)));
    await track("project_created", { userId, workspaceId: created.workspaceId, projectId: created.projectId, properties: { from: "plotra", world: created.worldId !== null } });
    return Response.json({ href: created.href, notes: created.notes }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    const denied = accessFailure(error);
    return denied.status === 404 ? denied : fail(400, publicMessage(error, "The import failed."));
  }
}
