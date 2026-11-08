"use client";

import { signOut } from "@plotra/auth/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** "Not you?" on the desktop app's sign-in page: signs this browser out and comes back to the same page, through sign-in. */
export function OtherAccount({ callbackURL }: { callbackURL: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <p className="text-sm text-muted-foreground">
      Not you?{" "}
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await signOut().catch(() => {});
          router.push(`/sign-in?${new URLSearchParams({ callbackURL })}`);
          router.refresh();
        }}
        className="text-black underline decoration-black/20 underline-offset-4 transition-colors hover:decoration-black disabled:opacity-50"
      >
        Use another account
      </button>
    </p>
  );
}
