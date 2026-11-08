import { Icon } from "@plotra/icons";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StoreActions } from "@/components/plugins/store-actions";
import { PublicNotice } from "@/components/public/public-notice";
import { getSession } from "@/lib/data";
import { isOfficialSlug } from "@/lib/official-plugins";
import { accessLabel, categoryLabel } from "@/lib/plugin-store";
import { isLocalMode } from "@/lib/local-mode";
import { storeUrl, StoreUnreachable } from "@/lib/plugin-store-remote";
import { openStoreListing } from "@/lib/plugin-store-source";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { plural } from "@/lib/plural";

// One plugin in the store (lib/plugin-store-source.ts; plotra.ink's in the desktop app): what it does, who made
// it, what it may do, its versions, and its code in full, before anyone
// installs it. A listing taken down reads as not found, to all but its author.

type Props = { params: Promise<{ slug: string }> };

const day = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" });
const size = (characters: number) => (characters < 1000 ? `${characters} characters` : `${Math.round(characters / 100) / 10} KB`);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const listing = await openStoreListing((await params).slug, null).catch(() => null);
  return listing ? { title: `${listing.name} · Plugins`, description: listing.summary } : { title: "Plugins" };
}

export default async function PluginPage({ params }: Props) {
  const [{ ok }, { slug }, session] = await Promise.all([clientIp().then((ip) => checkRateLimit("plugin-store", ip, { limit: 120, windowSeconds: 60 })), params, getSession()]);
  if (!ok) return <PublicNotice inFrame />;
  let listing;
  try {
    listing = await openStoreListing(slug, session?.user.id ?? null);
  } catch (error) {
    if (!(error instanceof StoreUnreachable)) throw error;
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 text-sm text-muted-foreground sm:px-6">
        <p role="status">
          {error.message}{" "}
          Plugins you have keep working.
        </p>
        <Link href="/plugins" className="mt-4 inline-flex items-center gap-1 text-ui-sm hover:text-foreground">
          <Icon name="arrow-left-linear" className="size-3.5" />
          All plugins
        </Link>
      </main>
    );
  }
  if (!listing) notFound();
  const latest = listing.releases[0];
  // Plotra's own (lib/official-plugins): shipped with the app.
  const official = isOfficialSlug(listing.slug);
  const reportEmail = process.env.REPORT_EMAIL;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
      <Link href="/plugins" className="inline-flex items-center gap-1 text-ui-sm text-muted-foreground hover:text-foreground">
        <Icon name="arrow-left-linear" className="size-3.5" />
        All plugins
      </Link>

      <header className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-3xl tracking-tight">{listing.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{listing.summary}</p>
          <p className="mt-2 flex flex-wrap gap-x-2 text-xs text-faint">
            <span className="inline-flex items-center gap-1">
              {official && <Icon name="verified-check-linear" className="size-3.5 text-ember-ink" />}
              By {listing.author}
            </span>
            {latest && <span>· Version {latest.version}</span>}
            <span>· {categoryLabel(listing.category)}</span>
            {!(official && isLocalMode) && (
              <span>
                · {listing.installs} {plural(listing.installs, "install")}
              </span>
            )}
            <span>· Updated {day.format(listing.updatedAt)}</span>
          </p>
        </div>
        {latest && (
          <StoreActions
            slug={listing.slug}
            name={listing.name}
            access={latest.access}
            version={latest.version}
            releaseId={latest.id}
            signedIn={!!session}
            mine={listing.mine}
            withdrawn={listing.withdrawn}
            installed={listing.installed}
          />
        )}
      </header>

      {listing.withdrawn && (
        <p className="mt-6 rounded-lg border border-dashed px-4 py-3 text-ui-sm text-muted-foreground">
          {listing.mine ? "This plugin isn't in the store: you took it out, or it was taken down after a report." : "Its author took this plugin out of the store. Copies already installed keep working."}
        </p>
      )}

      <section className="mt-8 grid gap-2 rounded-lg border bg-card p-4 text-ui-sm">
        <h2 className="flex items-center gap-1.5 font-medium">
          <Icon name={listing.access === "read" ? "eye-linear" : "pen-linear"} className="size-4" />
          {accessLabel(listing.access)}
        </h2>
        <p className="text-muted-foreground">
          {listing.access === "read"
            ? "It can read and search the notes in the project you have open. Plotra stops it from changing anything."
            : "It can read, add and change notes in the project you have open, as you could. Plotra keeps the earlier text of anything it changes, so you can go back."}
        </p>
        <p className="text-muted-foreground">
          Plotra makes sure of this for every plugin: it only sees the project you have open, never your other projects or your account, and it can&apos;t send anything over the internet. You can switch it off or remove it at any time in Your settings → Plugins.
        </p>
      </section>

      {listing.about && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-medium">About</h2>
          <div className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">{listing.about}</div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-medium">Versions</h2>
        <ul className="divide-y rounded-lg border bg-card text-ui-sm">
          {listing.releases.map((release) => (
            <li key={release.id} className="grid gap-1 px-3 py-2.5">
              <p className="flex flex-wrap items-center gap-x-2">
                <span className="font-medium">{release.version}</span>
                <span className="text-xs text-faint">
                  {day.format(release.createdAt)} · {size(release.size)}
                  {release.access === "read" ? " · reads only" : ""}
                </span>
              </p>
              {release.notes && <p className="whitespace-pre-wrap text-muted-foreground">{release.notes}</p>}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <details className="group rounded-lg border bg-card">
          <summary className="flex cursor-pointer items-center gap-1.5 px-3 py-2.5 text-sm font-medium">
            <Icon name="code-linear" className="size-4" />
            Show its code (for programmers){latest ? `, version ${latest.version}` : ""}
          </summary>
          <pre className="max-h-[32rem] overflow-auto border-t px-3 py-2.5 font-mono text-meta leading-relaxed whitespace-pre">{listing.code}</pre>
        </details>
      </section>

      {isLocalMode && (
        <p className="mt-8 text-xs text-faint">
          Does this plugin do something it shouldn&apos;t?{" "}
          <a href={`${storeUrl()}/plugins/${listing.slug}`} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-foreground">
            Report it on plotra.ink
          </a>
          .
        </p>
      )}
      {reportEmail && !isLocalMode && !listing.mine && (
        <p className="mt-8 text-xs text-faint">
          Does this plugin do something it shouldn&apos;t?{" "}
          <a
            href={`mailto:${reportEmail}?${new URLSearchParams({ subject: `Plugin report: ${listing.slug}`, body: `The plugin at /plugins/${listing.slug} (version ${latest?.version ?? "?"}):\n\n` })
              .toString()
              .replace(/\+/g, "%20")}`}
            className="underline underline-offset-4 hover:text-foreground"
          >
            Report it
          </a>
          .
        </p>
      )}
    </main>
  );
}
