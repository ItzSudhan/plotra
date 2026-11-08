"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";
import { errorText } from "@/lib/errors";

/**
 * Runs a server action, toasts its error if it throws, and refreshes the page
 * data when it succeeds. Resolves to `{ value }` on success and null on
 * failure. `pending` covers the action and the refresh.
 */
export function useRun() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [refreshing, startTransition] = useTransition();

  const run = useCallback(
    async <T,>(fn: () => Promise<T>, success?: string): Promise<{ value: T } | null> => {
      setBusy(true);
      try {
        const result = await fn();
        if (success) toast.success(success);
        startTransition(() => router.refresh());
        return { value: result };
      } catch (error) {
        toast.error(errorText(error));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [router],
  );

  return { run, pending: busy || refreshing };
}
