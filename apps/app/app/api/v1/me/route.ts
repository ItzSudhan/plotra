import { json, withApi } from "@/lib/api/handler";
import { listWorkspaces, requireSession } from "@/lib/data";

// GET /api/v1/me: who the token belongs to, and their workspaces (the phone
// app groups projects by them; a project outside them is shared with you).
export function GET(request: Request) {
  return withApi(request, "read", async () => {
    const { user } = await requireSession();
    const workspaces = await listWorkspaces();
    return json({
      user: { id: user.id, name: user.name, email: user.email, image: user.image },
      workspaces: workspaces.map((w) => ({ id: w.id, name: w.name, slug: w.slug, role: w.role })),
    });
  });
}
