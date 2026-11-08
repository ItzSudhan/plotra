import { Icon } from "@plotra/icons";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/logo";
import { CopyProjectForm } from "@/components/public/copy-project-form";
import { PublicNotice } from "@/components/public/public-notice";
import { getSession, listWorkspaces } from "@/lib/data";
import { publicPath } from "@/lib/public-link";
import { openPublicLink } from "@/lib/public-read";

// "Copy this project" from a public link (lib/public-copy-actions.ts): what a
// copy holds, then a workspace to put it in. Open without a session, so a
// reader who has no account yet learns what they'd get before signing up.

// The token is the secret: it must not travel in a Referer header, and the page is nobody's search result.
export const metadata: Metadata = { title: "Copy a project", referrer: "no-referrer", robots: { index: false, follow: false } };

export default async function CopyPage({ params }: PageProps<"/copy/[token]">) {
  const { token } = await params;
  const link = await openPublicLink(token);
  if (link.status === "missing") notFound();
  if (link.status === "limited") return <PublicNotice />;
  const session = await getSession();
  const workspaces = session ? await listWorkspaces() : [];
  const here = `/copy/${link.token}`;
  const notes = link.rows.filter((row) => row.kind !== "folder").length;

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <Logo className="mb-10 text-lg" />
      <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-xs">
        <Icon name="copy-linear" className="size-7 text-ember-ink" />
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-balance">Copy {link.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {notes === 1 ? "1 note" : `${notes} notes`}
          {link.description ? ` · ${link.description}` : ""}
        </p>

        {link.allowCopy ? (
          <>
            <p className="mt-5 text-sm">
              A copy is a project of your own, to change as you like: its notes, folders and story tools (characters, places, the timeline, the plot grid,
              relationships), with their pictures. Not its comments, version history or trash.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">Nothing you do to your copy reaches the original, and the original&apos;s changes don&apos;t reach your copy.</p>
            {session ? (
              <CopyProjectForm
                token={link.token}
                userName={session.user.name}
                workspaces={workspaces.map((w) => ({ slug: w.slug, name: w.name }))}
                active={workspaces.find((w) => w.id === session.session.activeOrganizationId)?.slug ?? workspaces[0]?.slug ?? null}
              />
            ) : (
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link
                  href={`/sign-up?${new URLSearchParams({ callbackURL: here })}`}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Sign up free to copy it
                </Link>
                <Link href={`/sign-in?${new URLSearchParams({ callbackURL: here })}`} className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                  I have an account
                </Link>
              </div>
            )}
          </>
        ) : (
          <p className="mt-5 text-sm text-muted-foreground">Whoever shared this project hasn&apos;t let readers copy it. You can still read it.</p>
        )}
      </div>
      <Link href={publicPath(link.token)} prefetch={false} className="mt-6 text-sm text-muted-foreground hover:text-foreground">
        Back to reading
      </Link>
    </main>
  );
}
