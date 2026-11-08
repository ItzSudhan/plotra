import { getSession } from "@/lib/data";
import { photoKey, photoType } from "@/lib/profile-photo";
import { r2Enabled, r2Get } from "@/lib/r2";

type Context = { params: Promise<{ user: string; file: string }> };

// GET /api/avatar/<user>/<file>: a profile photo uploaded in Your settings
// (lib/account-actions.ts, `uploadProfilePhoto`). For anyone signed in, as the
// people it's shown to are; the file name is a random id, and a photo never
// changes once kept (a new one gets a new name).
export async function GET(_request: Request, ctx: Context) {
  if (!(await getSession())) return new Response("Sign in first.", { status: 401 });
  const { user, file } = await ctx.params;
  const key = photoKey(user, file);
  if (!key || !r2Enabled()) return new Response("Not found.", { status: 404 });
  const bytes = await r2Get(key).catch(() => null);
  if (!bytes) return new Response("Not found.", { status: 404 });
  return new Response(Buffer.from(bytes), {
    headers: {
      "content-type": photoType(file),
      "content-length": String(bytes.length),
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cross-origin-resource-policy": "same-origin",
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
}
