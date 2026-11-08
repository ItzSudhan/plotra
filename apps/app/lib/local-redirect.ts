import { NextResponse } from "next/server";

/**
 * A redirect in local mode, by path only, so it stays on the window's host.
 * The server listens on 127.0.0.1, but Next gives a request "localhost" as its
 * host: a full address would send the window to another host, without its
 * session cookie or the desktop app's token.
 */
export function localRedirect(path: string): NextResponse {
  return new NextResponse(null, { status: 307, headers: { location: path, "cache-control": "no-store" } });
}
