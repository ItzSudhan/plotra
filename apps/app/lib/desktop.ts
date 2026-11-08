import { headers } from "next/headers";

/** True on a request from Plotra's desktop app, which adds "PlotraDesktop/<version>" to its user agent (apps/desktop/src/main.ts). */
export async function inDesktopApp() {
  return /\bPlotraDesktop\//.test((await headers()).get("user-agent") ?? "");
}
