import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { localRedirect } from "@/lib/local-redirect";
import { isLocalMode } from "@/lib/local-mode";

// `/p` is the public reader behind a project's read-only link (plan.md 2.9):
// it checks the link's token itself and never needs a session. `/copy` is
// copying that project, which says what a copy holds before anyone signs up;
// `/worlds` the gallery of links their owners listed; `/plugins` the plugin
// store, browsed without an account (installing asks to sign in). Forgetting
// a password and choosing a new one happen signed out.
const publicPaths = ["/sign-in", "/sign-up", "/forgot-password", "/reset-password", "/p", "/copy", "/worlds", "/plugins"];

// Pages for other people, which local mode has none of: the public reader and
// copying from it, accepting an invitation or a share, and what's shared with
// you; and signing the desktop app in to the cloud. (The plugin store is
// there: plotra.ink's, lib/plugin-store-remote.ts.)
const cloudOnlyPaths = ["/p", "/copy", "/worlds", "/invite", "/share", "/shared", "/desktop"];

const matches = (pathname: string, paths: string[]) => paths.some((path) => pathname === path || pathname.startsWith(`${path}/`));

/**
 * Local mode (local-mode-plan.md, phase 2): its one person never sees the
 * sign-in form. Without a session, or on the sign-in pages, they are signed in
 * by /api/local/session and sent on.
 */
function localProxy(request: NextRequest) {
  const { pathname, search, searchParams } = request.nextUrl;
  if (matches(pathname, cloudOnlyPaths)) return localRedirect(request, "/");
  const signInPage = pathname === "/sign-in" || pathname === "/sign-up";
  if (!signInPage && getSessionCookie(request)) return NextResponse.next();
  const next = new URLSearchParams({ next: signInPage ? (searchParams.get("callbackURL") ?? "/") : pathname + search });
  return localRedirect(request, `/api/local/session?${next}`);
}

// Optimistic check only: it looks for the session cookie without hitting the
// database. Pages still verify the session through lib/data.ts.
export function proxy(request: NextRequest) {
  if (isLocalMode) return localProxy(request);
  const { pathname, search } = request.nextUrl;
  if (matches(pathname, publicPaths)) {
    return NextResponse.next();
  }

  if (!getSessionCookie(request)) {
    // Someone following an invitation most likely has no account yet: sign-up, which says they were invited.
    const url = new URL(pathname.startsWith("/invite/") ? "/sign-up" : "/sign-in", request.url);
    if (pathname !== "/") url.searchParams.set("callbackURL", pathname + search);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// `ingest/` is analytics on its way to PostHog (next.config.ts), sent before and after sign-in.
// `.well-known/` is the OAuth discovery an MCP client reads before anyone signs in (lib/api/oauth.ts).
// `.mp4` is the painted stories the sign-in pages play (components/auth/story-scene.tsx).
// The manifest and the service worker (public/sw.js) are fetched by the browser itself,
// signed in or not, to install the app and to keep it working offline.
export const config = {
  matcher: ["/((?!api/|ingest/|\\.well-known/|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp4)$).*)"],
};
