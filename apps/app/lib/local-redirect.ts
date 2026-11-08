import { NextResponse } from "next/server";

/**
 * A redirect in local mode that stays on the host the window asked for. The
 * server listens on 127.0.0.1, but Next gives a request "localhost" as its
 * host: a redirect there would leave the window's session cookie and the
 * desktop app's token behind. So the address is built from the Host header.
 */
export function localRedirect(request: Request, path: string): NextResponse {
  const host = request.headers.get("host") ?? new URL(request.url).host;
  const response = NextResponse.redirect(new URL(path, `http://${host}`));
  response.headers.set("cache-control", "no-store");
  return response;
}
