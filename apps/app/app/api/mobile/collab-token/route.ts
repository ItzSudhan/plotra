import { ApiError, json, withApi } from "@/lib/api/handler";
import { collabUrl } from "@/lib/api/mobile";
import { getCollabToken } from "@/lib/collab/token";
import { colorFor } from "@/lib/colors";
import { requireSession } from "@/lib/data";

// GET /api/mobile/collab-token?project=<id>&room=<room>: what the phone app's
// editor needs to join a note's live document, as the web editor does
// (lib/collab/token.ts): a short-lived token for the room, the collab server's
// address, and the name and colour others see. The seat (editor, commenter
// or viewer) is whatever the person has in the note; the token itself must be
// one that can write, as the app's is.
export function GET(request: Request) {
  return withApi(request, "write", async () => {
    const url = collabUrl();
    if (!url) throw new ApiError(404, "This Plotra has no collaboration server.");
    const params = new URL(request.url).searchParams;
    let token: Awaited<ReturnType<typeof getCollabToken>>;
    try {
      token = await getCollabToken(params.get("project") ?? "", params.get("room") ?? "");
    } catch {
      throw new ApiError(403, "You can't open this note.");
    }
    const { user } = await requireSession();
    return json({ ...token, url, user: { name: user.name || user.email, color: colorFor(user.id) } });
  });
}
