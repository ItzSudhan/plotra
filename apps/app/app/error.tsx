"use client";

import Link from "next/link";
import { useEffect } from "react";
import { primaryAction, secondaryAction, StatusPage } from "@/components/public/status-page";

// Anything that breaks below the root layout. The person sees what to do; the
// details go to the console (and the server logs, matched by the digest).

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatusPage
      title="Something went wrong on our side"
      actions={
        <>
          <button type="button" onClick={() => retry()} className={primaryAction}>
            Try again
          </button>
          <Link href="/" className={secondaryAction}>
            Go to your projects
          </Link>
        </>
      }
    >
      <p>Your writing is saved. Try again, and if it keeps happening, reload the page.</p>
    </StatusPage>
  );
}
