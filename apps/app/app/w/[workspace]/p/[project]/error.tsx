"use client";

import { Icon } from "@plotra/icons";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { Logo } from "@/components/logo";
import { primaryAction, secondaryAction, StatusPage } from "@/components/public/status-page";

// When a project breaks while opening or while open. The rest of the app stays
// (the root layout, its theme and toasts), with a way back to the workspace.

export default function ProjectError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const { workspace } = useParams<{ workspace: string }>();
  const home = `/w/${workspace}`;
  useEffect(() => {
    console.error(error);
  }, [error]);

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
          title="This project couldn’t open"
          actions={
            <>
              <button type="button" onClick={() => retry()} className={primaryAction}>
                Try again
              </button>
              <a href={home} className={secondaryAction}>
                Go to your projects
              </a>
            </>
          }
        >
          <p>Something went wrong on our side. Your writing is saved: nothing you wrote is lost.</p>
        </StatusPage>
      </main>
    </div>
  );
}
