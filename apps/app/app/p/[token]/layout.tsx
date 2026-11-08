import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicNotice } from "@/components/public/public-notice";
import { PublicShell } from "@/components/public/public-shell";
import { openPublicLink } from "@/lib/public-read";

// The public reader behind a project's read-only link (plan.md 2.9). No
// session: the token in the URL is the only key, checked on every request
// (lib/public-read.ts). It reads the request's address for the rate limit, so
// it is always rendered per request and never cached.

// Where the server is reached, so the cards' addresses are whole URLs.
const appUrl = process.env.BETTER_AUTH_URL ? new URL(process.env.BETTER_AUTH_URL) : undefined;

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const link = await openPublicLink((await params).token);
  // The token is the secret, so it must not travel in a Referer header to a
  // site a note links to or loads an image from.
  const base: Metadata = { referrer: "no-referrer", robots: { index: false, follow: false }, metadataBase: appUrl };
  if (link.status !== "ok") return base;
  return {
    ...base,
    title: { default: link.title, template: `%s · ${link.title}` },
    description: link.description ?? undefined,
    // The picture itself is opengraph-image.tsx beside this file, and one per note.
    openGraph: { type: "website", siteName: "Plotra", title: link.title, description: link.description ?? undefined },
    twitter: { card: "summary_large_image" },
  };
}

export default async function PublicLayout({ children, params }: Props & { children: React.ReactNode }) {
  const link = await openPublicLink((await params).token);
  // A link that is switched off and one that never existed are the same page.
  if (link.status === "missing") notFound();
  if (link.status === "limited") return <PublicNotice />;
  return (
    // Where readers report a link that breaks the rules: whoever runs this server, when they've said where.
    <PublicShell token={link.token} title={link.title} tree={link.tree} allowCopy={link.allowCopy} asOf={link.asOf?.title} reportEmail={process.env.REPORT_EMAIL || undefined}>
      {children}
    </PublicShell>
  );
}
