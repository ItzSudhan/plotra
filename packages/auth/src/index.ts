import { db, schema } from "@plotra/db";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { jwt, organization } from "better-auth/plugins";
import { desktopSignIn } from "./desktop";
import { emailConfigured, sendEmail } from "./email";

const google =
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET }
    : undefined;

// GitHub isn't a way to sign in: a signed-in person links it from Project
// settings → GitHub, asking for the `repo` scope, so Plotra can list their
// repositories, make a new one, and keep a project's copy in it
// (apps/app/lib/git-sync-actions.ts). No new accounts come from it.
const github =
  process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
    ? { clientId: process.env.GITHUB_CLIENT_ID, clientSecret: process.env.GITHUB_CLIENT_SECRET, disableSignUp: true }
    : undefined;

/** Whether people can link a GitHub account (GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET set). */
export const githubLinking = Boolean(github);

/** Social providers with credentials configured, so the UI only shows working buttons. */
export const socialProviders: Array<"google"> = google ? ["google"] : [];

const appUrl = (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");

// Local mode (apps/app/lib/local-mode.ts, fixed when the app is built): one
// person on their own computer, signed in automatically, for as long as the
// library is theirs.
const localMode = process.env.NEXT_PUBLIC_PLOTRA_LOCAL === "1";

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Emails an invitation when SMTP_URL is set; otherwise logs the link so local
 * development works without a mail server.
 */
async function sendInvitationEmail(data: {
  id: string;
  email: string;
  role: string;
  organization: { name: string };
  inviter: { user: { name: string; email: string } };
}) {
  const link = `${appUrl}/invite/${data.id}`;
  const inviter = data.inviter.user.name || data.inviter.user.email;
  const workspace = data.organization.name;
  if (!emailConfigured()) {
    console.log(`[plotra] Invitation for ${data.email} to ${workspace}: ${link}`);
    return;
  }
  await sendEmail({
    to: data.email,
    subject: `${inviter} invited you to ${workspace} on Plotra`,
    text: `${inviter} invited you to join ${workspace} on Plotra.\n\nAccept the invitation: ${link}\n`,
    html: `<p>${escapeHtml(inviter)} invited you to join <strong>${escapeHtml(workspace)}</strong> on Plotra.</p><p><a href="${escapeHtml(link)}">Accept the invitation</a></p><p style="color:#888;font-size:12px">If you weren't expecting this, you can ignore this email.</p>`,
  });
}

/** Sends an email, or logs it when this server has no SMTP_URL, so local development works without a mail server. */
async function deliver(message: { to: string; subject: string; text: string; html: string }) {
  if (!emailConfigured()) {
    console.log(`[plotra] Email to ${message.to}: ${message.subject}\n${message.text}`);
    return;
  }
  await sendEmail(message);
}

/** A short email with one link in it: password resets and email changes. */
const linkEmail = (to: string, subject: string, intro: string, label: string, url: string, outro: string) =>
  deliver({
    to,
    subject,
    text: `${intro}\n\n${label}: ${url}\n\n${outro}\n`,
    html: `<p>${escapeHtml(intro)}</p><p><a href="${escapeHtml(url)}">${escapeHtml(label)}</a></p><p style="color:#888;font-size:12px">${escapeHtml(outro)}</p>`,
  });

/**
 * Before an account is deleted: a workspace that other people share and that
 * has no other owner would be left with nobody to run it, so that has to be
 * handed over (or deleted) first. Workspaces the person is alone in are
 * cleared up afterwards by the app (apps/app/lib/account-actions.ts).
 */
async function assertNoOrphanedWorkspaces(userId: string) {
  const isOwner = (role: string) => role.split(",").map((r) => r.trim()).includes("owner");
  const mine = await db.query.member.findMany({ where: (m, { eq }) => eq(m.userId, userId), columns: { organizationId: true, role: true } });
  const owned = mine.filter((m) => isOwner(m.role)).map((m) => m.organizationId);
  if (!owned.length) return;
  const others = await db.query.member.findMany({
    where: (m, { and, inArray, ne }) => and(inArray(m.organizationId, owned), ne(m.userId, userId)),
    columns: { organizationId: true, role: true },
  });
  const stranded = owned.filter((id) => {
    const people = others.filter((m) => m.organizationId === id);
    return people.length > 0 && !people.some((m) => isOwner(m.role));
  });
  if (!stranded.length) return;
  const names = await db.query.organization.findMany({ where: (o, { inArray }) => inArray(o.id, stranded), columns: { name: true } });
  throw new APIError("BAD_REQUEST", {
    message: `You're the only owner of ${names.map((n) => n.name).join(", ")}. Make someone else an owner in its settings, or delete it, before deleting your account.`,
  });
}

/**
 * Usage events for the two things Better Auth creates itself (plan.md 1
 * "Product analytics"): the same rows `track` writes in apps/app/lib/analytics.ts.
 * Never throws: counting a sign-up must not be able to fail one.
 */
async function recordEvent(name: "signed_up" | "workspace_created", userId: string, workspaceId: string | null = null) {
  try {
    await db.insert(schema.event).values({ name, userId, workspaceId });
  } catch (error) {
    console.error(`[plotra] couldn't record ${name}`, error);
  }
}

export const auth = betterAuth({
  appName: "Plotra",
  database: drizzleAdapter(db, { provider: "pg", schema }),
  // Runs for every new account, whichever way it signed up (email or Google).
  databaseHooks: { user: { create: { after: (user) => recordEvent("signed_up", user.id) } } },
  emailAndPassword: {
    enabled: true,
    // "Forgot password?" (apps/app/app/(auth)/forgot-password). The link works for an hour.
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: ({ user, url }) =>
      linkEmail(
        user.email,
        "Reset your Plotra password",
        "Someone asked to reset the password for your Plotra account. Choose a new one with the link below. It works for an hour.",
        "Choose a new password",
        url,
        "If it wasn't you, ignore this email: your password stays as it is.",
      ),
  },
  // Only used to confirm a new address when someone changes their email
  // (Your settings → Profile and account), never on sign-up.
  emailVerification: {
    sendOnSignUp: false,
    sendVerificationEmail: ({ user, url }) =>
      linkEmail(user.email, "Confirm your new email for Plotra", "Confirm this is the address you want to use for Plotra.", "Confirm this email", url, "If you didn't ask for this, ignore this email."),
  },
  user: {
    changeEmail: {
      enabled: true,
      // An address already confirmed (Google's, or one changed before) is asked first, so a stolen session can't move the account.
      sendChangeEmailConfirmation: ({ user, newEmail, url }) =>
        linkEmail(
          user.email,
          "Change your Plotra email?",
          `Someone asked to change the email for your Plotra account to ${newEmail}. Approve it with the link below, then confirm the new address from its own inbox.`,
          "Approve the change",
          url,
          "If it wasn't you, ignore this email and nothing changes.",
        ),
    },
    deleteUser: { enabled: true, beforeDelete: (user) => assertNoOrphanedWorkspaces(user.id) },
  },
  // Every server action and route handler looks the session up; a signed
  // cookie copy saves that database round trip. Revoked sessions keep working
  // until it expires.
  // In local mode, as long as a cookie may last (400 days, the most browsers
  // allow, and more is refused when it's set). Each day it's used, it starts over.
  session: { cookieCache: { enabled: true, maxAge: 5 * 60 }, ...(localMode && { expiresIn: 400 * 24 * 60 * 60 }) },
  // Counted in Postgres so the limits hold across serverless instances
  // (plan.md Phase 8 "Rate limits on auth"). Off in development.
  rateLimit: {
    enabled: process.env.NODE_ENV === "production" && !localMode,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 3600, max: 5 },
      "/organization/invite-member": { window: 3600, max: 40 },
      "/request-password-reset": { window: 3600, max: 5 },
      "/change-email": { window: 3600, max: 5 },
    },
  },
  socialProviders: { ...(google && { google }), ...(github && { github }) },
  account: {
    // Tokens from Google and GitHub are kept encrypted with BETTER_AUTH_SECRET.
    encryptOAuthTokens: true,
    // A GitHub account's email is often not the one used for Plotra; linking
    // only ever happens while signed in, so it's still the same person.
    accountLinking: { allowDifferentEmails: true },
  },
  plugins: [
    // Workspaces are Better Auth organizations.
    organization({
      sendInvitationEmail,
      organizationHooks: { afterCreateOrganization: ({ organization, user }) => recordEvent("workspace_created", user.id, organization.id) },
    }),
    // Short-lived tokens for the collab server, verified via /api/auth/jwks.
    // No `set-auth-jwt` header: nothing reads it, and signing one would load
    // the signing keys on every session lookup.
    jwt({ disableSettingJwtHeader: true }),
    // The desktop app signs in through the person's browser (./desktop.ts).
    desktopSignIn(),
    // Must stay last: lets server actions set auth cookies.
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;

export { isDesktopKey } from "./desktop";
