"use client";

import { Icon } from "@plotra/icons";
import { confirm } from "@plotra/ui/components/dialogs";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { fieldClass } from "@/components/views/view-ui";
import { Avatar } from "@/components/workflow/data";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import type { ReaderRow } from "@/lib/editorial-actions";
import { errorText } from "@/lib/errors";
import { read } from "@/lib/read";
import { removeProjectMember, setProjectMemberRole, shareProject } from "@/lib/share-actions";
import { SelectField } from "@plotra/ui/components/select-field";

// Beta readers (plan.md 2.8 "Beta readers / editors as limited guests"):
// people the project is shared with to read or comment. They're usually from
// outside the workspace and see only this project.

type Level = ReaderRow["role"];

const levelLabel: Record<Level, string> = { commenter: "Can read and comment", viewer: "Can read" };

export function ReadersTab() {
  const { project } = useWorkspace();
  const canManage = project.actions.includes("manage");
  const [readers, setReaders] = useState<ReaderRow[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [level, setLevel] = useState<Level>("commenter");

  const load = useCallback(() => {
    read("listReaders", project.id)
      .then((rows) => {
        setReaders(rows);
        setFailed(null);
      })
      .catch((error) => setFailed(errorText(error)));
  }, [project.id]);
  useEffect(() => {
    if (canManage) load();
  }, [canManage, load]);

  const run = async (work: () => Promise<string | void>) => {
    setBusy(true);
    try {
      const message = await work();
      if (message) toast.message(message);
      load();
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  if (!canManage) {
    return (
      <p className="mx-auto max-w-3xl p-4 text-ui-sm text-muted-foreground">
        Only people who can manage this project can add or remove beta readers.
      </p>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 p-4">
      <p className="text-ui-sm text-muted-foreground">
        Beta readers can read this project, comment, react to passages and answer questionnaires, but can&apos;t edit it. They don&apos;t need to be in
        your workspace, and see nothing else in it.
      </p>

      <section className="grid gap-2">
        <h3 className="text-ui-sm font-medium">Beta readers{readers ? ` · ${readers.length}` : ""}</h3>
        {failed && !readers ? (
          <p role="alert" className="text-ui-sm text-destructive">
            {failed}
          </p>
        ) : !readers ? (
          <div className="h-20 animate-pulse rounded-lg bg-muted" />
        ) : readers.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-4 text-center text-ui-sm text-muted-foreground">No beta readers yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border text-ui-sm">
            {readers.map((reader) => (
              <li key={reader.id} className="flex flex-wrap items-center gap-2.5 px-3 py-2">
                <Avatar person={{ id: reader.userId ?? reader.id, name: reader.name ?? reader.email, image: reader.image }} className="size-7" />
                <div className="min-w-0 flex-1">
                  <div className="truncate">{reader.name ?? reader.email}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {reader.pending ? "Invited: hasn't opened the link yet" : reader.email}
                  </div>
                </div>
                <SelectField
                  value={reader.role}
                  disabled={busy}
                  aria-label={`What ${reader.name ?? reader.email} can do`}
                  onValueChange={(v) =>
                    void run(async () => {
                      await setProjectMemberRole(project.id, reader.id, v as Level);
                      return `${reader.name ?? reader.email} ${v === "viewer" ? "can now only read" : "can now read and comment"}.`;
                    })
                  }
                  className={`${fieldClass} max-w-48`}
                >
                  <option value="commenter">{levelLabel.commenter}</option>
                  <option value="viewer">{levelLabel.viewer}</option>
                </SelectField>
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    const who = reader.name ?? reader.email;
                    const ok = await confirm({
                      title: `Remove ${who}?`,
                      description: `${who} can no longer open “${project.title}”. Their comments, reactions and answers stay. You can invite them again later.`,
                      confirmLabel: "Remove",
                    });
                    if (ok) void run(async () => (await removeProjectMember(project.id, reader.id), `${who} can no longer open this project.`));
                  }}
                  className="h-8 rounded-md border px-2.5 text-xs hover:bg-accent hover:text-destructive"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-2.5">
        <h3 className="text-ui-sm font-medium">Invite a beta reader</h3>
        <form
          className="flex flex-wrap items-center gap-2 text-ui-sm"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              const { pending } = await shareProject(project.id, email, level);
              const address = email.trim();
              setEmail("");
              return pending ? `Invitation sent to ${address}.` : `${address} can now open this project.`;
            });
          }}
        >
          <input
            type="email"
            required
            value={email}
            placeholder="reader@example.com"
            aria-label="Beta reader's email address"
            onChange={(e) => setEmail(e.target.value)}
            className={`${fieldClass} max-w-64`}
          />
          <SelectField value={level} onValueChange={(v) => setLevel(v as Level)} aria-label="What they can do" className={`${fieldClass} max-w-48`}>
            <option value="commenter">can read and comment</option>
            <option value="viewer">can only read</option>
          </SelectField>
          <button
            type="submit"
            disabled={busy}
            className="flex h-8 items-center gap-1.5 rounded-md bg-foreground px-2.5 text-ui-sm text-background disabled:opacity-40"
          >
            <Icon name="user-plus-rounded-linear" className="size-3.5" />
            Invite
          </button>
        </form>
        <p className="text-xs text-muted-foreground">
          They get an email with a link. To let someone edit, use Share in the binder instead.
        </p>
      </section>
    </div>
  );
}
