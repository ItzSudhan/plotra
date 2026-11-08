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
