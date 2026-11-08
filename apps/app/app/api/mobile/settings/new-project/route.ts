import { schema } from "@plotra/db";
import { projectTypes } from "@plotra/db/schema";
import { and, eq } from "drizzle-orm";
import { ApiError, body, json, withApi } from "@/lib/api/handler";
import { requireWorkspace } from "@/lib/data";
import { userDb } from "@/lib/db";
import { startEmptyProject } from "@/lib/new-project";
import { projectTypeMeta } from "@/lib/project-types";
import { createStarterProject } from "@/lib/starter-actions";
import { audiences, starterCatalog } from "@/lib/starters/catalog";

// Starting a project from the phone app: empty, as the web's New project
// (lib/new-project.ts), or from a starter (lib/starter-actions.ts). Same
// checks and quotas as the web.
//
// GET                                         → { types, audiences, starters }
// POST { workspace, title, type, starter? }   → { projectId, noteId }

export function GET(request: Request) {
  return withApi(request, "read", async () =>
    json({
      types: projectTypes.map((id) => ({ id, label: projectTypeMeta[id].label })),
      audiences,
      starters: starterCatalog.map(({ id, audience, type, label, description }) => ({ id, audience, type, label, description })),
    }),
  );
}

export function POST(request: Request) {
  return withApi(request, "write", async () => {
    const input = await body<{ workspace?: unknown; title?: unknown; type?: unknown; starter?: unknown }>(request);
    if (typeof input.workspace !== "string") throw new ApiError(400, "Say which workspace (its slug).");
    if (typeof input.starter === "string" && input.starter) {
      const { href } = await createStarterProject(input.workspace, input.starter, typeof input.title === "string" ? input.title : undefined);
      // The starter says where to open it, by address: find the project behind it.
      const url = new URL(href, "http://plotra");
      const slug = decodeURIComponent(url.pathname.split("/p/")[1] ?? "");
      const workspace = await requireWorkspace(input.workspace);
      const [row] = await userDb((tx) =>
        tx.select({ id: schema.project.id }).from(schema.project).where(and(eq(schema.project.organizationId, workspace.id), eq(schema.project.slug, slug))).limit(1),
      );
      if (!row) throw new ApiError(500, "The project was made, but couldn't be found. Pull to refresh the Library.");
      return json({ projectId: row.id, noteId: url.searchParams.get("open") });
    }
    const created = await startEmptyProject(input.workspace, { title: input.title, type: input.type });
    return json({ projectId: created.projectId, noteId: created.sceneId });
  });
}
