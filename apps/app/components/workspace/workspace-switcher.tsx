"use client";

import { authClient } from "@plotra/auth/client";
import { Icon } from "@plotra/icons";
import { Button } from "@plotra/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@plotra/ui/components/dropdown-menu";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { showNavPending } from "@/components/nav-feedback";
import { nav } from "@/components/transitions";
import type { Workspace } from "@/lib/data";

export function WorkspaceSwitcher({ workspaces, current }: { workspaces: Workspace[]; current: Workspace }) {
  const router = useRouter();

  async function switchTo(workspace: Workspace) {
    showNavPending(`/w/${workspace.slug}`);
    router.push(`/w/${workspace.slug}`);
    // Remembered so "/" lands here next time.
    await authClient.organization.setActive({ organizationId: workspace.id });
  }

  return (
    // The others are fetched as the menu opens, so a switch shows at once.
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) for (const w of workspaces) if (w.id !== current.id) router.prefetch(`/w/${w.slug}`);
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 px-2 font-medium">
          <WorkspaceMark name={current.name} />
          <span className="max-w-48 truncate">{current.name}</span>
          <Icon name="sort-vertical-linear" className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Workspaces</DropdownMenuLabel>
        {workspaces.map((workspace) => (
          <DropdownMenuItem key={workspace.id} onSelect={() => switchTo(workspace)}>
            <WorkspaceMark name={workspace.name} />
            <span className="truncate">{workspace.name}</span>
            {workspace.id === current.id && <Icon name="check-linear" className="ml-auto" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/workspaces/new" transitionTypes={nav.forward}>
            <Icon name="add-linear" />
            New workspace
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function WorkspaceMark({ name }: { name: string }) {
  return (
    <span className="grid size-5 shrink-0 place-items-center rounded bg-ember/15 text-meta font-semibold text-ember-ink uppercase">
      {name.trim().charAt(0) || "?"}
    </span>
  );
}
