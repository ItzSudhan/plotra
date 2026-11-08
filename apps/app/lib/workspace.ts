import "server-only";
import { parseWorkspaceRole } from "./access/policy";
import { requireSession, requireWorkspace } from "./data";

/** The workspace, for an owner or admin; throws for anyone else. */
export async function requireAdmin(workspaceSlug: string) {
  const { user } = await requireSession();
  const workspace = await requireWorkspace(workspaceSlug);
  const role = parseWorkspaceRole(workspace.role);
  if (role === "member") throw new Error("Only owners and admins can change workspace settings.");
  return { workspace, role, userId: user.id };
}
