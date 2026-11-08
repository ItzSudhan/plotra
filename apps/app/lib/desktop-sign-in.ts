import { isDesktopKey } from "@plotra/auth";

// The desktop app's sign-in through the browser (packages/auth/src/desktop.ts):
// what the link it opens carries, checked the same way by the page and its button.

export type DesktopRequest = { port: number; state: string; challenge: string };

/** The app's port at 127.0.0.1, its state and its challenge, or null when the link is wrong. */
export function readDesktopRequest(params: { port?: unknown; state?: unknown; challenge?: unknown }): DesktopRequest | null {
  const port = typeof params.port === "string" && /^\d{4,5}$/.test(params.port) ? Number(params.port) : 0;
  if (port < 1024 || port > 65535) return null;
  if (!isDesktopKey(params.state) || !isDesktopKey(params.challenge)) return null;
  return { port, state: params.state, challenge: params.challenge };
}

/** Where the browser hands the code to the app. Always this computer: never another host. */
export const desktopCallback = ({ port, state }: DesktopRequest, code: string) =>
  `http://127.0.0.1:${port}/callback?${new URLSearchParams({ code, state })}`;
