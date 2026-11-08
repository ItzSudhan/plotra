import { Icon } from "@plotra/icons";
import type { Metadata } from "next";
import Link from "next/link";
import { PublicNotice } from "@/components/public/public-notice";
import { getSession } from "@/lib/data";
import { accessLabel, categoryLabel, isPluginCategory, pluginCategories } from "@/lib/plugin-store";
import { isLocalMode } from "@/lib/local-mode";
import type { StoreEntry, StoreSort } from "@/lib/plugin-store-read";
import { StoreUnreachable } from "@/lib/plugin-store-remote";
import { browseOfficial, browseStore } from "@/lib/plugin-store-source";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

// The plugin store's front page (lib/plugin-store-source.ts): every listing
// that isn't withdrawn or taken down, searched by name and summary, in a
// category, most installed or newest first. In the desktop app it's
// plotra.ink's store, over the network. Per request, for the rate limit.

export const metadata: Metadata = {
  title: "Plugins",
  description: "Extra tools for Plotra, made by the people who write with it.",
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

export default async function PluginStorePage({ searchParams }: Props) {
  const [{ ok }, params, session] = await Promise.all([clientIp().then((ip) => checkRateLimit("plugin-store", ip, { limit: 120, windowSeconds: 60 })), searchParams, getSession()]);
  if (!ok) return <PublicNotice inFrame />;
  const query = one(params.q).slice(0, 100);
  const category = isPluginCategory(one(params.category)) ? one(params.category) : "";
  const sort: StoreSort = one(params.sort) === "new" ? "new" : "popular";
  // Plotra's own ship with the app, so they show even when the store can't be reached.
  const official = await browseOfficial({ query, category, sort });
  let entries: StoreEntry[] = [];
  // What went wrong, in words (lib/plugin-store-remote.ts): offline, or the store busy.
  let unreachable: string | null = null;
  try {
    entries = await browseStore({ query, category, sort });
  } catch (error) {
    if (!(error instanceof StoreUnreachable)) throw error;
    unreachable = error.message;
  }

  const href = (change: Record<string, string>) => {
    const next = new URLSearchParams({ ...(query && { q: query }), ...(category && { category }), ...(sort === "new" && { sort }), ...change });
    for (const [key, value] of [...next]) if (!value) next.delete(key);
    const text = next.toString();
    return text ? `/plugins?${text}` : "/plugins";
  };

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl tracking-tight">Plugins</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Plugins add extra tools to Plotra: a new command, a panel beside your writing, another way to export. They&apos;re made by people who write with Plotra. A plugin only sees the project you have open and can&apos;t reach the internet, and you can switch it off or remove it at any time.
            {isLocalMode && " These are the plugins on plotra.ink; what you install works here, offline too."}
          </p>
        </div>
        {session && (
          <Link href="/settings#plugins" className="text-sm font-medium text-ember-ink underline-offset-4 hover:underline">
            Your plugins
          </Link>
        )}
      </header>

      <form action="/plugins" className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative min-w-56 flex-1">
          <span className="sr-only">Search plugins</span>
          <Icon name="magnifer-linear" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-faint" />
          <input
            name="q"
            defaultValue={query}
            placeholder="Search plugins"
            className="h-9 w-full rounded-md border border-input bg-transparent pr-3 pl-8 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
          />
        </label>
        {category && <input type="hidden" name="category" value={category} />}
        {sort === "new" && <input type="hidden" name="sort" value="new" />}
      </form>

      <nav aria-label="Categories" className="mb-6 flex flex-wrap items-center gap-1.5 text-ui-sm">
        {[{ id: "", label: "All" }, ...pluginCategories].map((c) => (
          <Link
            key={c.id || "all"}
            href={href({ category: c.id })}
            aria-current={category === c.id ? "page" : undefined}
            className="rounded-full border px-3 py-1 text-muted-foreground hover:text-foreground aria-[current=page]:border-foreground/30 aria-[current=page]:bg-accent aria-[current=page]:text-foreground"
          >
            {c.label}
          </Link>
        ))}
        <span className="ml-auto flex gap-3 text-muted-foreground">
          <Link href={href({ sort: "" })} aria-current={sort === "popular" ? "page" : undefined} className="hover:text-foreground aria-[current=page]:text-foreground">
            Most installed
          </Link>
          <Link href={href({ sort: "new" })} aria-current={sort === "new" ? "page" : undefined} className="hover:text-foreground aria-[current=page]:text-foreground">
            Newest
          </Link>
        </span>
      </nav>

      {official.length > 0 && (
        <section aria-labelledby="official" className="mb-8">
          <h2 id="official" className="mb-3 flex items-center gap-1.5 text-sm font-medium">
            <Icon name="verified-check-linear" className="size-4 text-ember-ink" />
            Made by Plotra
          </h2>
          <Cards entries={official} official />
        </section>
      )}

      <section aria-labelledby="community">
        <h2 id="community" className="mb-3 text-sm font-medium">
          From people who write with Plotra
        </h2>
        {unreachable ? (
          <p role="status" className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
            {unreachable}{" "}
            Plugins you have keep working.
          </p>
        ) : entries.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
            {query || category ? "No plugins from the community match that." : isLocalMode ? "None yet." : "None yet. Made one? Publish it from Your settings → Plugins."}
          </p>
        ) : (
          <Cards entries={entries} />
        )}
      </section>
    </main>
  );
}

function Cards({ entries, official = false }: { entries: StoreEntry[]; official?: boolean }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map((entry) => (
        <li key={entry.slug}>
          <Link href={`/plugins/${entry.slug}`} prefetch={false} className="group flex h-full flex-col rounded-xl border bg-card p-4 transition-colors hover:border-foreground/20">
            <div className="flex items-center gap-2">
              <Icon name="plug-circle-linear" className="size-6 shrink-0 text-ember-ink" />
              <h3 className="min-w-0 truncate font-medium">{entry.name}</h3>
              {entry.version && <span className="ml-auto shrink-0 text-xs text-faint">{entry.version}</span>}
            </div>
            <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{entry.summary}</p>
            <p className="mt-auto flex flex-wrap items-center gap-x-2 pt-3 text-xs text-faint">
              {!official && <span>{entry.author} ·</span>}
              <span>{categoryLabel(entry.category)}</span>
              <span className="inline-flex items-center gap-1">
                · <Icon name={entry.access === "read" ? "eye-linear" : "pen-linear"} className="size-3.5" />
                {accessLabel(entry.access)}
              </span>
              {!(official && isLocalMode) && (
                <span className="inline-flex items-center gap-1">
                  · <Icon name="download-linear" className="size-3.5" />
                  {entry.installs}
                  <span className="sr-only">{entry.installs === 1 ? " install" : " installs"}</span>
                </span>
              )}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
