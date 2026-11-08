import Link from "next/link";
import { primaryAction, secondaryAction, StatusPage } from "./status-page";

/** Where "Go to Plotra" points: the project's website when the instance names one. */
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "/";

/**
 * A read-only link that doesn't open: switched off, replaced by a new one, or
 * never real. All three look the same (lib/public-read.ts), so this says what
 * the reader can do about any of them.
 */
export function LinkGone() {
  return (
    <StatusPage
      title="This link isn’t working"
      actions={
        <>
          <Link href="/worlds" className={primaryAction}>
            Browse worlds
          </Link>
          <a href={siteUrl} className={secondaryAction}>
            Go to Plotra
          </a>
        </>
      }
    >
      <p>The writer may have switched it off or made a new one. Ask them for a fresh link.</p>
    </StatusPage>
  );
}
