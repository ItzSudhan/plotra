"use client";

import { authClient } from "@plotra/auth/client";
import { Button } from "@plotra/ui/components/button";
import { Input } from "@plotra/ui/components/input";
import { Label } from "@plotra/ui/components/label";
import { useRouter } from "next/navigation";
import { useActionState, useState, useSyncExternalStore } from "react";
import { authErrorText } from "@/lib/auth-errors";
import { slugify } from "@/lib/slug";

const noop = () => () => {};
/** This server's address ("app.plotra.ink", "localhost:3000"): right on any instance, the desktop app included. */
export const useHost = () => useSyncExternalStore(noop, () => window.location.host, () => "");

export function CreateWorkspaceForm() {
  const router = useRouter();
  const host = useHost();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  // The address follows the name; most people never need to see it.
  const [changing, setChanging] = useState(false);
  const effectiveSlug = slugEdited ? slug : slugify(name);

  const [error, submit, pending] = useActionState(async () => {
    if (!effectiveSlug) {
      setChanging(true);
      return "Choose a web address for your workspace: letters, numbers and dashes.";
    }
    const { error } = await authClient.organization.create({ name: name.trim(), slug: effectiveSlug });
    if (error) {
      // Most often the address is taken: show it, so it can be changed.
      setChanging(true);
      return authErrorText(error, "Couldn't create the workspace. Try again in a moment.");
    }
    router.push(`/w/${effectiveSlug}`);
    router.refresh();
    return null;
  }, null);

  return (
    <form action={submit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="name">Workspace name</Label>
        <Input
          id="name"
          name="name"
          placeholder="Ember Street Writers' Room"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          required
          autoFocus
        />
      </div>
      {changing ? (
        <div className="grid gap-2">
          <Label htmlFor="slug">Web address</Label>
          <div className="flex items-center rounded-md border border-input bg-transparent shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30">
            <span aria-hidden className="pl-3 text-sm text-muted-foreground">
              {host}/w/
            </span>
            <input
              id="slug"
              name="slug"
              aria-describedby="slug-hint"
              className="h-9 min-w-0 flex-1 bg-transparent pr-3 text-sm outline-none"
              value={effectiveSlug}
              onChange={(e) => {
                setSlugEdited(true);
                setSlug(slugify(e.target.value));
              }}
              required
            />
          </div>
          <p id="slug-hint" className="text-xs text-muted-foreground">
            Letters, numbers and dashes. It&apos;s in every link to the workspace, and can be changed later.
          </p>
        </div>
      ) : (
        <p className="flex flex-wrap items-center gap-x-2 text-ui-sm text-muted-foreground">
          <span className="min-w-0 break-all">
            Web address: {host}/w/<span className="text-foreground">{effectiveSlug || "…"}</span>
          </span>
          <Button type="button" variant="link" size="sm" className="h-8 px-0" onClick={() => setChanging(true)}>
            Change
          </Button>
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create workspace"}
      </Button>
    </form>
  );
}
