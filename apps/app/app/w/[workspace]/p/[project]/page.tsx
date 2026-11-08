import type { Metadata } from "next";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { getAiState } from "@/lib/agent/availability";
import { listNodes } from "@/lib/binder";
import { ensureDefaultPropertyDefs } from "@/lib/knowledge-actions";
import { requireProject, requireSession } from "@/lib/data";
import { ensureResearchDefaults } from "@/lib/research-actions";
import { workspaceDefaults } from "@/lib/defaults";
import { ensureWorldDefaults } from "@/lib/world-actions";

export async function generateMetadata({ params }: PageProps<"/w/[workspace]/p/[project]">): Promise<Metadata> {
  const { workspace, project } = await params;
  return { title: (await requireProject(workspace, project)).project.title };
}

// The Obsidian-style project workspace: ribbon · binder · panes · inspector · status bar.
export default async function ProjectPage({ params }: PageProps<"/w/[workspace]/p/[project]">) {
  const { workspace: workspaceSlug, project: projectSlug } = await params;
  const [{ user }, { workspace, project, actions, isGuest }] = await Promise.all([
    requireSession(),
    requireProject(workspaceSlug, projectSlug),
  ]);
  // Whether AI is on here for this person (both switches, and they can edit), and whether they have a model.
  const [nodes, propertyDefs, ai, defaults] = await Promise.all([
    listNodes(project.id),
    ensureDefaultPropertyDefs(project.id),
    getAiState(project.id),
    // The workspace's default setup, under the project's and each person's own (lib/shell-defaults.ts).
    workspaceDefaults(workspace.id),
  ]);
  // After the templates: this adds the properties and entity types the project's modules rely on.
  await ensureWorldDefaults(project.id);
  propertyDefs.push(...(await ensureResearchDefaults(project.id)).added);

  return (
    <WorkspaceShell
      // A fresh shell per project, so binder state never leaks between projects.
      key={project.id}
      project={{
        id: project.id,
        slug: project.slug,
        title: project.title,
        description: project.description,
        type: project.type,
        settings: project.settings,
        worldId: project.worldId,
        actions: [...actions],
      }}
      workspace={{ name: workspace.name, slug: workspace.slug, role: workspace.role, homeHref: isGuest ? "/shared" : `/w/${workspace.slug}`, defaults }}
      user={{ id: user.id, name: user.name, email: user.email, image: user.image }}
      initialNodes={nodes}
      initialPropertyDefs={propertyDefs}
      ai={ai}
    />
  );
}
