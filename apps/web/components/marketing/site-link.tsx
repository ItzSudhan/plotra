import Link from "next/link";

/**
 * One link component for the nav and the footer: pages of this site go through
 * the router, everything else (the app, the docs, GitHub) is a plain anchor.
 */
export function SiteLink({
  href,
  children,
  ...rest
}: { href: string; children: React.ReactNode } & Omit<React.ComponentProps<"a">, "href">) {
  if (/^(https?:|mailto:)/.test(href)) {
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} {...rest}>
      {children}
    </Link>
  );
}
