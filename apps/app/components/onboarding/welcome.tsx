import { Icon } from "@plotra/icons";
import { Button } from "@plotra/ui/components/button";
import Link from "next/link";
import { nav } from "@/components/transitions";
import { SampleCards } from "./sample-cards";

/**
 * What a workspace with no projects shows. A new account doesn't see it first:
 * it lands in the Cold Open (app/start), which this leads back to.
 */
export function Welcome({ workspaceSlug }: { workspaceSlug: string }) {
  return (
    <section className="rounded-xl border border-dashed px-5 py-10 sm:px-8">
      <div className="mx-auto max-w-md text-center">
        <Icon name="folder-with-files-bold-duotone" className="mx-auto size-10 text-ember-ink" />
        <h2 className="mt-4 font-medium">Start a project</h2>
        <p className="mt-1 text-sm text-muted-foreground">Answer a few questions about your story and it is set up around them. You&apos;ll be writing in a minute.</p>
        <Button asChild className="mt-5">
          <Link href={`/start?w=${workspaceSlug}`} transitionTypes={nav.forward}>
            <Icon name="pen-new-square-linear" />
            Start your story
          </Link>
        </Button>
      </div>
      <div className="mx-auto mt-10 max-w-2xl">
        <h3 className="mb-3 text-ui-sm font-medium text-muted-foreground">Or look around a finished one</h3>
        <SampleCards workspaceSlug={workspaceSlug} className="sm:grid-cols-2" />
        <p className="mt-2 text-xs text-faint">A sample is a copy of your own: edit it, break it, delete it.</p>
      </div>
    </section>
  );
}
