import { json, withApi } from "@/lib/api/handler";
import { listApiProjects } from "@/lib/api/notes";

// GET /api/v1/projects: every project the token's owner can open. See docs/api.
export function GET(request: Request) {
  return withApi(request, "read", async () => json({ projects: await listApiProjects() }));
}
