import Link from "next/link";
import { primaryAction, StatusPage } from "@/components/public/status-page";

// Any address that isn't a page, and anything that calls notFound() without a
// not-found.tsx of its own nearer by.

export default function NotFound() {
  return (
    <>
      <title>Page not found · Plotra</title>
      <StatusPage
        title="This page isn’t here"
        actions={
          <Link href="/" className={primaryAction}>
            Go to your projects
          </Link>
        }
      >
        <p>The link may be old, or the address mistyped. Your projects are where you left them.</p>
      </StatusPage>
    </>
  );
}
