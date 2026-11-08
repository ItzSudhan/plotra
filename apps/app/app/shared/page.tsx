import { Icon } from "@plotra/icons";
import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { nav } from "@/components/transitions";
import { UserMenu } from "@/components/workspace/user-menu";
import { projectRoleMeta } from "@/lib/access/policy";
import { listSharedProjects, listWorkspaces, requireSession } from "@/lib/data";
import { projectTypeMeta } from "@/lib/project-types";

export const metadata: Metadata = { title: "Shared with you" };

const updatedFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" });

// Projects other people shared with you (plan.md 2.9): the home of a guest,
// who has no workspace of their own yet.
export default async function SharedPage() {
  const [{ user }, projects, workspaces] = await Promise.all([requireSession(), listSharedProjects(), listWorkspaces()]);

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 flex h-12 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur">
        <Link href="/" transitionTypes={nav.back} aria-label="Plotra home" className="px-1">
          <Logo />
        </Link>
        <div className="ml-auto">
          <UserMenu user={user} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Shared with you</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {projects.length === 0 ? "Nothing has been shared with you yet." : "Projects other people invited you to."}
            </p>
          </div>
          <Link
            href={workspaces.length ? `/w/${workspaces[0].slug}` : "/start"}
            transitionTypes={workspaces.length ? nav.back : nav.forward}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm hover:bg-accent"
          >
            <Icon name={workspaces.length ? "arrow-left-linear" : "add-linear"} className="size-4" />
            {workspaces.length ? "Your projects" : "Start your own project"}
          </Link>
        </div>
        {projects.length === 0 && (
          <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
            <Icon name="users-group-rounded-linear" className="mx-auto mb-3 size-7 text-faint" />
            <p className="font-medium text-foreground">Waiting for an invitation</p>
            <p className="mx-auto mt-1 max-w-md">
              When someone invites you to a project, it appears here. Ask them to send the invitation to <span className="font-medium text-foreground">{user.email}</span>.
            </p>
          </div>
        )}
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => {
            const meta = projectTypeMeta[project.type];
            return (
              <li key={project.id}>
                <Link
                  href={`/w/${project.workspaceSlug}/p/${project.slug}`}
                  transitionTypes={nav.open}
                  className="group flex h-full flex-col rounded-xl border bg-card p-4 transition-colors hover:border-foreground/20"
                >
                  <Icon name={meta.icon} className="size-7 text-ember-ink" />
                  <h2 className="mt-4 truncate font-medium">{project.title}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {project.workspaceName} · {projectRoleMeta[project.role].label} · Updated {updatedFormat.format(project.updatedAt)}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}
