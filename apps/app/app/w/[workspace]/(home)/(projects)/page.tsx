import { Icon } from "@plotra/icons";
import type { Metadata } from "next";
import Link from "next/link";
import { Welcome } from "@/components/onboarding/welcome";
import { NewProjectDialog } from "@/components/workspace/new-project-dialog";
import { NoAiBanner } from "@/components/workspace/no-ai-banner";
import { getNoAiPromise } from "@/lib/agent-actions";
import { nav } from "@/components/transitions";
import { listProjects, listSharedProjects, requireWorkspace } from "@/lib/data";
import { projectTypeMeta } from "@/lib/project-types";
import { isLocalMode } from "@/lib/local-mode";
import { ProjectList } from "./project-list";
import { plural } from "@/lib/plural";

export async function generateMetadata({ params }: PageProps<"/w/[workspace]">): Promise<Metadata> {
  const workspace = await requireWorkspace((await params).workspace);
  return { title: workspace.name };
}

const updatedFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" });

export default async function WorkspacePage({ params }: PageProps<"/w/[workspace]">) {
  const workspace = await requireWorkspace((await params).workspace);
  const [projects, shared, noAi] = await Promise.all([listProjects(workspace.id), listSharedProjects(), getNoAiPromise(workspace.slug)]);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {projects.length === 0
              ? "Nothing here yet."
              : `${projects.length} ${plural(projects.length, "project")} in ${workspace.name}, most recently changed first`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {shared.length > 0 && !isLocalMode && (
            <Link
              href="/shared"
              transitionTypes={nav.forward}
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Icon name="users-group-rounded-linear" className="size-4" />
              Shared with you
            </Link>
          )}
          <Link
            href={`/w/${workspace.slug}/settings`}
            transitionTypes={nav.forward}
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Icon name="settings-linear" className="size-4" />
            Workspace settings
          </Link>
          {projects.length > 0 && <NewProjectDialog workspaceSlug={workspace.slug} />}
        </div>
      </div>

      <NoAiBanner promise={noAi.promise} removed={noAi.removed} />

      {projects.length === 0 ? (
        // An empty workspace leads into the Cold Open (app/start), or to a sample to look around in.
        <Welcome workspaceSlug={workspace.slug} />
      ) : (
        <ProjectList
          workspaceSlug={workspace.slug}
          projects={projects.map((project) => {
            const meta = projectTypeMeta[project.type];
            return { id: project.id, slug: project.slug, title: project.title, icon: meta.icon, meta: `${meta.label} · Updated ${updatedFormat.format(project.updatedAt)}` };
          })}
        />
      )}
    </main>
  );
}
