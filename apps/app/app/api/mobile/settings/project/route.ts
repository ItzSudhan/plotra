import { moduleIds, projectTypes, scriptFormats, type ModuleId, type ProjectType, type ScriptFormat } from "@plotra/db/schema";
import { requireProjectAccess } from "@/lib/access";
import { workspaceAiEnabled } from "@/lib/agent/availability";
import { ApiError, body, json, read, withApi } from "@/lib/api/handler";
import { enabledModules, formatMeta, moduleMeta, typeFormat, typeModules } from "@/lib/modules";
import { deleteProject, listWorldCandidates, updateProject, updateProjectSettings, type SettingsPatch } from "@/lib/project-actions";
import { projectTypeMeta } from "@/lib/project-types";
import { moduleLabel } from "@/lib/vocabulary";

// A project's settings for the phone app: what the web's Project settings →
// General and Tools show (components/workspace/project-settings-dialog.tsx),
// through the same actions (lib/project-actions.ts), which check `manage`.
// The workflow, words, labels, kinds, webhooks and GitHub stay on the web.
//
// GET    ?project=<id>                         → the settings, and the choices
// PATCH  { project, title?, description?, type?, worldId?, format?, autoVersionMinutes?, template?, modules? }
// DELETE { project, title }                    → deletes it; the title typed back

export function GET(request: Request) {
  return withApi(request, "read", async () => {
    const projectId = new URL(request.url).searchParams.get("project");
    if (!projectId) throw new ApiError(400, "Say which project: ?project=<id>.");
    return json(
      await read(async () => {
        const { project, actions } = await requireProjectAccess(projectId);
        const [worlds, aiOn] = await Promise.all([listWorldCandidates(projectId), workspaceAiEnabled(project.organizationId)]);
        const on = enabledModules(project.type, project.settings);
        const defaults = new Set<ModuleId>(typeModules[project.type]);
        return {
          title: project.title,
          description: project.description,
          type: project.type,
          worldId: project.worldId,
          format: project.settings.format ?? typeFormat[project.type],
          autoVersionMinutes: project.settings.autoVersionMinutes ?? 30,
          template: project.settings.template === true,
          canManage: actions.has("manage"),
          // The AI module is only offered once the workspace has switched AI on, as on the web.
          modules: moduleIds
            .filter((id) => id !== "ai" || aiOn)
            .map((id) => ({ id, label: moduleLabel(id, project.settings), description: moduleMeta[id].description, on: on.has(id), byDefault: defaults.has(id) })),
          types: projectTypes.map((id) => ({ id, label: projectTypeMeta[id].label })),
          formats: scriptFormats.map((id) => ({ id, ...formatMeta[id] })),
          worlds: worlds.map((w) => ({ id: w.id, title: w.title, type: projectTypeMeta[w.type].label })),
        };
      }),
    );
  });
}

type Patch = {
  project?: unknown;
  title?: unknown;
  description?: unknown;
  type?: unknown;
  worldId?: unknown;
  format?: unknown;
  autoVersionMinutes?: unknown;
  template?: unknown;
  modules?: unknown;
};

export function PATCH(request: Request) {
  return withApi(request, "write", async () => {
    const input = await body<Patch>(request);
    if (typeof input.project !== "string") throw new ApiError(400, "Send project.");
    const projectPatch = {
      ...(typeof input.title === "string" && { title: input.title }),
      ...(input.description !== undefined && { description: typeof input.description === "string" ? input.description : null }),
      ...(typeof input.type === "string" && { type: input.type as ProjectType }),
      ...(input.worldId !== undefined && { worldId: typeof input.worldId === "string" && input.worldId ? input.worldId : null }),
    };
    const settingsPatch: SettingsPatch = {
      ...(typeof input.format === "string" && { format: input.format as ScriptFormat }),
      ...(typeof input.autoVersionMinutes === "number" && { autoVersionMinutes: input.autoVersionMinutes }),
      ...(typeof input.template === "boolean" && { template: input.template }),
      ...(typeof input.modules === "object" && input.modules !== null && { modules: input.modules as SettingsPatch["modules"] }),
    };
    if (Object.keys(projectPatch).length) await updateProject(input.project, projectPatch);
    if (Object.keys(settingsPatch).length) await updateProjectSettings(input.project, settingsPatch);
    return json({ ok: true });
  });
}

export function DELETE(request: Request) {
  return withApi(request, "write", async () => {
    const input = await body<{ project?: unknown; title?: unknown }>(request);
    if (typeof input.project !== "string" || typeof input.title !== "string") throw new ApiError(400, "Send project, and its title typed back.");
    await deleteProject(input.project, input.title);
    return json({ ok: true });
  });
}
