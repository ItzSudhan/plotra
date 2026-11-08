"use client";

import { primaryAction, StatusPage } from "./status-page";

/** Shown instead of the page when one address asks for too much too fast. `inFrame` under a page's own header. */
export function PublicNotice({ inFrame = false }: { inFrame?: boolean }) {
  const page = (
    <StatusPage
      fill={!inFrame}
      title="That’s a lot in a short time"
      actions={
        <button type="button" onClick={() => window.location.reload()} className={primaryAction}>
          Try again
        </button>
      }
    >
      <p>To keep things running for everyone, we pause busy connections for a moment. Wait a minute, then try again.</p>
    </StatusPage>
  );
  return inFrame ? <main className="flex flex-1 items-center justify-center">{page}</main> : page;
}
