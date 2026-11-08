import { NextResponse } from "next/server";
import { isLocalMode } from "@/lib/local-mode";
import { mayOpenLocalSession, signInLocalPerson } from "@/lib/local-person";
import { safeCallbackURL } from "@/lib/slug";

// GET /api/local/session?next=<path>: signs local mode's one person in and
// goes on to `next` (local-mode-plan.md, phase 2). Where every page without a
// session is sent in local mode, instead of the sign-in form.

export async function GET(request: Request) {
  if (!isLocalMode) return new Response("Not found", { status: 404 });
  if (!mayOpenLocalSession(request)) {
    return new Response("This Plotra library is open in the Plotra app. Use the app's window.", { status: 403 });
  }
  const next = safeCallbackURL(new URL(request.url).searchParams.get("next") ?? undefined);
  const cookies = await signInLocalPerson();
  const response = NextResponse.redirect(new URL(next, request.url));
  for (const cookie of cookies) response.headers.append("set-cookie", cookie);
  response.headers.set("cache-control", "no-store");
  return response;
}
