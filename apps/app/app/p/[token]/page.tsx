import { Icon } from "@plotra/icons";
import Link from "next/link";
import { notFound } from "next/navigation";
import { nav } from "@/components/transitions";
import { firstDocument, publicPath } from "@/lib/public-link";
import { openPublicLink } from "@/lib/public-read";
import { nodeKindMeta } from "@/lib/tree";

// The front page of a read-only link: what the project is, and where to start.

export default async function PublicProjectPage({ params }: { params: Promise<{ token: string }> }) {
  const link = await openPublicLink((await params).token);
  if (link.status === "missing") notFound();
  // The layout shows the notice.
  if (link.status === "limited") return null;
  const first = firstDocument(link.tree);

  return (
    <article className="mx-auto w-full max-w-2xl">
      <h1 className="font-display text-4xl leading-tight tracking-tight text-balance">{link.title}</h1>
      {link.description && <p className="mt-3 font-prose text-lg text-muted-foreground">{link.description}</p>}
      {first && (
        <Link
          href={publicPath(link.token, first.id)}
          prefetch={false}
          transitionTypes={nav.forward}
          className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-ember-ink underline-offset-4 hover:underline"
        >
          Start reading: {first.title || "Untitled"}
          <Icon name="arrow-right-linear" className="size-4" />
        </Link>
      )}
      {link.tree.length > 0 ? (
        <ul className="mt-8 divide-y rounded-lg border text-sm">
          {link.tree.map((n) => (
            <li key={n.id}>
              <Link href={publicPath(link.token, n.id)} prefetch={false} transitionTypes={nav.forward} className="flex items-center gap-2 px-3 py-2.5 hover:bg-accent/60">
                <Icon name={nodeKindMeta[n.kind].icon} className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{n.title || "Untitled"}</span>
                {n.children.length > 0 && (
                  <span className="text-xs text-faint">
                    {n.children.length}
                    <span className="sr-only"> inside</span>
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-8 text-sm text-muted-foreground">Nothing has been written here yet.</p>
      )}
    </article>
  );
}
