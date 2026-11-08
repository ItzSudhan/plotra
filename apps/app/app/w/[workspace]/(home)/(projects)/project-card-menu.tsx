"use client";

import { confirm, promptText } from "@plotra/ui/components/dialogs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@plotra/ui/components/dropdown-menu";
import { IconButton } from "@plotra/ui/components/icon-button";
import { Icon } from "@plotra/icons";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { errorText } from "@/lib/errors";
import { duplicateProject } from "@/lib/duplicate-actions";
import { deleteProject, updateProject } from "@/lib/project-actions";

/**
 * The "⋯" on a project card: rename, duplicate or delete it. Deleting can't be
 * undone, so the title has to be typed back. Shown on hover and focus, and
 * always on touch screens.
 */
export function ProjectCardMenu({ workspaceSlug, project }: { workspaceSlug: string; project: { id: string; title: string } }) {
  const router = useRouter();

  async function duplicate() {
    const pending = toast.loading(`Duplicating ‘${project.title}’…`);
    try {
      const { href } = await duplicateProject(workspaceSlug, project.id);
      toast.success(`Duplicated ‘${project.title}’`, { id: pending, action: { label: "Open", onClick: () => router.push(href) } });
      router.refresh();
    } catch (error) {
      toast.error(errorText(error, "Couldn't duplicate the project."), { id: pending });
    }
  }

  async function rename() {
    const title = await promptText({
      title: "Rename project",
      label: "Title",
      defaultValue: project.title,
      confirmLabel: "Rename",
      validate: (value) => (value.trim() ? (value.trim().length > 120 ? "Keep the title under 120 characters." : null) : "Give the project a title."),
    });
    if (title === null || title.trim() === project.title) return;
    try {
      await updateProject(project.id, { title: title.trim() });
      toast.success(`Renamed to ‘${title.trim()}’.`);
      router.refresh();
    } catch (error) {
      toast.error(errorText(error));
    }
  }

  async function remove() {
    const ok = await confirm({
      title: `Delete ‘${project.title}’?`,
      description: "Every note, draft, snapshot and comment in it is deleted, for everyone it's shared with. This can't be undone.",
      confirmLabel: "Delete forever",
      typeToConfirm: project.title,
    });
    if (!ok) return;
    try {
      await deleteProject(project.id, project.title);
      toast.success(`Deleted ‘${project.title}’.`);
      router.refresh();
    } catch (error) {
      toast.error(errorText(error));
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          icon="menu-dots-linear"
          label={`More for ${project.title}`}
          className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 pointer-coarse:opacity-100"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => void rename()}>
          <Icon name="pen-linear" />
          Rename…
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void duplicate()}>
          <Icon name="copy-linear" />
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => void remove()}>
          <Icon name="trash-bin-trash-linear" />
          Delete…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
