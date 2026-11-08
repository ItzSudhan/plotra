import { auth } from "@plotra/auth";
import { schema } from "@plotra/db";
import { Icon } from "@plotra/icons";
import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { InviteActions, SwitchAccount } from "@/components/settings/invite-actions";
import { requireSession } from "@/lib/data";
import { userDb } from "@/lib/db";

export const metadata: Metadata = { title: "Invitation" };

/** Loads the invitation through Better Auth, which checks it's addressed to this user. */
async function loadInvitation(id: string) {
  try {
    return await auth.api.getInvitation({ query: { id }, headers: await headers() });
  } catch {
    return null;
  }
}

export default async function InvitePage({ params }: PageProps<"/invite/[id]">) {
  const { id } = await params;
  const { user } = await requireSession();
  const invitation = await loadInvitation(id);
  const inviter = invitation
    ? (
        await userDb((tx) =>
          tx.select({ name: schema.user.name }).from(schema.user).where(eq(schema.user.id, invitation.inviterId)).limit(1),
        )
      )[0]
    : undefined;

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <Logo className="mb-10 text-lg" />
      <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-xs">
        {invitation ? (
          <>
            <Icon name="letter-linear" className="size-7 text-ember-ink" />
            <h1 className="mt-4 text-xl font-semibold tracking-tight">Join {invitation.organizationName}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {inviter?.name ?? invitation.inviterEmail} invited you to this workspace as{" "}
              {invitation.role === "admin" ? "an admin" : "a member"}.
            </p>
            <ul className="mt-4 mb-6 grid gap-2 text-ui-sm text-muted-foreground">
              <li className="flex gap-2">
                <Icon name="pen-new-square-linear" className="mt-0.5 size-4 shrink-0" />
                You can open, write in and comment on every project in {invitation.organizationName}, and start new ones.
              </li>
              {invitation.role === "admin" && (
                <li className="flex gap-2">
                  <Icon name="user-rounded-linear" className="mt-0.5 size-4 shrink-0" />
                  As an admin you can also invite and remove people, and change the workspace&apos;s settings.
                </li>
              )}
              <li className="flex gap-2">
                <Icon name="logout-2-linear" className="mt-0.5 size-4 shrink-0" />
                You can leave whenever you like, from the workspace&apos;s settings.
              </li>
            </ul>
            <InviteActions invitationId={invitation.id} workspaceSlug={invitation.organizationSlug} />
          </>
        ) : (
          <>
            <Icon name="danger-circle-linear" className="size-7 text-muted-foreground" />
            <h1 className="mt-4 text-xl font-semibold tracking-tight">Invitation not available</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              It may have expired, been cancelled or already been used, or it was sent to a different address than{" "}
              <span className="text-foreground">{user.email}</span>.
            </p>
            <p className="mt-3 mb-6 text-sm text-muted-foreground">
              If it was sent to another of your addresses, sign in with that one. Otherwise, ask whoever invited you to send a new invitation.
            </p>
            <SwitchAccount invitationId={id} />
          </>
        )}
      </div>
      <Link href="/" className="mt-6 text-sm text-muted-foreground hover:text-foreground">
        Go to Plotra
      </Link>
    </main>
  );
}
