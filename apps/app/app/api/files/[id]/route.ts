import { deleteAttachment } from "@/lib/research-actions";
import { accessFailure, fail, findAttachment, isOwnRequest, loadAttachment, signedIn } from "../store";

type Context = { params: Promise<{ id: string }> };

/** Types a browser may show in place. Everything else is only ever downloaded. */
const inlineTypes = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "application/pdf"]);
/** Types that can run script when opened from this origin: never served as themselves. */
const active = /html|xml|svg|script|css/;

/** `filename="…"` for old clients plus the UTF-8 form for everyone else. */
function disposition(kind: "inline" | "attachment", name: string) {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}

// GET /api/files/<id>: the file, for anyone who can read the note it's attached
// to. Images and PDFs open in the browser; anything else downloads, and nothing
// that could run as a page on this origin (HTML, SVG) is ever served as one.
// `?download=1` always downloads.
export async function GET(request: Request, { params }: Context) {
  if (!(await signedIn())) return fail(401, "Sign in first.");
  const { id } = await params;
  let file: Awaited<ReturnType<typeof loadAttachment>>;
  try {
    file = await loadAttachment(id);
  } catch (error) {
    return accessFailure(error);
  }
  if (!file) return fail(404, "Not found.");

  const inline = inlineTypes.has(file.contentType) && !new URL(request.url).searchParams.has("download");
  const contentType = inlineTypes.has(file.contentType) ? file.contentType : active.test(file.contentType) ? "application/octet-stream" : file.contentType;
  return new Response(Buffer.from(file.bytes), {
    headers: {
      "content-type": contentType,
      "content-length": String(file.bytes.length),
      "content-disposition": disposition(inline ? "inline" : "attachment", file.name),
      // The type above is the last word: no guessing a page out of a text file.
      "x-content-type-options": "nosniff",
      // Belt and braces: even if a browser did render it, nothing in it may load or run. (A PDF viewer needs to.)
      ...(file.contentType !== "application/pdf" && { "content-security-policy": "default-src 'none'; sandbox" }),
      // Other sites can't embed a member's files with their cookies.
      "cross-origin-resource-policy": "same-origin",
      // A file never changes; access to it can, so it's only kept briefly and only by this browser.
      "cache-control": "private, max-age=600",
    },
  });
}

// DELETE /api/files/<id>: removes the file. Needs `edit` on its note.
export async function DELETE(request: Request, { params }: Context) {
  if (!isOwnRequest(request)) return fail(403, "Forbidden.");
  if (!(await signedIn())) return fail(401, "Sign in first.");
  const { id } = await params;
  try {
    const row = await findAttachment(id);
    if (!row) return fail(404, "Not found.");
    await deleteAttachment(row.projectId, id);
  } catch (error) {
    return accessFailure(error);
  }
  return new Response(null, { status: 204 });
}
