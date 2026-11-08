"use client";

import type { ProjectType } from "@plotra/db/schema";
import { Icon } from "@plotra/icons";
import { Button } from "@plotra/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@plotra/ui/components/dialog";
import Link from "next/link";
import { startTransition, useActionState, useRef, useState } from "react";
import { ProjectFields } from "@/components/onboarding/project-fields";
import { SampleCards } from "@/components/onboarding/sample-cards";
import { StarterPicker } from "@/components/onboarding/starter-picker";
import { nav } from "@/components/transitions";
import { createProject } from "@/lib/actions";
import { audienceOf } from "@/lib/starters/catalog";

export function NewProjectDialog({
  workspaceSlug,
  trigger,
}: {
  workspaceSlug: string;
  trigger?: React.ReactNode;
}) {
  const [state, submit, pending] = useActionState(createProject.bind(null, workspaceSlug), null);
  const [type, setType] = useState<ProjectType>("novel");
  const [browse, setBrowse] = useState(false);
  // Read when a starter is picked, so the title already typed isn't lost.
  const form = useRef<HTMLFormElement>(null);
  const typedTitle = () => String(new FormData(form.current ?? undefined).get("title") ?? "");

  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Icon name="add-linear" />
            New project
          </Button>
        )}
      </DialogTrigger>
      {/* The dialog scrolls under a footer that stays put, so "Create project" is always in reach. */}
      <DialogContent className="max-h-[90dvh] gap-0 overflow-y-auto p-0 sm:max-w-xl">
        {/* onSubmit keeps the title filled in when the server returns an error. */}
        <form
          ref={form}
          id="new-project-form"
          className="grid gap-5 p-6 pb-4"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            startTransition(() => submit(formData));
          }}
        >
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>
              Pick what you&apos;re writing; Plotra sets up the right tools. Or{" "}
              <Link href={`/start?w=${workspaceSlug}`} transitionTypes={nav.forward} className="underline underline-offset-4 hover:text-foreground">
                answer a few questions
              </Link>{" "}
              and have it set up around your story.
            </DialogDescription>
          </DialogHeader>
          <ProjectFields type={type} onTypeChange={setType} idPrefix="new-project" autoFocus />
          {state?.error && (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          )}
        </form>
        {/* Outside the form: a starter or a sample is created on its own, not submitted with the fields above. */}
        <div className="border-t px-6 py-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={browse}
            aria-controls="new-project-browse"
            onClick={() => setBrowse((open) => !open)}
            className="-ml-2 text-muted-foreground"
          >
            <Icon name={browse ? "alt-arrow-down-linear" : "alt-arrow-right-linear"} />
            Or start from a starter or a sample
          </Button>
          {browse && (
            <div id="new-project-browse" className="grid gap-5 pt-3 pb-3">
              <div>
                <p className="mb-2 text-ui-sm text-muted-foreground">Starters, with the structure laid out. Your title is kept.</p>
                {/* Keyed by audience, so picking a type shows the starters for it. */}
                <StarterPicker key={audienceOf(type)} workspaceSlug={workspaceSlug} audience={audienceOf(type)} title={typedTitle} />
              </div>
              <div>
                <p className="mb-2 text-ui-sm text-muted-foreground">Samples: a finished project to look around in.</p>
                <SampleCards workspaceSlug={workspaceSlug} />
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="sticky bottom-0 border-t bg-background px-6 py-4">
          <Button type="submit" form="new-project-form" disabled={pending}>
            {pending ? "Creating…" : "Create project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
