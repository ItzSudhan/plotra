/**
 * Local mode (local-mode-plan.md): Plotra running on the writer's own computer,
 * inside the desktop app, on a database in their library folder. One person,
 * signed in automatically; nobody to share with; no collab server.
 *
 * Decided when the app is built (`PLOTRA_LOCAL=1 next build`, which is what the
 * desktop app ships), so the server and the browser always agree, and code
 * that only one mode needs drops out of the other's bundle.
 */
export const isLocalMode = process.env.NEXT_PUBLIC_PLOTRA_LOCAL === "1";

/**
 * Stops something that needs other people (an invitation, a share, a public
 * link) in local mode, where the UI for it is hidden too. Thrown inside an
 * action's `transaction`, so the message reaches the person as written.
 */
export function cloudOnly(what: string) {
  if (isLocalMode) throw new Error(`${what} needs Plotra Cloud: nobody else can reach a library on this computer.`);
}
