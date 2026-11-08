import { ApiError, json, withApi } from "@/lib/api/handler";
import { listInvitations, listMembers, type InvitationRow } from "@/lib/settings-actions";

// A workspace's members, for the phone app: who's in it, and for owners and
// admins the invitations still open. Inviting, changing roles and removing
// people go through Better Auth with a browser session
// (lib/settings-actions.ts), which an API token doesn't have, so the phone
// opens the web for those.
//
// GET ?workspace=<slug> → { members, invitations: InvitationRow[] | null }

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
