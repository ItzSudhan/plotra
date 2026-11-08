"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Sign in from the plugin store, and come back to the page you were on. */
export function SignInLink({ className, children = "Sign in" }: { className?: string; children?: React.ReactNode }) {
  const path = usePathname() || "/plugins";
  return (
    <Link href={`/sign-in?${new URLSearchParams({ callbackURL: path })}`} className={className}>
      {children}
    </Link>
  );
}
