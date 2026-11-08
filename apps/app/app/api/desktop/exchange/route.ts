import { auth } from "@plotra/auth";
import { NextResponse } from "next/server";
import { isLocalMode } from "@/lib/local-mode";
import { safeCallbackURL } from "@/lib/slug";

// GET /api/desktop/exchange?code=&verifier=&next=: the desktop app's window
// swaps the one-time code from the browser for a session, and goes on to
// `next` (packages/auth/src/desktop.ts). Only the app's window sends the
// x-plotra-desktop header; a link to here from anywhere else can't, so no page
// can sign someone's browser in to another account.

export async function GET(request: Request) {
  if (isLocalMode) return new Response("Not found", { status: 404 });
  if (request.headers.get("x-plotra-desktop") !== "1") return new Response("Open this from the Plotra app.", { status: 403 });
  const params = new URL(request.url).searchParams;
  const next = safeCallbackURL(params.get("next") ?? undefined);
  const response = await auth.api.exchangeDesktopCode({
    body: { code: params.get("code") ?? "", verifier: params.get("verifier") ?? "" },
    asResponse: true,
  });
  if (!response.ok) {
    const url = new URL("/sign-in", request.url);
    url.searchParams.set("desktop", "expired");
    if (next !== "/") url.searchParams.set("callbackURL", next);
    return NextResponse.redirect(url, { headers: { "cache-control": "no-store" } });
  }
  const redirect = NextResponse.redirect(new URL(next, request.url));
  for (const cookie of response.headers.getSetCookie()) redirect.headers.append("set-cookie", cookie);
  redirect.headers.set("cache-control", "no-store");
  return redirect;
}
