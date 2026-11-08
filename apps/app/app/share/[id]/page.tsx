import { Icon } from "@plotra/icons";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { requireSession } from "@/lib/data";
import { claimShare } from "@/lib/sharing";

export const metadata: Metadata = { title: "Shared project" };

// The link in a sharing email (plan.md 2.9). Signed out, the proxy sends
// people through sign-in first and brings them back here.
export default async function SharePage({ params }: PageProps<"/share/[id]">) {
  const { id } = await params;
  const { user } = await requireSession();
  const invitation = await claimShare(id, user);
  if (invitation.status === "ok") redirect(`/w/${invitation.workspaceSlug}/p/${invitation.projectSlug}`);

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <Logo className="mb-10 text-lg" />
      <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-xs">
        <Icon name="danger-circle-linear" className="size-7 text-muted-foreground" />
        <h1 className="mt-4 text-xl font-semibold tracking-tight">
          {invitation.status === "wrong-account" ? "This was shared with a different address" : "This link no longer works"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {invitation.status === "wrong-account" ? (
            <>
              The invitation went to <span className="text-foreground">{invitation.email}</span>, and you&apos;re signed in as{" "}
              <span className="text-foreground">{user.email}</span>. Sign in with that address, or ask for the project to be shared with this one.
            </>
          ) : (
            "The project may have been deleted, or your access removed. Ask whoever shared it to send it again."
          )}
        </p>
      </div>
      <Link href="/" className="mt-6 text-sm text-muted-foreground hover:text-foreground">
        Go to Plotra
      </Link>
    </main>
  );
}
