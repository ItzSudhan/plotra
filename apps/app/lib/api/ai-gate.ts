import "server-only";
import type { ProjectType } from "@plotra/db/schema";
import { getProjectAccess } from "../access";
import { aiSwitchedOff, workspaceAiEnabled } from "../agent/availability";
import { hasModule } from "../modules";
import { ApiError } from "./handler";
import { listApiProjects, type ApiProject } from "./notes";

// An AI assistant connected over MCP (lib/api/mcp.ts) is AI, whether it came
// in through OAuth or with a token pasted into its settings: it only opens
// projects where AI is on, the workspace's switch and the project's both
// (lib/agent/availability.ts). A promise of no AI keeps it out too. The REST
// API (app/api/v1) is for scripts and isn't held to this.

/** Throws, with a message the assistant can pass on, unless AI may open this project. */
export async function requireAiProject(projectId: string): Promise<void> {
  const access = await getProjectAccess(projectId);
  if (!access) throw new ApiError(404, "Not found.");
  const off = await aiSwitchedOff(access);
  if (off) throw new ApiError(403, `${off} AI assistants can only open projects where AI is switched on.`);
}

/** The projects the person can open where AI is on: what an assistant sees. */
export async function listAiProjects(): Promise<ApiProject[]> {
  const projects = await listApiProjects({ withSettings: true });
  const open = await Promise.all(projects.map(async (p) => (await workspaceAiEnabled(p.workspaceId)) && hasModule(p.type as ProjectType, p.settings, "ai")));
  return projects.filter((_, i) => open[i]).map((p) => ({ id: p.id, title: p.title, type: p.type, workspaceId: p.workspaceId, updatedAt: p.updatedAt }));
}
