import { isLocalMode } from "@/lib/local-mode";
import { mayOpenLocalSession, signInLocalPerson } from "@/lib/local-person";
import { safeCallbackURL } from "@/lib/slug";
import { localRedirect } from "@/lib/local-redirect";

// GET /api/local/session?next=<path>: signs local mode's one person in and
// goes on to `next` (local-mode-plan.md, phase 2). Where every page without a
// session is sent in local mode, instead of the sign-in form.

export async function GET(request: Request) {
  if (!isLocalMode) return new Response("Not found", { status: 404 });
  if (!mayOpenLocalSession(request)) {
    return new Response("This Plotra library is open in the Plotra app. Use the app's window.", { status: 403 });
  }
  const next = safeCallbackURL(new URL(request.url).searchParams.get("next") ?? undefined);
  let cookies: string[];
  try {
    cookies = await signInLocalPerson();
  } catch (error) {
    // Said in words, not a blank page: the desktop window would otherwise sit empty.
    console.error(error);
    return new Response("Plotra couldn't open this library. Close the window and open the library again from File → Open Recent.", {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }
  const response = localRedirect(next);
  for (const cookie of cookies) response.headers.append("set-cookie", cookie);
  return response;
}
