import type { Metadata } from "next";
import path from "node:path";
import { ColdOpen, type LocalLibrary } from "@/components/onboarding/cold-open";
import { aiRemoved } from "@/lib/agent/no-ai";
import { modelSource } from "@/lib/agent/settings";
import { listProjects, listWorkspaces, requireSession } from "@/lib/data";
import { dailySnapshotsOn } from "@/lib/library-settings";
import { isLocalMode } from "@/lib/local-mode";

export const metadata: Metadata = { title: "Start a project" };

// The Cold Open (onboarding-plan.md 2.1): where a new account lands, and the
// guided way to start any later project (`?w=<workspace slug>`).
export default async function StartPage({ searchParams }: PageProps<"/start">) {
  const [{ user, session }, workspaces, { w }] = await Promise.all([requireSession(), listWorkspaces(), searchParams]);
  // The workspace asked for, else the active one; someone with none names their first as the opening question.
  const workspace = workspaces.find((ws) => ws.slug === w) ?? workspaces.find((ws) => ws.id === session.activeOrganizationId) ?? workspaces[0] ?? null;

  // Projects of the workspace marked as templates: a new one can start in their shape (lib/template-actions.ts).
  const templates = workspace ? (await listProjects(workspace.id)).filter((p) => p.settings?.template).map((p) => ({ id: p.id, title: p.title, type: p.type })) : [];

  // In local mode, the library this is (the desktop app passes its folder as PLOTRA_LIBRARY): its first screens are about it.
  let library: LocalLibrary | null = null;
  if (isLocalMode) {
    const dir = process.env.PLOTRA_LIBRARY || null;
    library = { name: dir ? path.basename(dir) : "My library", dir, askAi: !workspace && !aiRemoved() && !(await modelSource()), dailySnapshots: dailySnapshotsOn() };
  }

  return <ColdOpen workspace={workspace && { name: workspace.name, slug: workspace.slug }} userName={user.name} templates={templates} library={library} />;
}
