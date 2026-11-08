"use server";

// Your settings → Profile and account: your name, how you sign in, and
// deleting the account. Email, password and Google changes go straight from
// the browser to Better Auth (components/settings/account-section.tsx); what
// needs the server's own checks is here.

import { auth, socialProviders } from "@plotra/auth";
import { db, schema } from "@plotra/db";
import { and, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { headers } from "next/headers";
import { parseWorkspaceRole } from "./access";
import { authErrorText } from "./auth-errors";
import { getSubscription } from "./billing/subscription";
import { isApiRequest, requireSession } from "./data";
import { isLocalMode } from "./local-mode";
import { MAX_PHOTO_BYTES, ownPhotoKey, photoFileName, photoKey, photoUrl, sniffPhoto } from "./profile-photo";
import { r2Delete, r2Enabled, r2Put } from "./r2";
import { rateLimit } from "./rate-limit";

const { account, attachment, member, organization, project, version } = schema;

export type AccountView = {
  name: string;
  email: string;
  image: string | null;
  /** Signs in with an email and password. */
  hasPassword: boolean;
  /** The connected Google account's id in Plotra, which disconnecting it needs; null when there's none. */
  google: string | null;
  /** Google sign-in is set up on this server. */
  googleAvailable: boolean;
  /** Photos can be uploaded: there's object storage to keep them in (not in local mode). */
  photoUploads: boolean;
  /** The photo is one uploaded here, rather than Google's. */
  ownPhoto: boolean;
};

/** Profile photos live in object storage; without it (local mode, a server with none) there's no uploading. */
const photoUploads = () => !isLocalMode && r2Enabled();

export async function getAccount(): Promise<AccountView> {
  const { user } = await requireSession();
  const rows = await db.select({ id: account.id, providerId: account.providerId, password: account.password }).from(account).where(eq(account.userId, user.id));
  return {
    name: user.name,
    email: user.email,
    image: user.image ?? null,
    hasPassword: rows.some((r) => r.providerId === "credential" && r.password),
    google: rows.find((r) => r.providerId === "google")?.id ?? null,
    googleAvailable: socialProviders.includes("google"),
    photoUploads: photoUploads(),
    ownPhoto: ownPhotoKey(user.id, user.image) !== null,
  };
}

async function betterAuth<T>(fn: (h: Headers) => Promise<T>): Promise<T> {
  try {
    return await fn(await headers());
  } catch (error) {
    const e = error as { body?: { code?: string; message?: string }; message?: string };
    throw new Error(authErrorText({ ...e.body, message: e.body?.message ?? e.message }));
  }
}

/**
 * Sets your name or photo. The phone app calls with an API token, which has no
 * Better Auth session to send, so for it the same change goes through Better
 * Auth's own adapter; requireSession has already said whose account it is.
 */
async function setProfile(userId: string, data: { name?: string; image?: string | null }): Promise<void> {
  if (isApiRequest()) {
    await (await auth.$context).internalAdapter.updateUser(userId, { ...data, updatedAt: new Date() });
    return;
  }
  await betterAuth((h) => auth.api.updateUser({ body: data, headers: h }));
}

/** Your name: your byline on comments, history and the people list. */
export async function updateName(name: string): Promise<void> {
  const { user } = await requireSession();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Enter your name.");
  if (trimmed.length > 80) throw new Error("Keep your name under 80 characters.");
  await setProfile(user.id, { name: trimmed });
}

/**
 * Your photo: a small square the browser has already cropped (a `photo` file
 * in the form). Kept in object storage, then set as your Better Auth image, so
 * it shows wherever your picture does. The one it replaces, if uploaded here,
 * is deleted.
 */
export async function uploadProfilePhoto(form: FormData): Promise<{ image: string }> {
  const { user } = await requireSession();
  if (!photoUploads()) throw new Error("Photos can't be uploaded on this server.");
  await rateLimit("profile-photo", user.id, { limit: 20, windowSeconds: 3600 });
  const file = form.get("photo");
  if (!(file instanceof Blob) || !file.size) throw new Error("Choose a picture first.");
  if (file.size > MAX_PHOTO_BYTES) throw new Error("That picture is too large. Try a smaller one.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  // What the bytes are, not what the browser said.
  const type = sniffPhoto(bytes);
  if (!type) throw new Error("Choose a PNG, JPEG, WebP or GIF picture.");

  const name = photoFileName(type);
  const key = photoKey(user.id, name);
  if (!key) throw new Error("Photos can't be uploaded for this account.");
  await r2Put(key, bytes, type);
  const image = photoUrl(user.id, name);
  try {
    await setProfile(user.id, { image });
  } catch (error) {
    await r2Delete([key]);
    throw error;
  }
  const previous = ownPhotoKey(user.id, user.image);
  if (previous && previous !== key) await r2Delete([previous]);
  return { image };
}

/** Takes your photo away: your initials show instead. An uploaded one is deleted; Google's is only unset. */
export async function removeProfilePhoto(): Promise<void> {
  const { user } = await requireSession();
  await setProfile(user.id, { image: null });
  const previous = ownPhotoKey(user.id, user.image);
  if (previous) await r2Delete([previous]);
}

/** Subscriptions that would still be charged. */
const stillCharging = new Set(["active", "trialing", "past_due", "unpaid", "paused"]);

/**
 * Deletes your account. Workspaces shared with others need another owner
 * first (packages/auth refuses otherwise); workspaces you are alone in are
 * deleted with it, projects and files included. `password` is asked of anyone
 * who has one; Google-only accounts need a recent sign-in instead.
 */
export async function deleteAccount(password: string | null): Promise<void> {
  const { user } = await requireSession();
  const owned = (await db.select({ id: member.organizationId, role: member.role }).from(member).where(eq(member.userId, user.id)))
    .filter((m) => parseWorkspaceRole(m.role) === "owner")
    .map((m) => m.id);
  const shared = owned.length
    ? new Set((await db.select({ id: member.organizationId }).from(member).where(and(inArray(member.organizationId, owned), ne(member.userId, user.id)))).map((m) => m.id))
    : new Set<string>();
  const alone = owned.filter((id) => !shared.has(id));

  for (const id of alone) {
    const sub = await getSubscription(id);
    if (sub && stillCharging.has(sub.status)) {
      const [ws] = await db.select({ name: organization.name }).from(organization).where(eq(organization.id, id));
      throw new Error(`${ws?.name ?? "One of your workspaces"} is on Pro. Cancel the plan under its Plan & billing first, so you aren't charged again.`);
    }
  }

  const inAlone = alone.length ? db.select({ id: project.id }).from(project).where(inArray(project.organizationId, alone)) : null;
  const keys = inAlone
    ? [
        ...(await db.select({ key: version.r2Key }).from(version).where(and(inArray(version.projectId, inAlone), isNotNull(version.r2Key)))),
        ...(await db.select({ key: attachment.r2Key }).from(attachment).where(and(inArray(attachment.projectId, inAlone), isNotNull(attachment.r2Key)))),
      ].map((row) => row.key!)
    : [];

  // Your uploaded photo goes too.
  const photo = ownPhotoKey(user.id, user.image);
  if (photo) keys.push(photo);

  await betterAuth((h) => auth.api.deleteUser({ body: password ? { password } : {}, headers: h }));
  // Nobody is left in these: they go, and their projects with them by cascade.
  if (alone.length) await db.delete(organization).where(inArray(organization.id, alone));
  for (let i = 0; i < keys.length; i += 50) await r2Delete(keys.slice(i, i + 50));
}
