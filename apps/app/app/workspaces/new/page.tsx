import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { nav } from "@/components/transitions";
import { CreateWorkspaceForm } from "@/components/workspace/create-workspace-form";
import { listWorkspaces } from "@/lib/data";

export const metadata: Metadata = { title: "New workspace" };

export default async function NewWorkspacePage() {
  const workspaces = await listWorkspaces();
  // A first workspace is named in the Cold Open, which goes straight on to the first project.
  if (workspaces.length === 0) redirect("/start");

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <Logo className="mb-10 text-lg" />
      <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-xs">
        <h1 className="text-xl font-semibold tracking-tight">New workspace</h1>
        <p className="mt-1 mb-6 text-sm text-muted-foreground">A workspace holds your projects and the people you write with.</p>
        <CreateWorkspaceForm />
      </div>
      <Link href="/" transitionTypes={nav.back} className="mt-6 text-sm text-muted-foreground hover:text-foreground">
        Cancel
      </Link>
    </main>
  );
}
