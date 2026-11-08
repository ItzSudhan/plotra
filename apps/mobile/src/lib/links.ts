import * as WebBrowser from "expo-web-browser";
import type { Project } from "./types";

// Opening Plotra on the web, for what the phone doesn't do itself: boards,
// timelines, the graph, settings. The browser sheet shares the system
// browser's sign-in, so they may be asked to sign in there once.

export function webUrl(server: string, project?: Pick<Project, "slug" | "workspaceSlug"> | null, noteId?: string): string {
  if (!project?.workspaceSlug) return server;
  return `${server}/w/${encodeURIComponent(project.workspaceSlug)}/p/${encodeURIComponent(project.slug)}${noteId ? `?open=${encodeURIComponent(noteId)}` : ""}`;
}

export async function openWeb(url: string) {
  await WebBrowser.openBrowserAsync(url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET }).catch(() => {});
}

/** "3 min ago", "Yesterday", "12 Mar". */
export function ago(iso: string | number): string {
  const then = typeof iso === "number" ? iso : Date.parse(iso);
  const s = Math.round((Date.now() - then) / 1000);
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 172800) return "Yesterday";
  const d = new Date(then);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", ...(!sameYear && { year: "numeric" }) });
}

export const words = (n: number) => `${n.toLocaleString()} ${n === 1 ? "word" : "words"}`;
