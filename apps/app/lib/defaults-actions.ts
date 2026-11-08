"use server";

import { db, schema } from "@plotra/db";
import { eq } from "drizzle-orm";
import { requireProjectAccess } from "./access";
import { requireSession } from "./data";
import { userDb } from "./db";
import { rateLimit } from "./rate-limit";
import { readOnly, transaction } from "./request-cache";
import { workspaceDefaults } from "./defaults";
import { cleanDefaults, type ShellDefaults } from "./shell-defaults";
import { requireAdmin } from "./workspace";

// Making one's own setup the default for a project or a workspace
// (lib/shell-defaults.ts): Customize → Your setup as a file. A project's
// needs `manage`; a workspace's, an owner or admin.

const { project, workspaceSettings } = schema;

/** Makes a setup the project's default, or (null) takes the default away. */
export async function setProjectDefaults(projectId: string, defaults: ShellDefaults | null): Promise<void> {
  return transaction(async () => {
    const { user } = await requireSession();
    const { project: found } = await requireProjectAccess(projectId, "manage");
    await rateLimit("defaults", user.id, { limit: 60, windowSeconds: 3600 });
    const clean = defaults === null ? null : cleanDefaults(defaults);
    const settings = { ...found.settings };
    if (clean && Object.keys(clean).length) settings.shellDefaults = clean;
    else delete settings.shellDefaults;
    await userDb((tx) => tx.update(project).set({ settings }).where(eq(project.id, projectId)));
  });
}

/** Makes a setup the default of every project in the workspace, or (null) takes it away. */
export async function setWorkspaceDefaults(workspaceSlug: string, defaults: ShellDefaults | null): Promise<void> {
  return transaction(async () => {
    const { workspace, userId } = await requireAdmin(workspaceSlug);
    await rateLimit("defaults", userId, { limit: 60, windowSeconds: 3600 });
    const clean = defaults === null ? null : cleanDefaults(defaults);
    const value = clean && Object.keys(clean).length ? clean : null;
    // `workspace_settings` is read-only for the user connection: written here, after the admin check above.
    await db.insert(workspaceSettings).values({ workspaceId: workspace.id, defaults: value }).onConflictDoUpdate({ target: workspaceSettings.workspaceId, set: { defaults: value } });
  });
}

/** Whether the workspace has a default setup, for its owners and admins. */
export async function hasWorkspaceDefaults(workspaceSlug: string): Promise<boolean> {
  return readOnly(async () => {
    const { workspace } = await requireAdmin(workspaceSlug);
    return (await workspaceDefaults(workspace.id)) !== null;
  });
}
