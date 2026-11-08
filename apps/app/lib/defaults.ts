import "server-only";
import { db, schema } from "@plotra/db";
import { eq } from "drizzle-orm";
import type { ShellDefaults } from "./shell-defaults";

const { workspaceSettings } = schema;

/**
 * The workspace's default setup, for the project page: read with the server's
 * own connection, after the page has checked the person can open the project
 * (a guest isn't a workspace member, and isn't shown a member's settings).
 */
export async function workspaceDefaults(workspaceId: string): Promise<ShellDefaults | null> {
  const [row] = await db.select({ defaults: workspaceSettings.defaults }).from(workspaceSettings).where(eq(workspaceSettings.workspaceId, workspaceId)).limit(1);
  return row?.defaults && Object.keys(row.defaults).length ? row.defaults : null;
}
