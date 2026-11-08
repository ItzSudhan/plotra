import "server-only";
import { db, schema } from "@plotra/db";
import { eq, sql } from "drizzle-orm";
import { billingEnabled } from "./billing/creem";
import { freeLimits, MAX_GUESTS, proLimits, type Limits, type PlanId } from "./billing/plans";
import { getPlan } from "./billing/subscription";

// Limits (plan.md 8.2). On the hosted version they are the plan's: Free keeps
// the instance inside its providers' free tiers, and Pro raises them
// (lib/billing/plans.ts). A self-hosted Plotra has no plans and no limits.
//
// A limit only ever stops something being added. Nothing is deleted or made
// read-only, and export always works (plan.md 8.1).

const { attachment, organization, project, version } = schema;

const MB = 1024 * 1024;

// A Vercel Function can't receive a request body over 4.5 MB, so a file sent
// through one (POST /api/files) can't be larger, whatever the plan allows.
// Files sent straight to object storage (/api/files/direct) aren't capped by it.
const VERCEL_FILE_BYTES = 4 * MB;

/** The largest request body a function here can take, for uploads that pass through one. */
export const functionBodyCap = () => (process.env.VERCEL ? VERCEL_FILE_BYTES : Infinity);

/** No plans on this server: nothing is capped, and sharing keeps its own ceiling. */
const noLimits: Limits = { projects: null, storageBytes: null, fileBytes: null, members: null, guests: MAX_GUESTS, aiCredits: 0 };

/** What a workspace may hold: its plan's limits where billing is on, none otherwise. */
export async function limitsFor(workspaceId: string): Promise<Limits & { plan: PlanId | null }> {
  const plan = billingEnabled() ? await getPlan(workspaceId) : null;
  const limits = plan === "pro" ? proLimits : plan === "free" ? freeLimits : noLimits;
  return { ...limits, plan };
}

/** What to tell someone who has reached a limit about getting past it. */
export function limitHint(plan: PlanId | null): string {
  if (plan === "free") return "Pro raises this: an owner can upgrade in Settings → Plan & billing.";
  if (plan === "pro") return "";
  return "The hosted version has limits so it can stay free; a self-hosted Plotra has none.";
}

const sentence = (...parts: string[]) => parts.filter(Boolean).join(" ");

export function formatBytes(bytes: number): string {
  return bytes >= 1024 * MB ? `${+(bytes / (1024 * MB)).toFixed(1)} GB` : `${Math.round(bytes / MB)} MB`;
}

/** Throws when the workspace already has as many projects as it may. */
export async function assertCanAddProject(workspaceId: string): Promise<void> {
  const { projects: limit, plan } = await limitsFor(workspaceId);
  if (limit === null) return;
  const count = await db.$count(project, eq(project.organizationId, workspaceId));
  if (count >= limit) throw new Error(sentence(`A workspace can hold ${limit} projects${plan === "free" ? " on the Free plan" : ""}. Delete one, or start another workspace.`, limitHint(plan)));
}

/** Bytes a workspace stores: attachments and version snapshots across its projects. */
export async function getStorageUsage(workspaceId: string): Promise<number> {
  const projectIds = db.select({ id: project.id }).from(project).where(eq(project.organizationId, workspaceId));
  const [row] = await db
    .select({
      bytes: sql<number>`(
        coalesce((select sum(${attachment.size}) from ${attachment} where ${attachment.projectId} in ${projectIds}), 0) +
        coalesce((select sum(${version.size}) from ${version} where ${version.projectId} in ${projectIds}), 0))::float8`,
    })
    .from(organization)
    .where(eq(organization.id, workspaceId));
  return row?.bytes ?? 0;
}

/** Whether `adding` more bytes fits in the workspace's storage. */
export async function storageFits(workspaceId: string, adding: number): Promise<boolean> {
  const limit = (await limitsFor(workspaceId)).storageBytes;
  return limit === null || (await getStorageUsage(workspaceId)) + adding <= limit;
}

/** Throws when `adding` more bytes would take the workspace past its storage limit. */
export async function assertStorage(workspaceId: string, adding: number): Promise<void> {
  const { storageBytes: limit, plan } = await limitsFor(workspaceId);
  if (limit === null) return;
  if ((await getStorageUsage(workspaceId)) + adding > limit) {
    throw new Error(sentence(`This workspace's ${formatBytes(limit)} of storage is full. Remove some files or old versions first.`, limitHint(plan)));
  }
}
