import type { Metadata } from "next";
import { ColdOpen } from "@/components/onboarding/cold-open";
import { listProjects, listWorkspaces, requireSession } from "@/lib/data";

export const metadata: Metadata = { title: "Start a project" };

// The Cold Open (onboarding-plan.md 2.1): where a new account lands, and the
// guided way to start any later project (`?w=<workspace slug>`).
export default async function StartPage({ searchParams }: PageProps<"/start">) {
  const [{ user, session }, workspaces, { w }] = await Promise.all([requireSession(), listWorkspaces(), searchParams]);
  // The workspace asked for, else the active one; someone with none names their first as the opening question.
  const workspace = workspaces.find((ws) => ws.slug === w) ?? workspaces.find((ws) => ws.id === session.activeOrganizationId) ?? workspaces[0] ?? null;

  // Projects of the workspace marked as templates: a new one can start in their shape (lib/template-actions.ts).
  const templates = workspace ? (await listProjects(workspace.id)).filter((p) => p.settings?.template).map((p) => ({ id: p.id, title: p.title, type: p.type })) : [];

  return <ColdOpen workspace={workspace && { name: workspace.name, slug: workspace.slug }} userName={user.name} templates={templates} />;
}
