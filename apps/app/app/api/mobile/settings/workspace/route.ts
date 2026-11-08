import { parseWorkspaceRole } from "@/lib/access";
import { ApiError, body, json, withApi } from "@/lib/api/handler";
import { cancelInvitation, changeMemberRole, inviteMember, leaveWorkspace, listInvitations, listMembers, removeMember, type InvitationRow } from "@/lib/settings-actions";

// A workspace's members, for the phone app: who's in it, and for owners and
// admins the invitations still open; and the same changes the web's Members
// settings make, through the same functions (lib/settings-actions.ts). Those
// go through Better Auth, which the phone reaches with a brief session of its
// own (lib/api/auth-session.ts), so its rules and the invitation email are the web's.
//
// GET  ?workspace=<slug> → { members, invitations: InvitationRow[] | null }
// POST ?workspace=<slug> { action: "invite", email, role: "member"|"admin" }   (inviting again resends)
//                        { action: "role", memberId, role: "member"|"admin"|"owner" }
//                        { action: "remove", memberId }
//                        { action: "cancel", invitationId }
//                        { action: "leave" }

export function GET(request: Request) {
  return withApi(request, "read", async () => {
    const slug = new URL(request.url).searchParams.get("workspace");
    if (!slug) throw new ApiError(400, "Say which workspace: ?workspace=<slug>.");
    const members = await listMembers(slug);
    // Only owners and admins see invitations; for anyone else listInvitations refuses.
    let invitations: Array<InvitationRow & { path: string }> | null = null;
    try {
      invitations = (await listInvitations(slug)).map((inv) => ({ ...inv, path: `/invite/${inv.id}` }));
    } catch {
      invitations = null;
    }
    return json({ members, invitations });
  });
}

export function POST(request: Request) {
  return withApi(request, "write", async () => {
    const slug = new URL(request.url).searchParams.get("workspace");
    if (!slug) throw new ApiError(400, "Say which workspace: ?workspace=<slug>.");
    const input = await body<{ action?: unknown; email?: unknown; role?: unknown; memberId?: unknown; invitationId?: unknown }>(request);
    const text = (value: unknown, what: string) => {
      if (typeof value !== "string" || !value.trim()) throw new ApiError(400, `Say which ${what}.`);
      return value;
    };
    switch (input.action) {
      case "invite":
        if (input.role !== "member" && input.role !== "admin") throw new ApiError(400, "Invite as a member or an admin.");
        await inviteMember(slug, text(input.email, "email address"), input.role);
        break;
      case "role":
        await changeMemberRole(slug, text(input.memberId, "member"), parseWorkspaceRole(text(input.role, "role")));
        break;
      case "remove":
        await removeMember(slug, text(input.memberId, "member"));
        break;
      case "cancel":
        await cancelInvitation(slug, text(input.invitationId, "invitation"));
        break;
      case "leave":
        await leaveWorkspace(slug);
        break;
      default:
        throw new ApiError(400, "Unknown action.");
    }
    return json({ ok: true });
  });
}
