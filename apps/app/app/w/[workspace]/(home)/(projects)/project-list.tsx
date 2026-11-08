"use client";

import { Icon, type IconName } from "@plotra/icons";
import { Input } from "@plotra/ui/components/input";
import Link from "next/link";
import { useState } from "react";
import { nav } from "@/components/transitions";
import { ProjectCardMenu } from "./project-card-menu";
import { filterProjects, SEARCH_FROM } from "./project-filter";

export type ProjectCard = { id: string; slug: string; title: string; icon: IconName; meta: string };

/** The workspace's project cards, with a search box once there are more than a handful. */
export function ProjectList({ workspaceSlug, projects }: { workspaceSlug: string; projects: ProjectCard[] }) {
  const [query, setQuery] = useState("");
  const searchable = projects.length > SEARCH_FROM;
  const shown = searchable ? filterProjects(projects, query) : projects;

  return (
    <>
      {searchable && (
        <div className="relative mb-4 max-w-sm">
          <Icon name="magnifer-linear" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && query) {
                event.preventDefault();
                setQuery("");
              }
            }}
            placeholder="Search projects"
            aria-label="Search projects by title"
            className="pl-8"
          />
        </div>
      )}
      {shown.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="font-medium">No projects match ‘{query.trim()}’</p>
          <p className="mt-1 text-sm text-muted-foreground">Try fewer letters, or clear the search to see them all.</p>
          <button type="button" onClick={() => setQuery("")} className="mt-3 text-sm text-ember-ink underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded-sm outline-none">
            Clear search
          </button>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((project) => (
            <li key={project.id} className="group relative">
              <Link
                href={`/w/${workspaceSlug}/p/${project.slug}`}
                transitionTypes={nav.open}
                className="flex h-full flex-col rounded-xl border bg-card p-4 transition-colors outline-none hover:border-foreground/20 focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <Icon name={project.icon} className="size-7 text-ember-ink" />
                <h2 className="mt-4 truncate font-medium">{project.title}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{project.meta}</p>
              </Link>
              {/* Beside the link rather than in it: a menu inside a link would open the project too. */}
              <div className="absolute top-3 right-3">
                <ProjectCardMenu workspaceSlug={workspaceSlug} project={{ id: project.id, title: project.title }} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {searchable && (
        <p className="sr-only" role="status">
          {!query.trim() ? "" : shown.length ? `${shown.length} of ${projects.length} projects shown` : "No projects match"}
        </p>
      )}
    </>
  );
}
