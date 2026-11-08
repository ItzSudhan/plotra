import { Icon } from "@plotra/icons";
import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { PublicNotice } from "@/components/public/public-notice";
import { listGallery } from "@/lib/gallery";
import { fromReader, publicPath } from "@/lib/public-link";
import { projectTypeMeta } from "@/lib/project-types";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

// The public gallery of worlds and stories (lib/gallery.ts): every read-only
// link whose owners listed it, to browse without an account. Per request, as
// the public reader is, for the rate limit.

export const metadata: Metadata = {
  title: "Worlds and stories made with Plotra",
  description: "Campaign wikis, story bibles and stories their writers chose to share, to read without an account.",
};

const updated = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" });

export default async function GalleryPage() {
  const { ok } = await checkRateLimit("gallery", await clientIp(), { limit: 120, windowSeconds: 60 });
  if (!ok) return <PublicNotice />;
  const entries = await listGallery();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Logo className="mb-6 text-lg" />
          <h1 className="font-display text-4xl tracking-tight">Worlds and stories</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Campaign wikis, story bibles and stories their writers chose to share. Each opens without an account; some show a world only as far as its readers have got.
          </p>
        </div>
        <Link href={fromReader("/sign-up", "sign-up")} className="text-sm font-medium text-ember-ink underline-offset-4 hover:underline">
          Start your own
        </Link>
      </header>
      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Nothing to read here yet</p>
          <p className="mt-1">When writers choose to share a world or a story with everyone, it appears here. Come back soon, or start one of your own.</p>
          <Link
            href={fromReader("/sign-up", "sign-up")}
            className="mt-4 inline-flex h-9 items-center rounded-md bg-primary px-4 font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            Start your own
          </Link>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((entry) => {
            const meta = projectTypeMeta[entry.type];
            return (
              <li key={entry.token}>
                <Link href={publicPath(entry.token)} prefetch={false} className="group flex h-full flex-col rounded-xl border bg-card p-4 transition-colors hover:border-foreground/20">
                  <Icon name={meta.icon} className="size-7 text-ember-ink" />
                  <h2 className="mt-4 line-clamp-2 font-medium">{entry.title}</h2>
                  {entry.description && <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{entry.description}</p>}
                  <p className="mt-auto pt-3 text-xs text-faint">
                    {meta.label}
                    {entry.name ? ` · ${entry.name}` : ""}
                    {entry.asOf ? ` · as of ${entry.asOf}` : ""} · {updated.format(entry.updatedAt)}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
