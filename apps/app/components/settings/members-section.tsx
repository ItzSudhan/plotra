"use client";

import { Icon } from "@plotra/icons";
import { Button } from "@plotra/ui/components/button";
import { confirm } from "@plotra/ui/components/dialogs";
import { IconButton } from "@plotra/ui/components/icon-button";
import { Input } from "@plotra/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@plotra/ui/components/select";
import { undoToast } from "@plotra/ui/components/sonner";
import { useState } from "react";
import { toast } from "sonner";
import type { WorkspaceRole } from "@/lib/access/policy";
import {
  cancelInvitation,
  changeMemberRole,
  inviteMember,
  removeMember,
  type InvitationRow,
  type MemberRow,
} from "@/lib/settings-actions";
import { List, PersonAvatar, Section } from "./ui";
import { useRun } from "./use-run";
import { plural } from "@/lib/plural";

const roleLabels: Record<WorkspaceRole, string> = { owner: "Owner", admin: "Admin", member: "Member" };
const dateFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });

/** What each role can do, said once where roles are chosen. */
function RolesExplained() {
  return (
    <ul className="grid gap-1 text-ui-sm text-muted-foreground">
      <li>
        <span className="font-medium text-foreground">Members</span> open, write in and comment on every project, and start new ones.
      </li>
      <li>
        <span className="font-medium text-foreground">Admins</span> can also invite and remove people and change the workspace&apos;s settings.
      </li>
      <li>
        <span className="font-medium text-foreground">Owners</span> can do all of that, and switch AI on, manage the plan, and delete the workspace.
      </li>
    </ul>
  );
}

function copyLink(id: string) {
  void navigator.clipboard.writeText(`${window.location.origin}/invite/${id}`).then(
    () => toast.success("Invitation link copied. It only works for the address it was sent to."),
    () => toast.error("Couldn't copy. Try again, or resend the invitation."),
  );
}

export function MembersSection({
  workspaceSlug,
  members,
  invitations,
  me,
}: {
  workspaceSlug: string;
  members: MemberRow[];
  invitations: InvitationRow[];
  me: { userId: string; role: WorkspaceRole };
}) {
  const { run, pending } = useRun();
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
  // Members see who they write with; owners and admins can change it.
  const manager = me.role !== "member";
  // Admins can't promote to owner or touch owners; Better Auth enforces the same.
  const assignable: WorkspaceRole[] = me.role === "owner" ? ["member", "admin", "owner"] : ["member", "admin"];

  async function changeRole(m: MemberRow, next: WorkspaceRole) {
    if (next === m.role) return;
    // Making someone an owner gives them the workspace's keys, deleting it included: asked first.
    if (next === "owner") {
      const ok = await confirm({
        title: `Make ${m.name} an owner?`,
        description: "Owners can do everything you can, including removing you and deleting the workspace. Only an owner can undo this.",
        confirmLabel: "Make owner",
      });
      if (!ok) return;
      await run(() => changeMemberRole(workspaceSlug, m.memberId, next), `${m.name} is now an owner.`);
      return;
    }
    const before = m.role;
    const done = await run(() => changeMemberRole(workspaceSlug, m.memberId, next));
    if (done) undoToast(`${m.name} is now ${next === "admin" ? "an admin" : "a member"}.`, () => run(() => changeMemberRole(workspaceSlug, m.memberId, before)));
  }

  async function remove(m: MemberRow) {
    const ok = await confirm({
      title: `Remove ${m.name}?`,
      description: "They lose access to every project in this workspace at once, including ones shared with them directly. To come back, they'd need a new invitation.",
      confirmLabel: "Remove",
    });
    if (ok) await run(() => removeMember(workspaceSlug, m.memberId), `${m.name} removed.`);
  }

  return (
    <div className="grid gap-10">
      {manager && (
        <Section
          title="Invite people"
          description="To let someone into one project only, or only to read or comment, share that project with them instead."
        >
          <form
            className="flex flex-wrap gap-2"
            onSubmit={async (event) => {
              event.preventDefault();
              const sent = await run(() => inviteMember(workspaceSlug, email, inviteRole), `Invitation sent to ${email}.`);
              if (sent) setEmail("");
            }}
          >
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@studio.com"
              aria-label="Email address to invite"
              className="h-8 min-w-56 flex-1 text-ui-sm"
            />
            <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as "member" | "admin")}>
              <SelectTrigger size="sm" aria-label="Role for the person you invite" className="w-28 text-ui-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" size="sm" disabled={pending}>
              <Icon name="letter-linear" />
              Send invite
            </Button>
          </form>
          <RolesExplained />
          {invitations.length > 0 && (
            <List>
              {invitations.map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                  <Icon name="clock-circle-linear" className="size-4 text-faint" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{inv.email}</div>
                    <div className="text-xs text-muted-foreground">
                      {roleLabels[inv.role as WorkspaceRole] ?? inv.role} · invited
                      {inv.inviterName ? ` by ${inv.inviterName}` : ""} · expires {dateFormat.format(inv.expiresAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="xs" onClick={() => copyLink(inv.id)}>
                      <Icon name="copy-linear" />
                      Copy link
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      disabled={pending}
                      onClick={() => run(() => inviteMember(workspaceSlug, inv.email, inv.role === "admin" ? "admin" : "member"), `Sent again to ${inv.email}.`)}
                    >
                      Resend
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      disabled={pending}
                      className="text-muted-foreground hover:text-destructive"
                      onClick={async () => {
                        const ok = await confirm({
                          title: `Revoke the invitation to ${inv.email}?`,
                          description: "The link stops working at once. You can invite them again later.",
                          confirmLabel: "Revoke invite",
                        });
                        if (ok) await run(() => cancelInvitation(workspaceSlug, inv.id), "Invitation revoked.");
                      }}
                    >
                      Revoke invite
                    </Button>
                  </div>
                </li>
              ))}
            </List>
          )}
        </Section>
      )}

      <Section
        title="Members"
        description={
          manager
            ? `${members.length} ${plural(members.length, "person", "people")} in this workspace.`
            : `${members.length} ${plural(members.length, "person", "people")} in this workspace. Only owners and admins can invite people or change roles.`
        }
      >
        <List>
          {members.map((m) => {
            const self = m.userId === me.userId;
            const locked = !manager || self || (m.role === "owner" && me.role !== "owner");
            return (
              <li key={m.memberId} className="flex items-center gap-3 px-3 py-2">
                <PersonAvatar name={m.name} image={m.image} className="size-7" />
                <div className="min-w-0 flex-1">
                  <div className="truncate">
                    {m.name}
                    {self && <span className="text-muted-foreground"> (you)</span>}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{m.email}</div>
                </div>
                {locked ? (
                  <span className="w-28 px-3 text-ui-sm text-muted-foreground">{roleLabels[m.role]}</span>
                ) : (
                  <Select value={m.role} disabled={pending} onValueChange={(v) => void changeRole(m, v as WorkspaceRole)}>
                    <SelectTrigger size="sm" aria-label={`Role for ${m.name}`} className="w-28 text-ui-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {assignable.map((r) => (
                        <SelectItem key={r} value={r}>
                          {roleLabels[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {manager &&
                  (locked ? (
                    <span className="size-8" />
                  ) : (
                    <IconButton icon="user-block-linear" label={`Remove ${m.name}`} variant="destructive" disabled={pending} onClick={() => void remove(m)} />
                  ))}
              </li>
            );
          })}
        </List>
        {!manager && <RolesExplained />}
      </Section>
    </div>
  );
}
