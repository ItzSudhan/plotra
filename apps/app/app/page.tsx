import { redirect } from "next/navigation";
import { listProjects, listSharedProjects, listWorkspaces, requireSession } from "@/lib/data";

// Send people to their active workspace; to what's shared with them if they
// have none; or to the Cold Open (app/start) if they have neither, or a
// workspace with nothing in it yet.
export default async function Home() {
  const { session } = await requireSession();
  const workspaces = await listWorkspaces();
  if (workspaces.length === 0) redirect((await listSharedProjects()).length ? "/shared" : "/start");

  const active = workspaces.find((w) => w.id === session.activeOrganizationId) ?? workspaces[0];
  if ((await listProjects(active.id)).length === 0) redirect(`/start?w=${active.slug}`);
  redirect(`/w/${active.slug}`);
}
