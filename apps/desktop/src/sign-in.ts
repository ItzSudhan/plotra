import { createHash, randomBytes } from "node:crypto";
import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

// Signing in to Plotra Cloud through the person's own browser, where Google
// and their password manager work, rather than inside the app's window
// (packages/auth/src/desktop.ts has the cloud's half). The app:
//   1. listens on a port of its own at 127.0.0.1, for one request;
//   2. opens the browser at the cloud's sign-in, which leads to
//      /desktop/sign-in with that port, a random state and the challenge
//      (the SHA-256 of a verifier that never leaves the app);
//   3. is handed a one-time code at http://127.0.0.1:<port>/callback;
//   4. swaps it, with the verifier, for a session in its own window.

export type SignInMode = "sign-in" | "sign-up";

export type SignInFlow = {
  /** Where the browser goes. */
  browserUrl: string;
  /** Proves the code was asked for by this app. */
  verifier: string;
  /** The code from the browser; rejects when cancelled or after `timeoutMs`. */
  code: Promise<string>;
  /** Stops listening. */
  cancel: () => void;
};

const key = () => randomBytes(32).toString("base64url");

/** Which of the cloud's sign-in pages `target` is, when it is one. */
export function signInPage(target: string, cloudUrl: string): SignInMode | null {
  try {
    const url = new URL(target);
    if (url.origin !== new URL(cloudUrl).origin) return null;
    if (url.pathname === "/sign-in") return "sign-in";
    if (url.pathname === "/sign-up") return "sign-up";
  } catch {
    // Not a URL: not a sign-in page.
  }
  return null;
}

/** Where the app goes once signed in: the sign-in page's own `callbackURL`, when it's a path in the app. */
export function afterSignIn(target: string): string {
  try {
    const next = new URL(target).searchParams.get("callbackURL") ?? "/";
    return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
  } catch {
    return "/";
  }
}

/** The cloud's sign-in (or sign-up) page in the browser, coming back to /desktop/sign-in for this app. */
export function browserSignInUrl(cloudUrl: string, mode: SignInMode, port: number, state: string, challenge: string): string {
  const back = `/desktop/sign-in?${new URLSearchParams({ port: String(port), state, challenge })}`;
  const url = new URL(`/${mode}`, cloudUrl);
  url.searchParams.set("callbackURL", back);
  return url.toString();
}

/** Where the app's window swaps the code for a session, and goes on to `next`. */
export function exchangeUrl(cloudUrl: string, code: string, verifier: string, next: string): string {
  const url = new URL("/api/desktop/exchange", cloudUrl);
  url.search = new URLSearchParams({ code, verifier, next }).toString();
  return url.toString();
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The page the browser shows after handing over the code (or failing to). */
export function callbackPage(title: string, message: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} · Plotra</title>
    <style>
      :root { color-scheme: light dark; --bg: #f7f6f3; --fg: #161412; --muted: #5f5a53; }
      @media (prefers-color-scheme: dark) { :root { --bg: #141311; --fg: #ece9e3; --muted: #a8a299; } }
      body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 32px; box-sizing: border-box;
        font: 15px/1.5 Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; background: var(--bg); color: var(--fg); }
      main { max-width: 440px; text-align: center; }
      h1 { margin: 0 0 10px; font: 400 34px/1.15 "Instrument Serif", "Iowan Old Style", Charter, Georgia, serif; }
      p { margin: 0; color: var(--muted); }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
    </main>
  </body>
</html>`;
}

function send(res: ServerResponse, status: number, title: string, message: string) {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" });
  res.end(callbackPage(title, message));
}

/** Starts listening and returns where to send the browser. One flow takes one code, then stops. */
export async function startSignIn(cloudUrl: string, mode: SignInMode, { timeoutMs = 15 * 60_000 } = {}): Promise<SignInFlow> {
  const state = key();
  const verifier = key();
  const challenge = createHash("sha256").update(verifier).digest("base64url");

  let resolve!: (code: string) => void;
  let reject!: (error: Error) => void;
  const code = new Promise<string>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  // Nobody may be waiting on it when it's cancelled.
  code.catch(() => {});

  let done = false;
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method !== "GET" || url.pathname !== "/callback") return send(res, 404, "Nothing here", "Go back to the Plotra app.");
    if (done || url.searchParams.get("state") !== state) {
      return send(res, 400, "This sign-in is out of date", "Go back to the Plotra app and sign in again from there.");
    }
    const given = url.searchParams.get("code");
    if (!given) return send(res, 400, "Plotra couldn't sign in", "Go back to the Plotra app and try again.");
    send(res, 200, "You're signed in", "Plotra is opening on your computer. You can close this tab.");
    finish();
    resolve(given);
  });

  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    server.close();
    server.closeIdleConnections();
  };
  const timer = setTimeout(() => {
    finish();
    reject(new Error("Signing in took too long."));
  }, timeoutMs);
  timer.unref?.();

  await new Promise<void>((res, rej) => {
    server.once("error", rej);
    server.listen(0, "127.0.0.1", () => res());
  });
  const { port } = server.address() as AddressInfo;

  return {
    browserUrl: browserSignInUrl(cloudUrl, mode, port, state, challenge),
    verifier,
    code,
    cancel: () => {
      finish();
      reject(new Error("Cancelled."));
    },
  };
}
