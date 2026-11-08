import { isDesktopKey } from "@plotra/auth";

// The phone app's sign-in through the browser (apps/mobile/lib/sign-in.ts). It
// works like the desktop app's (lib/desktop-sign-in.ts), except the code goes
// back to the app through its own link, plotra://, and the app swaps it for an
// API token (app/api/mobile/token) rather than a cookie.

export type MobileRequest = { state: string; challenge: string };

/** The app's state and challenge, or null when the link is wrong. */
export function readMobileRequest(params: { state?: unknown; challenge?: unknown }): MobileRequest | null {
  if (!isDesktopKey(params.state) || !isDesktopKey(params.challenge)) return null;
  return { state: params.state, challenge: params.challenge };
}

/** Where the browser hands the code to the app. Only the app that holds the verifier can use it. */
export const mobileCallback = ({ state }: MobileRequest, code: string) => `plotra://sign-in?${new URLSearchParams({ code, state })}`;

/** What the token is called in Settings → API tokens, from what the app says it runs on. */
export function mobileTokenName(device: unknown): string {
  const clean = typeof device === "string" ? device.replace(/[^\p{L}\p{N} '’()._-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 50) : "";
  return `Plotra app${clean ? ` on ${clean}` : ""}`;
}
