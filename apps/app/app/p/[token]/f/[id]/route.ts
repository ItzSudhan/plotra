import { loadPublicImage, openPublicLink } from "@/lib/public-read";

// GET /p/<token>/f/<id>: an image that is in one of the project's notes, for
// the public reader (plan.md 2.9). Notes store such images as /api/files/<id>,
// which needs a session; the reader's documents point here instead. Only
// images, only from the project the token resolves to, and with the same
// headers /api/files uses so nothing served here can run as a page.

const plain = (status: number, message: string, extra: Record<string, string> = {}) =>
  new Response(message, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "private, no-store", ...extra } });

export async function GET(_request: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const link = await openPublicLink(token);
  if (link.status === "limited") return plain(429, "Too many requests.", { "retry-after": String(link.retryAfterSeconds) });
  const file = link.status === "ok" ? await loadPublicImage(link, id) : null;
  // A dead link, a file from elsewhere and a file that isn't an image are the same answer.
  if (!file) return plain(404, "Not found.");

  return new Response(Buffer.from(file.bytes), {
    headers: {
      "content-type": file.contentType,
      "content-length": String(file.bytes.length),
      "content-disposition": "inline",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cross-origin-resource-policy": "same-origin",
      "referrer-policy": "no-referrer",
      "x-robots-tag": "noindex",
      // Switching the link off has to work at once, so nothing is kept.
      "cache-control": "private, no-store",
    },
  });
}
