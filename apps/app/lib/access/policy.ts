// The access policy (plan.md 2.9). Pure functions, no I/O, so the rules can be
// read and tested in one place. The loader and `can()` live in ./index.ts.
//
// Access is set per workspace and per project, like sharing a Google Doc:
//
// - Workspace members can open and edit every project in the workspace.
//   Owners and admins also manage them (settings, sharing, deleting).
// - A project can be shared with anyone by email as a viewer, commenter or
//   editor. That covers people outside the workspace, who then see only that
//   project.
// - Someone who is both gets whichever lets them do more.
//
// There are no per-note permissions: everything in a project follows the project.

import type { ProjectRole } from "@plotra/db/schema";

export const actions = ["read", "comment", "edit", "delete", "manage"] as const;
export type Action = (typeof actions)[number];

export type WorkspaceRole = "owner" | "admin" | "member";

export const projectRoleMeta: Record<ProjectRole, { label: string; description: string }> = {
  viewer: { label: "Viewer", description: "Can read." },
  commenter: { label: "Commenter", description: "Can read and comment." },
  editor: { label: "Editor", description: "Can read, comment and edit." },
};

const viewer: readonly Action[] = ["read"];
const commenter: readonly Action[] = ["read", "comment"];
const editor: readonly Action[] = ["read", "comment", "edit", "delete"];

const byProjectRole: Record<ProjectRole, readonly Action[]> = { viewer, commenter, editor };
const byWorkspaceRole: Record<WorkspaceRole, readonly Action[]> = { member: editor, admin: actions, owner: actions };

/** Better Auth stores a member's roles as a comma-separated list; the highest one counts. */
export const parseWorkspaceRole = (role: string): WorkspaceRole => {
  const roles = role.split(",").map((r) => r.trim());
  return roles.includes("owner") ? "owner" : roles.includes("admin") ? "admin" : "member";
};

/** What someone may do in a project, from their workspace role and what the project was shared with them as. */
export function actionsFor(workspaceRole: WorkspaceRole | null, projectRole: ProjectRole | null): Set<Action> {
  return new Set([...(workspaceRole ? byWorkspaceRole[workspaceRole] : []), ...(projectRole ? byProjectRole[projectRole] : [])]);
}
