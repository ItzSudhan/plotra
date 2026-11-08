"use client";

import { authClient } from "@plotra/auth/client";
import { Icon } from "@plotra/icons";
import { Button } from "@plotra/ui/components/button";
import { Input } from "@plotra/ui/components/input";
import { SelectField } from "@plotra/ui/components/select-field";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { errorText, friendlyMessage } from "@/lib/errors";
import { copyPublicProject } from "@/lib/public-copy-actions";
import { slugify } from "@/lib/slug";

/** Workspace addresses are shared by everyone, so a taken one is tried again with a few letters added (as the Cold Open does). */
async function createWorkspace(name: string): Promise<string> {
  const base = slugify(name.replace(/['’]/g, "")) || "workspace";
  let slug = base;
  let result = await authClient.organization.create({ name, slug });
  if (result.error) {
    slug = `${base.slice(0, 42)}-${Math.random().toString(36).slice(2, 6)}`;
    result = await authClient.organization.create({ name, slug });
  }
  // The auth library's own words aren't for people: say it plainly (lib/errors.ts).
  if (result.error) throw new Error(friendlyMessage(result.error.message ?? "") ?? "Couldn't make your space. Try again.");
  return slug;
}

/**
 * Where the copy goes: one of the person's workspaces, or, for someone who has
 * none yet (a new account), a first one named for them.
 */
export function CopyProjectForm({
  token,
  userName,
  workspaces,
  active,
}: {
  token: string;
  userName: string;
  workspaces: Array<{ slug: string; name: string }>;
  active: string | null;
}) {
  const router = useRouter();
  const first = userName.trim().split(/\s+/)[0];
  const [slug, setSlug] = useState(active ?? "");
  const [name, setName] = useState(first ? `${first}'s workspace` : "My workspace");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      const target = workspaces.length ? slug : await createWorkspace(name.trim() || "My workspace");
      const { href } = await copyPublicProject(token, target);
      router.push(href);
    } catch (failure) {
      setError(errorText(failure));
      setPending(false);
    }
  };

  return (
    <form
      className="mt-6 grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {workspaces.length > 1 ? (
        <label className="grid gap-1.5 text-sm">
          <span className="text-muted-foreground">Copy it into</span>
          <SelectField value={slug} onValueChange={setSlug} aria-label="Workspace">
            {workspaces.map((w) => (
              <option key={w.slug} value={w.slug}>
                {w.name}
              </option>
            ))}
          </SelectField>
        </label>
      ) : workspaces.length === 0 ? (
        <label className="grid gap-1.5 text-sm">
          <span className="text-muted-foreground">Name your space (where your projects live)</span>
          <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required autoComplete="off" />
        </label>
      ) : null}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div>
        <Button type="submit" disabled={pending || (workspaces.length > 0 && !slug)}>
          <Icon name="copy-linear" />
          {pending ? "Copying…" : workspaces.length === 1 ? `Copy into ${workspaces[0].name}` : "Make my copy"}
        </Button>
      </div>
    </form>
  );
}
