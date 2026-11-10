/**
 * Where a page in the app's window may go, kept apart from Electron so it can
 * be tested. The window is the app, never the website: plotra.ink, its docs and
 * blog open in the person's browser. Other sites the cloud sends the window to
 * (signing in with Google, checkout) stay in it, since they come back.
 */
export function staysInWindow(target: string, appUrl: string, mode: "cloud" | "local"): boolean {
  let to: URL;
  let from: URL;
  try {
    to = new URL(target);
    from = new URL(appUrl);
  } catch {
    return false;
  }
  if (to.origin === from.origin) return true;
  // In local mode the window never leaves the library's server.
  if (mode === "local") return false;
  const host = to.hostname;
  return host !== "plotra.ink" && !host.endsWith(".plotra.ink");
}

/**
 * The address the app's own pages go to for "Switch to Plotra Cloud" / "Switch
 * to your library" (apps/app/components/workspace/user-menu.tsx). It never
 * loads: the window catches it and switches instead.
 */
export const SWITCH_PATH = "/desktop/switch";

/** True when `target` is the switch address on the page's own server. */
export function isSwitchRequest(target: string, appUrl: string): boolean {
  try {
    const to = new URL(target);
    return to.origin === new URL(appUrl).origin && to.pathname === SWITCH_PATH;
  } catch {
    return false;
  }
}
