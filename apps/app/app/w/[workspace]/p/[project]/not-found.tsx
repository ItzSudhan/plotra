"use client";

import { Icon } from "@plotra/icons";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Logo } from "@/components/logo";
import { primaryAction, StatusPage } from "@/components/public/status-page";

// A project that isn't there, or isn't this person's to open (lib/data.ts
// requireProject answers both the same way, so neither gives the other away).

export default function ProjectNotFound() {
  const { workspace } = useParams<{ workspace: string }>();
  const home = `/w/${workspace}`;

  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-sidebar px-3">
        <Link href={home} aria-label="Back to your projects" className="flex items-center gap-2 rounded-md px-1 text-ui-sm text-muted-foreground hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">
          <Icon name="arrow-left-linear" className="size-4" />
          <Logo />
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center">
        <StatusPage
          fill={false}
          title="This project isn’t here"
          actions={
            <Link href={home} className={primaryAction}>
              Go to your projects
            </Link>
          }
        >
          <p>It may have been deleted, or you may no longer have access. If someone shared it with you, ask them to invite you again.</p>
        </StatusPage>
      </main>
    </div>
  );
}
