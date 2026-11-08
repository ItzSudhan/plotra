"use client";

import { projectRoles, type ProjectRole } from "@plotra/db/schema";
import { Icon } from "@plotra/icons";
import { Button } from "@plotra/ui/components/button";
import { IconButton } from "@plotra/ui/components/icon-button";
import { undoToast } from "@plotra/ui/components/sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@plotra/ui/components/dialog";
import { Input } from "@plotra/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@plotra/ui/components/select";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ShareLinkSection } from "@/components/public/share-link-section";
import { PersonAvatar } from "@/components/settings/ui";
import { projectRoleMeta } from "@/lib/access/policy";
import { errorText } from "@/lib/errors";
import { getSharing, removeProjectMember, setProjectMemberRole, shareProject, type Sharing } from "@/lib/share-actions";
import { useWorkspace } from "./workspace-provider";
import { plural } from "@/lib/plural";

const workspaceRoleLabel = { owner: "Owner", admin: "Admin", member: "Member" } as const;

/** "Ben can now edit." */
const roleSentence: Record<ProjectRole, string> = { viewer: "can now read", commenter: "can now read and comment", editor: "can now edit" };

const firstName = (person: { name: string | null; email: string }) => person.name?.split(" ")[0] || person.email;

function RoleSelect({ value, onChange, disabled, label = "What they can do" }: { value: ProjectRole; onChange: (role: ProjectRole) => void; disabled?: boolean; label?: string }) {
  return (
    <Select value={value} disabled={disabled} onValueChange={(v) => onChange(v as ProjectRole)}>
      <SelectTrigger size="sm" className="w-32 text-ui-sm" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {projectRoles.map((role) => (
          <SelectItem key={role} value={role}>
            {projectRoleMeta[role].label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Who can open the project, and lets a manager change it (plan.md 2.9). */
export function ShareDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { project } = useWorkspace();
  const [data, setData] = useState<Sharing | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ProjectRole>("commenter");
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      getSharing(project.id)
        .then((sharing) => {
          setData(sharing);
          setFailed(null);
        })
        .catch((error) => setFailed(errorText(error))),
    [project.id],
  );
  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const run = async (work: () => Promise<string | void>) => {
    setBusy(true);
    try {
      const message = await work();
      if (message) toast.success(message);
      await load();
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="users-group-rounded-linear" className="size-5 text-ember-ink" />
            <span className="truncate">Share “{project.title}”</span>
          </DialogTitle>
          <DialogDescription className="text-ui-sm">
            Add anyone by email, in or outside the workspace. They see only this project.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              const { pending } = await shareProject(project.id, email, role);
              const address = email.trim();
              setEmail("");
              return pending ? `Invitation sent to ${address}.` : `Shared with ${address}.`;
            });
          }}
        >
          <Input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            aria-label="Email address"
            className="h-8 min-w-48 flex-1 text-ui-sm"
          />
          <RoleSelect value={role} onChange={setRole} />
          <Button type="submit" size="sm" disabled={busy}>
            Share
          </Button>
        </form>
        <p className="-mt-3 text-xs text-muted-foreground">{projectRoleMeta[role].description}</p>

        {failed && !data ? (
          <p role="alert" className="text-ui-sm text-destructive">
            {failed}
          </p>
        ) : !data ? (
          <div className="h-24 animate-pulse rounded-lg bg-muted" />
        ) : (
          <div className="grid max-h-[45vh] gap-4 overflow-y-auto">
            {data.shared.length > 0 && (
              <section className="grid gap-1.5">
                <h3 className="text-ui-sm font-medium">Shared with</h3>
                <ul className="divide-y rounded-lg border text-ui-sm">
                  {data.shared.map((person) => (
                    <li key={person.id} className="flex items-center gap-2.5 px-3 py-2">
                      <PersonAvatar name={person.name ?? person.email} image={person.image} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{person.name ?? person.email}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {person.pending ? "Invited: hasn't opened the link yet" : person.isMember ? `${person.email} · also a workspace member` : person.email}
                        </div>
                      </div>
                      <RoleSelect
                        value={person.role}
                        disabled={busy}
                        label={`What ${person.name ?? person.email} can do`}
                        onChange={(next) =>
                          void run(async () => {
                            await setProjectMemberRole(project.id, person.id, next);
                            return `${firstName(person)} ${roleSentence[next]}.`;
                          })
                        }
                      />
                      <IconButton
                        icon="close-linear"
                        label={`Remove ${person.name ?? person.email}`}
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await removeProjectMember(project.id, person.id);
                            // Sharing again with the same role undoes it (they get the invitation email again).
                            undoToast(`Removed ${firstName(person)} from ‘${project.title}’`, () =>
                              run(async () => {
                                await shareProject(project.id, person.email, person.role);
                                return `${firstName(person)} is back, and ${roleSentence[person.role]}.`;
                              }),
                            );
                          })
                        }
                      />
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section className="grid gap-1.5">
              <h3 className="text-ui-sm font-medium">
                {data.workspace.name} · {data.members.length} {plural(data.members.length, "member")}
              </h3>
              <ul className="divide-y rounded-lg border text-ui-sm">
                {data.members.map((person) => (
                  <li key={person.userId} className="flex items-center gap-2.5 px-3 py-2">
                    <PersonAvatar name={person.name} image={person.image} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{person.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{person.email}</div>
                    </div>
                    <span className="text-xs text-muted-foreground">{workspaceRoleLabel[person.role]}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">Workspace members can open and edit every project. Owners and admins also manage sharing and settings.</p>
            </section>
          </div>
        )}
        {/* The read-only link (plan.md 2.9). Mounted while the dialog is open, so its state is fresh each time. */}
        {open && data && <ShareLinkSection projectId={project.id} />}
      </DialogContent>
    </Dialog>
  );
}
