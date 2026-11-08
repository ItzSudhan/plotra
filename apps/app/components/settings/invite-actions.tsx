"use client";

import { authClient, signOut } from "@plotra/auth/client";
import { Button } from "@plotra/ui/components/button";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { forgetKeptProjects } from "@/components/offline/keep-offline";
import { forgetPageCopies } from "@/components/offline/service-worker";
import { authErrorText } from "@/lib/auth-errors";
import { announceInviteAccepted } from "@/lib/notify-actions";

export function InviteActions({ invitationId, workspaceSlug }: { invitationId: string; workspaceSlug: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<"accept" | "decline" | null>(null);

  async function accept() {
    setPending("accept");
    const { error } = await authClient.organization.acceptInvitation({ invitationId });
    if (error) {
      setPending(null);
      toast.error(authErrorText(error, "Couldn't accept the invitation. Try again in a moment."));
      return;
    }
    // Tells the inviter. Joining has already worked, so a failure here isn't the new member's problem.
    await announceInviteAccepted(invitationId).catch(() => {});
    router.push(`/w/${workspaceSlug}`);
    router.refresh();
  }

  async function decline() {
    setPending("decline");
    const { error } = await authClient.organization.rejectInvitation({ invitationId });
    if (error) {
      setPending(null);
      toast.error(authErrorText(error, "Couldn't decline the invitation. Try again in a moment."));
      return;
    }
    toast("Invitation declined.");
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex gap-2">
      <Button onClick={accept} disabled={pending !== null} className="flex-1">
        {pending === "accept" ? "Joining…" : "Accept and join"}
      </Button>
      <Button variant="outline" onClick={decline} disabled={pending !== null}>
        Decline
      </Button>
    </div>
  );
}

/**
 * For an invitation sent to another address than the one signed in: signs out
 * and comes back to it through sign-in, as whoever it was meant for.
 */
export function SwitchAccount({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function switchAccount() {
    setPending(true);
    await signOut();
    await forgetPageCopies();
    forgetKeptProjects();
    router.push(`/sign-in?callbackURL=${encodeURIComponent(`/invite/${invitationId}`)}`);
    router.refresh();
  }

  return (
    <Button onClick={switchAccount} disabled={pending} className="w-full">
      {pending ? "Signing out…" : "Sign in with another account"}
    </Button>
  );
}
