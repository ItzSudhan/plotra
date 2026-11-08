"use client";

import { Button } from "@plotra/ui/components/button";
import { confirm } from "@plotra/ui/components/dialogs";
import { Field } from "@plotra/ui/components/field";
import { Input } from "@plotra/ui/components/input";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useHost } from "@/components/workspace/create-workspace-form";
import type { WorkspaceRole } from "@/lib/access/policy";
import { errorText } from "@/lib/errors";
import { isLocalMode } from "@/lib/local-mode";
import { deleteWorkspace, leaveWorkspace, updateWorkspace } from "@/lib/settings-actions";
import { slugify } from "@/lib/slug";
import { Section } from "./ui";

// Workspace settings → General: its name and web address, leaving it, and
// deleting it. Owners and admins can rename; only the owner can delete;
// anyone can leave (Better Auth stops the only owner).

export function GeneralSection({
  workspace,
  role,
  projectCount,
}: {
  workspace: { name: string; slug: string };
  role: WorkspaceRole;
  projectCount: number;
}) {
  const router = useRouter();
  const host = useHost();
  const canEdit = role !== "member";
  const [name, setName] = useState(workspace.name);
  const [slug, setSlug] = useState(workspace.slug);
  const [changingAddress, setChangingAddress] = useState(false);
  const [busy, setBusy] = useState(false);
  const dirty = name.trim() !== workspace.name || slug !== workspace.slug;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (slug !== workspace.slug) {
      const ok = await confirm({
        title: "Change the web address?",
        description: `Links to ${host}/w/${workspace.slug} stop working, including bookmarks and links you've sent. Project links change too.`,
        confirmLabel: "Change address",
        destructive: false,
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const { slug: saved } = await updateWorkspace(workspace.slug, { name, slug });
      toast.success("Saved.");
      setChangingAddress(false);
      if (saved !== workspace.slug) router.replace(`/w/${saved}/settings`);
      else router.refresh();
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    const ok = await confirm({
      title: `Leave ${workspace.name}?`,
      description: "You lose access to its projects at once, including ones shared with you directly. To come back, you'd need a new invitation.",
      confirmLabel: "Leave",
    });
    if (!ok) return;
    try {
      await leaveWorkspace(workspace.slug);
      toast.success(`You've left ${workspace.name}.`);
      router.push("/");
      router.refresh();
    } catch (error) {
      toast.error(errorText(error));
    }
  }

  async function remove() {
    const projects = projectCount === 1 ? "its one project" : projectCount ? `all ${projectCount} of its projects` : "everything in it";
    const ok = await confirm({
      title: `Delete ${workspace.name}?`,
      description: `This deletes the workspace and ${projects}, with every note, snapshot, comment and file, for everyone in it. This can't be undone.`,
      confirmLabel: "Delete forever",
      typeToConfirm: workspace.name,
    });
    if (!ok) return;
    try {
      await deleteWorkspace(workspace.slug, workspace.name);
      toast.success(`Deleted ${workspace.name}.`);
      router.push("/");
      router.refresh();
    } catch (error) {
      toast.error(errorText(error));
    }
  }

  return (
    <div className="grid gap-10">
      <Section title="Name and web address" description={canEdit ? "How the workspace is called, and where it lives." : "Only owners and admins can change these."}>
        <form onSubmit={save} className="grid gap-4 rounded-lg border bg-card p-4">
          <Field label="Workspace name">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required disabled={!canEdit} className="h-8 text-ui-sm" />
          </Field>
          {changingAddress ? (
            <Field label="Web address" hint="Letters, numbers and dashes. It's in every link to the workspace and its projects.">
              <span className="flex items-center rounded-md border border-input bg-transparent shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30">
                <span aria-hidden className="pl-3 text-ui-sm text-muted-foreground">
                  {host}/w/
                </span>
                <input
                  value={slug}
                  onChange={(e) => setSlug(slugify(e.target.value))}
                  required
                  autoFocus
                  className="h-8 min-w-0 flex-1 bg-transparent pr-3 text-ui-sm outline-none"
                />
              </span>
            </Field>
          ) : (
            <div className="flex flex-wrap items-center gap-x-2 text-ui-sm">
              <span className="text-muted-foreground">Web address:</span>
              <span className="min-w-0 break-all">
                {host}/w/{workspace.slug}
              </span>
              {canEdit && (
                <Button type="button" variant="link" size="sm" className="h-8 px-0" onClick={() => setChangingAddress(true)}>
                  Change
                </Button>
              )}
            </div>
          )}
          {canEdit && (
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={busy || !dirty || !name.trim() || !slug}>
                {busy ? "Saving…" : "Save"}
              </Button>
              {dirty && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setName(workspace.name);
                    setSlug(workspace.slug);
                    setChangingAddress(false);
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
          )}
        </form>
      </Section>

      {!isLocalMode && (
        <Section title="Leave this workspace" description="You stop seeing its projects. Its owner can invite you back.">
          <div>
            <Button type="button" size="sm" variant="outline" onClick={() => void leave()}>
              Leave {workspace.name}…
            </Button>
          </div>
        </Section>
      )}

      {role === "owner" && (
        <Section title="Delete this workspace" description="For good, with every project in it, for everyone. Cancel a paid plan first.">
          <div>
            <Button type="button" size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => void remove()}>
              Delete workspace…
            </Button>
          </div>
        </Section>
      )}
    </div>
  );
}
