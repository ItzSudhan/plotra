import { Icon } from "@plotra/icons";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { PublicDoc } from "@/components/public/public-doc";
import { nav } from "@/components/transitions";
import { fromReader, hasContent, publicPath, readingOrder } from "@/lib/public-link";
import { noteDescription } from "@/lib/public-card";
import { loadPublicNote, openPublicLink } from "@/lib/public-read";
import { nodeKindMeta } from "@/lib/tree";

// One note of a read-only link. The note id comes from the URL, so it is only
// ever looked up inside the project the token resolved to (lib/public-read.ts):
// another project's note, a trashed one and a made-up id are all the same 404.

type Props = { params: Promise<{ token: string; nodeId: string }> };

// Once per request, for the metadata and the page.
const load = cache(async (token: string, nodeId: string) => {
  const link = await openPublicLink(token);
  if (link.status !== "ok") return { link, note: null };
  return { link, note: await loadPublicNote(link, nodeId) };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token, nodeId } = await params;
  const { link, note } = await load(token, nodeId);
  if (!note || link.status !== "ok") return {};
  const title = note.title || "Untitled";
  const description = noteDescription(note);
  return {
    title,
    description,
    // The picture itself is opengraph-image.tsx beside this file.
    openGraph: { type: "article", siteName: "Plotra", title: `${title} · ${link.title}`, description },
    twitter: { card: "summary_large_image" },
  };
}

export default async function PublicNotePage({ params }: Props) {
  const { token, nodeId } = await params;
  const { link, note } = await load(token, nodeId);
  if (link.status === "missing") notFound();
  // The layout shows the notice.
  if (link.status === "limited") return null;
  if (!note) notFound();
  const written = hasContent(note.value);
  // Previous and next in binder order; at the last note, the end of the project.
  const order = readingOrder(link.tree);
  const at = order.findIndex((n) => n.id === note.id);
  const previous = at > 0 ? order[at - 1] : null;
  const next = at >= 0 && at < order.length - 1 ? order[at + 1] : null;
  const last = at >= 0 && at === order.length - 1;

  return (
    <article className="mx-auto w-full max-w-2xl">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon name={nodeKindMeta[note.kind].icon} className="size-4" />
        {note.kindLabel}
      </p>
      <h1 className="mt-1 font-display text-4xl leading-tight tracking-tight text-balance">{note.title || "Untitled"}</h1>
      {note.synopsis && <p className="mt-3 font-prose text-lg text-muted-foreground italic">{note.synopsis}</p>}

      {note.tags.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
          {note.tags.map((tag) => (
            <li key={tag} className="rounded-full bg-muted px-2 py-0.5">
              #{tag}
            </li>
          ))}
        </ul>
      )}

      {note.properties.length > 0 && (
        <dl className="mt-5 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1.5 rounded-lg border bg-card px-4 py-3 text-sm">
          {note.properties.map((p) => (
            <div key={p.label} className="contents">
              <dt className="text-muted-foreground">{p.label}</dt>
              <dd className="min-w-0 break-words">
                {p.links ? (
                  p.links.map((l, i) => (
                    <span key={l.href}>
                      {i > 0 && ", "}
                      <Link href={l.href} prefetch={false} className="text-ember-ink underline-offset-2 hover:underline">
                        {l.title || "Untitled"}
                      </Link>
                    </span>
                  ))
                ) : p.url ? (
                  <a href={p.url} target="_blank" rel="noreferrer noopener nofollow" className="break-all text-ember-ink underline-offset-2 hover:underline">
                    {p.url}
                  </a>
                ) : (
                  p.text
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {note.board ? (
        <div className="mt-8 rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          <p>
            This {note.kindLabel.toLowerCase()} is a board of cards, and boards can&apos;t be shown on a shared page yet.
            {note.children.length > 0 ? " What it holds is listed below." : " The rest of the project reads as normal."}
          </p>
          {link.allowCopy && (
            <p className="mt-2">
              To see the board,{" "}
              <Link href={`/copy/${link.token}`} prefetch={false} className="font-medium text-ember-ink underline-offset-4 hover:underline">
                copy this project
              </Link>{" "}
              into Plotra, free.
            </p>
          )}
        </div>
      ) : written ? (
        <div className="mt-8">
          <PublicDoc value={note.value} base={publicPath(link.token)} format={note.format} />
        </div>
      ) : (
        note.children.length === 0 && <p className="mt-8 text-sm text-muted-foreground">Nothing written here yet.</p>
      )}

      {note.children.length > 0 && (
        <ul className="mt-8 divide-y rounded-lg border text-sm">
          {note.children.map((child) => (
            <li key={child.id}>
              <Link href={publicPath(link.token, child.id)} prefetch={false} transitionTypes={nav.forward} className="flex items-center gap-2 px-3 py-2.5 hover:bg-accent/60">
                <Icon name={nodeKindMeta[child.kind].icon} className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{child.title || "Untitled"}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {(previous || next) && (
        <nav aria-label="Reading order" className="mt-12 flex items-start justify-between gap-4 border-t pt-4 text-sm">
          {previous ? (
            <Link href={publicPath(link.token, previous.id)} prefetch={false} transitionTypes={nav.back} className="group grid min-w-0 gap-0.5">
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Icon name="arrow-left-linear" className="size-3.5" />
                Previous
              </span>
              <span className="truncate group-hover:text-ember-ink">{previous.title || "Untitled"}</span>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link href={publicPath(link.token, next.id)} prefetch={false} transitionTypes={nav.forward} className="group grid min-w-0 gap-0.5 text-right">
              <span className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                Next
                <Icon name="arrow-right-linear" className="size-3.5" />
              </span>
              <span className="truncate group-hover:text-ember-ink">{next.title || "Untitled"}</span>
            </Link>
          )}
        </nav>
      )}

      {last && (
        <aside className="mt-10 rounded-xl border bg-card px-5 py-5">
          <p className="font-display text-xl tracking-tight">That&apos;s everything in {link.title}, for now.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            It was written in Plotra: a free, open-source place to write a story and build its world, alone or with friends.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            {link.allowCopy && (
              <Link href={`/copy/${link.token}`} prefetch={false} className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 font-medium hover:bg-accent">
                <Icon name="copy-linear" className="size-4" />
                Copy this project
              </Link>
            )}
            <Link href={fromReader("/sign-up", "the-end")} className="font-medium text-ember-ink underline-offset-4 hover:underline">
              Start your own project
            </Link>
          </div>
        </aside>
      )}
    </article>
  );
}
