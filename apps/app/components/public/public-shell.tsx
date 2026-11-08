"use client";

import { Icon } from "@plotra/icons";
import { cn } from "@plotra/ui/lib/utils";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LogoMark } from "@/components/logo";
import { NoteSkeleton } from "@/components/skeletons";
import { nav } from "@/components/transitions";
import { fromReader, publicPath, type PublicTreeNode } from "@/lib/public-link";
import { nodeKindMeta } from "@/lib/tree";
import { ThemeMenu } from "./theme-menu";

// The frame of the public reader (plan.md 2.9): a header, the binder on the
// left and the selected note on the right. Nothing here can change anything:
// no editor, no comments, no presence, no connection to the collab server.

/** Where "Made with Plotra" points: the project's website when the instance names one. */
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "/";

function Branch({
  nodes,
  token,
  selected,
  depth,
  closed,
  toggle,
  onNavigate,
}: {
  nodes: PublicTreeNode[];
  token: string;
  selected: string | undefined;
  depth: number;
  closed: Set<string>;
  toggle: (id: string) => void;
  onNavigate: (id: string) => void;
}) {
  return (
    <ul>
      {nodes.map((n) => {
        const open = !closed.has(n.id);
        return (
          <li key={n.id}>
            <div
              className={cn(
                "flex items-center rounded-md text-sm",
                n.id === selected ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
              style={{ paddingLeft: depth * 12 }}
            >
              {n.children.length ? (
                <button
                  type="button"
                  onClick={() => toggle(n.id)}
                  aria-expanded={open}
                  aria-label={`${open ? "Collapse" : "Expand"} ${n.title}`}
                  className="grid size-7 shrink-0 place-items-center rounded text-faint hover:text-foreground pointer-coarse:size-9"
                >
                  <Icon name={open ? "alt-arrow-down-linear" : "alt-arrow-right-linear"} className="size-3.5" />
                </button>
              ) : (
                <span className="size-7 shrink-0 pointer-coarse:size-9" />
              )}
              {/* No prefetch: every note is a database read, and a long binder would ask for all of them. */}
              <Link
                href={publicPath(token, n.id)}
                prefetch={false}
                onNavigate={() => onNavigate(n.id)}
                aria-current={n.id === selected ? "page" : undefined}
                className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 pr-2 pointer-coarse:py-2.5"
              >
                <Icon name={nodeKindMeta[n.kind].icon} className="size-4 shrink-0" />
                <span className="truncate">{n.title || "Untitled"}</span>
              </Link>
            </div>
            {open && n.children.length > 0 && (
              <Branch nodes={n.children} token={token} selected={selected} depth={depth + 1} closed={closed} toggle={toggle} onNavigate={onNavigate} />
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** A mail to whoever runs the server about this page, with its address filled in when it's clicked. */
function ReportLink({ email, title }: { email: string; title: string }) {
  return (
    <a
      href={`mailto:${email}`}
      onClick={(event) => {
        const subject = `Report: ${title}`;
        const body = `This public page breaks the rules:\n${window.location.href}\n\nWhat's wrong with it:\n`;
        event.currentTarget.href = `mailto:${email}?${new URLSearchParams({ subject, body }).toString().replace(/\+/g, "%20")}`;
      }}
      className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
    >
      Report this page
    </a>
  );
}

/** "Read-only · Made with Plotra", and the release a link shows the project as of. */
function About({ asOf, className }: { asOf?: string | null; className?: string }) {
  return (
    <p className={cn("items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <LogoMark className="size-4" />
      <span>
        {asOf ? `As of ${asOf}, read-only. ` : "Read-only. "}
        <a href={fromReader(siteUrl, "made-with-plotra")} className="underline-offset-4 hover:text-foreground hover:underline">
          Made with Plotra
        </a>
      </span>
    </p>
  );
}

export function PublicShell({
  token,
  title,
  tree,
  allowCopy,
  asOf,
  reportEmail,
  children,
}: {
  token: string;
  title: string;
  tree: PublicTreeNode[];
  /** The owner lets readers copy the project (lib/public-copy-actions.ts). */
  allowCopy: boolean;
  /** The release the link shows the project as of, if it's for an audience that mustn't see what comes later. */
  asOf?: string | null;
  reportEmail?: string;
  children: React.ReactNode;
}) {
  const params = useParams<{ nodeId?: string }>();
  // The note clicked, highlighted and shown as a skeleton at once, before it has
  // loaded (its link doesn't prefetch). The note that arrives wins, including one
  // reached with the browser's back button.
  const [chosen, setChosen] = useState(params.nodeId);
  const [arrived, setArrived] = useState(params.nodeId);
  if (params.nodeId !== arrived) {
    setArrived(params.nodeId);
    setChosen(params.nodeId);
  }
  const loading = chosen !== params.nodeId;
  // On a phone the binder is tucked away until asked for.
  const [showTree, setShowTree] = useState(false);
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) =>
    setClosed((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  // From md up the binder and the note scroll on their own, so a new note starts at its top.
  const main = useRef<HTMLElement>(null);
  // Braces: scrollTo returns a Promise in newer browsers, and an effect must return nothing or a cleanup function.
  useEffect(() => {
    main.current?.scrollTo(0, 0);
  }, [params.nodeId]);

  // From md up the frame is exactly one screen tall (flex-none, so flex-1 can't stretch it to the note's length): the binder stays put and the note scrolls beside it.
  return (
    <div className="flex min-h-dvh flex-1 flex-col md:h-dvh md:flex-none md:overflow-hidden">
      {/* Below md: the contents button, the title and one call to action, on one line. The rest waits at the end of the page. */}
      <header className="sticky top-0 z-10 flex items-center gap-x-3 border-b bg-background/95 px-3 py-2 backdrop-blur md:flex-wrap md:gap-x-4 md:gap-y-1 md:px-4 md:py-2.5">
        <button
          type="button"
          onClick={() => setShowTree((v) => !v)}
          aria-expanded={showTree}
          aria-controls="public-binder"
          aria-label="Contents"
          className="grid size-10 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none md:hidden"
        >
          <Icon name={showTree ? "close-linear" : "hamburger-menu-linear"} className="size-5" />
        </button>
        <Link href={publicPath(token)} prefetch={false} transitionTypes={nav.back} className="min-w-0 flex-1 truncate font-display text-xl leading-tight tracking-tight">
          {title}
        </Link>
        <About asOf={asOf} className="hidden md:flex" />
        {allowCopy ? (
          <Link
            href={`/copy/${token}`}
            prefetch={false}
            className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-ember-ink underline-offset-4 hover:underline"
          >
            <Icon name="copy-linear" className="size-4" />
            <span className="md:hidden">Copy</span>
            <span className="hidden md:inline">Copy this project</span>
          </Link>
        ) : (
          <Link href={fromReader("/sign-up", "sign-up")} className="shrink-0 text-sm font-medium text-ember-ink underline-offset-4 hover:underline">
            <span className="md:hidden">Sign up</span>
            <span className="hidden md:inline">Sign up to write your own</span>
          </Link>
        )}
        {reportEmail && (
          <span className="hidden md:inline">
            <ReportLink email={reportEmail} title={title} />
          </span>
        )}
        <ThemeMenu />
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <nav
          id="public-binder"
          aria-label="Contents"
          className={cn(
            "shrink-0 border-b p-2 md:block md:w-72 md:overflow-y-auto md:border-r md:border-b-0",
            !showTree && "hidden",
          )}
        >
          {tree.length ? (
            <Branch
              nodes={tree}
              token={token}
              selected={chosen}
              depth={0}
              closed={closed}
              toggle={toggle}
              onNavigate={(id) => {
                setChosen(id);
                setShowTree(false);
              }}
            />
          ) : (
            <p className="px-2 py-1 text-sm text-muted-foreground">Nothing here yet.</p>
          )}
        </nav>
        <main ref={main} className="min-w-0 flex-1 px-5 py-8 sm:px-10 md:overflow-y-auto">
          {loading ? <NoteSkeleton /> : children}
          {/* On a phone, what the header leaves out, at the end of the page. */}
          <footer className="mx-auto mt-12 flex w-full max-w-2xl flex-wrap items-center justify-between gap-3 border-t pt-4 md:hidden">
            <About asOf={asOf} className="flex" />
            {reportEmail && <ReportLink email={reportEmail} title={title} />}
          </footer>
        </main>
      </div>
    </div>
  );
}
