import { cn } from "@plotra/ui/lib/utils";
import { Logo } from "@/components/logo";
import { Placeholder } from "@/components/transitions";

// What a page looks like before it has loaded: the loading.tsx files show these
// the moment a link is clicked, so a click always answers at once. Each is laid
// out like its page, with the words that never change already in place, and
// dissolves off the page once the real one is there (components/transitions.tsx).

function Bone({ className }: { className?: string }) {
  return <div className={cn("h-3.5 animate-pulse rounded bg-muted", className)} />;
}

/** Read out once, so a screen reader hears that something is on its way. */
function Loading({ label }: { label: string }) {
  return (
    <span role="status" className="sr-only">
      {label}
    </span>
  );
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/** The project workspace (components/workspace/workspace-shell.tsx): ribbon, binder, a page, inspector and status bar. */
export function ShellSkeleton() {
  const tree = [
    { indent: 0, width: "w-28" },
    { indent: 1, width: "w-32" },
    { indent: 1, width: "w-24" },
    { indent: 1, width: "w-36" },
    { indent: 0, width: "w-20" },
    { indent: 1, width: "w-28" },
    { indent: 0, width: "w-24" },
  ];
  return (
    <Placeholder>
      <div className="flex h-dvh flex-col overflow-hidden">
        <Loading label="Opening the project" />
        <div className="flex h-12 shrink-0 items-center gap-3 border-b bg-sidebar px-3 md:hidden">
          <Bone className="size-6 rounded-md" />
          <Bone className="w-32" />
        </div>
        <div className="flex min-h-0 flex-1">
          <div className="hidden w-16 shrink-0 flex-col items-center gap-2 border-r bg-sidebar py-2 md:flex">
            {range(4).map((i) => (
              <Bone key={i} className="size-8 rounded-md" />
            ))}
            <div className="my-1 h-px w-8 bg-border" />
            {range(5).map((i) => (
              <Bone key={i} className="size-11 rounded-md" />
            ))}
          </div>
          <div className="hidden w-[264px] shrink-0 flex-col border-r bg-sidebar md:flex">
            <div className="flex h-10 shrink-0 items-center gap-3 border-b border-sidebar-border px-3">
              <Bone className="w-14" />
              <Bone className="w-10" />
            </div>
            <div className="grid gap-3 p-3">
              {tree.map((row, i) => (
                <div key={i} className={cn("flex items-center gap-2", row.indent && "pl-5")}>
                  <Bone className="size-3.5" />
                  <Bone className={row.width} />
                </div>
              ))}
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex h-9 shrink-0 border-b bg-sidebar">
              <div className="flex w-44 items-center border-r bg-background px-3">
                <Bone className="w-24" />
              </div>
            </div>
            <div className="mx-auto w-full max-w-2xl px-6 py-14 sm:px-10">
              <Bone className="h-8 w-2/3" />
              <div className="mt-10 grid gap-3.5">
                {["w-full", "w-11/12", "w-full", "w-4/5", "w-full", "w-2/3"].map((width, i) => (
                  <Bone key={i} className={width} />
                ))}
              </div>
            </div>
          </div>
          <div className="hidden w-[300px] shrink-0 flex-col border-l bg-sidebar lg:flex">
            <div className="flex h-10 shrink-0 items-center gap-3 border-b border-sidebar-border px-3">
              <Bone className="w-16" />
              <Bone className="w-14" />
              <Bone className="w-10" />
            </div>
            <div className="grid gap-4 p-4">
              {range(4).map((i) => (
                <div key={i} className="grid gap-2">
                  <Bone className="h-3 w-16" />
                  <Bone className="h-7 w-full rounded-md" />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="h-7 shrink-0 border-t bg-sidebar pointer-coarse:h-9" />
      </div>
    </Placeholder>
  );
}

/** Project cards, as on a workspace's projects page and Shared with you. */
function CardGrid() {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {range(6).map((i) => (
        <li key={i} className="flex flex-col rounded-xl border bg-card p-4">
          <Bone className="size-7 rounded-md" />
          <Bone className="mt-4 h-4 w-2/3" />
          <Bone className="mt-2 h-3 w-1/2" />
        </li>
      ))}
    </ul>
  );
}

/** A workspace's projects (app/w/[workspace]/(home)/(projects)/page.tsx), under the workspace's header. */
export function ProjectsSkeleton() {
  return (
    <Placeholder>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
        <Loading label="Loading projects" />
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
            <Bone className="mt-2.5 w-44" />
          </div>
          <Bone className="h-8 w-28 rounded-md" />
        </div>
        <CardGrid />
      </main>
    </Placeholder>
  );
}

/** Shared with you (app/shared/page.tsx), which has its own header. */
export function SharedSkeleton() {
  return (
    <Placeholder>
      <div className="flex flex-1 flex-col">
        <div className="flex h-12 items-center gap-2 border-b px-3">
          <span className="px-1">
            <Logo />
          </span>
          <Bone className="ml-auto size-7 rounded-full" />
        </div>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
          <Loading label="Loading what's shared with you" />
          <div className="mb-8 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Shared with you</h1>
              <Bone className="mt-2.5 w-52" />
            </div>
            <Bone className="h-8 w-32 rounded-md" />
          </div>
          <CardGrid />
        </main>
      </div>
    </Placeholder>
  );
}

/** Rows of a settings section. */
function Rows({ count }: { count: number }) {
  return (
    <div className="divide-y rounded-lg border bg-card">
      {range(count).map((i) => (
        <div key={i} className="flex items-center gap-3 p-4">
          <div className="grid flex-1 gap-2">
            <Bone className="w-36" />
            <Bone className="h-3 w-64 max-w-full" />
          </div>
          <Bone className="h-5 w-9 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** A workspace's settings as they first open (app/w/[workspace]/(home)/(settings)/settings). */
export function WorkspaceSettingsSkeleton() {
  return (
    <Placeholder>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6">
        <Loading label="Loading settings" />
        <div className="mb-6">
          <Bone className="h-3 w-16" />
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Settings</h1>
          <Bone className="mt-2.5 w-40" />
        </div>
        <div className="grid gap-6">
          <div className="flex gap-2 border-b pb-2">
            {["w-36", "w-12", "w-28"].map((width) => (
              <Bone key={width} className={cn("h-7 rounded-md", width)} />
            ))}
          </div>
          <TabBody />
        </div>
      </main>
    </Placeholder>
  );
}

function TabBody() {
  return (
    <div className="grid gap-3">
      <Bone className="w-28" />
      <Rows count={3} />
    </div>
  );
}

/** One tab of a workspace's settings, under the tabs, which stay on screen. */
export function SettingsTabSkeleton() {
  return (
    <Placeholder>
      <Loading label="Loading settings" />
      <TabBody />
    </Placeholder>
  );
}

/** Your settings (app/settings/page.tsx), under its header. */
export function YourSettingsSkeleton() {
  return (
    <Placeholder>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <Loading label="Loading your settings" />
        <div className="mb-8">
          <Bone className="h-3 w-12" />
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Your settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">These are yours alone, in every workspace you belong to.</p>
        </div>
        <div className="grid gap-10">
          {[3, 1, 2].map((count, i) => (
            <Section key={i} rows={count} />
          ))}
        </div>
      </main>
    </Placeholder>
  );
}

function Section({ rows }: { rows: number }) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <Bone className="w-24" />
        <Bone className="h-3 w-56" />
      </div>
      <Rows count={rows} />
    </div>
  );
}

/** One section of a settings page still loading, while the rest of the page shows. */
export function SettingsSectionSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <Placeholder>
      <Section rows={rows} />
    </Placeholder>
  );
}

/** One note of a public reader (app/p/[token]/n/[nodeId]/page.tsx), beside its contents. */
export function NoteSkeleton() {
  return (
    <Placeholder>
      <article className="mx-auto w-full max-w-2xl">
        <Loading label="Loading the note" />
        <Bone className="h-3 w-20" />
        <Bone className="mt-3 h-9 w-3/4" />
        <div className="mt-10 grid gap-3.5">
          {["w-full", "w-11/12", "w-full", "w-4/5", "w-full", "w-full", "w-2/3"].map((width, i) => (
            <Bone key={i} className={cn("h-4", width)} />
          ))}
        </div>
      </article>
    </Placeholder>
  );
}

/** A public reader's front page (app/p/[token]/page.tsx), beside its contents. */
export function ReaderFrontSkeleton() {
  return (
    <Placeholder>
      <article className="mx-auto w-full max-w-2xl">
        <Loading label="Loading the project" />
        <Bone className="h-9 w-2/3" />
        <Bone className="mt-4 h-4 w-11/12" />
        <Bone className="mt-6 w-40" />
        <div className="mt-8 divide-y rounded-lg border">
          {["w-40", "w-56", "w-32", "w-48", "w-36"].map((width, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2.5">
              <Bone className="size-4" />
              <Bone className={width} />
            </div>
          ))}
        </div>
      </article>
    </Placeholder>
  );
}

/** A public reader as it first opens (app/p/[token]/layout.tsx): its header, contents and a note. */
export function ReaderSkeleton() {
  return (
    <Placeholder>
      <div className="flex min-h-dvh flex-1 flex-col md:h-dvh">
        <Loading label="Opening the link" />
        <div className="flex h-13 items-center gap-3 border-b px-4">
          <Bone className="size-8 rounded-md md:hidden" />
          <Bone className="h-5 w-44" />
          <Bone className="ml-auto h-4 w-28" />
        </div>
        <div className="flex min-h-0 flex-1">
          <div className="hidden w-72 shrink-0 gap-3 border-r p-4 md:grid md:content-start">
            {["w-32", "w-40", "w-28", "w-36", "w-24"].map((width, i) => (
              <div key={i} className={cn("flex items-center gap-2", i % 2 === 1 && "pl-5")}>
                <Bone className="size-3.5" />
                <Bone className={width} />
              </div>
            ))}
          </div>
          <div className="min-w-0 flex-1 px-5 py-8 sm:px-10">
            <div className="mx-auto w-full max-w-2xl">
              <Bone className="h-9 w-2/3" />
              <div className="mt-10 grid gap-3.5">
                {["w-full", "w-11/12", "w-full", "w-4/5", "w-2/3"].map((width, i) => (
                  <Bone key={i} className={cn("h-4", width)} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Placeholder>
  );
}

/** "Copy this project" (app/copy/[token]/page.tsx). */
export function CopySkeleton() {
  return (
    <Placeholder>
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
        <Loading label="Loading" />
        <Logo className="mb-10 text-lg" />
        <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-xs">
          <Bone className="size-7 rounded-md" />
          <Bone className="mt-4 h-6 w-2/3" />
          <Bone className="mt-2 w-1/3" />
          <div className="mt-6 grid gap-2.5">
            <Bone className="w-full" />
            <Bone className="w-11/12" />
            <Bone className="w-3/4" />
          </div>
          <Bone className="mt-6 h-9 w-36 rounded-md" />
        </div>
      </main>
    </Placeholder>
  );
}

/** The gallery of worlds and stories (app/worlds/page.tsx). */
export function GallerySkeleton() {
  return (
    <Placeholder>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
        <Loading label="Loading worlds and stories" />
        <div className="mb-8">
          <Logo className="mb-6 text-lg" />
          <h1 className="font-display text-4xl tracking-tight">Worlds and stories</h1>
          <Bone className="mt-3 w-80 max-w-full" />
        </div>
        <CardGrid />
      </main>
    </Placeholder>
  );
}

/** The plugin store's front page (app/plugins/page.tsx), under the store's header. */
export function PluginStoreSkeleton() {
  return (
    <Placeholder>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
        <Loading label="Loading plugins" />
        <div className="mb-6">
          <h1 className="font-display text-4xl tracking-tight">Plugins</h1>
          <Bone className="mt-3 w-96 max-w-full" />
        </div>
        <Bone className="mb-4 h-9 w-full rounded-md" />
        <div className="mb-6 flex flex-wrap gap-1.5">
          {["w-12", "w-20", "w-16", "w-24", "w-16"].map((width, i) => (
            <Bone key={i} className={cn("h-7 rounded-full", width)} />
          ))}
        </div>
        <CardGrid />
      </main>
    </Placeholder>
  );
}

/** One plugin in the store (app/plugins/[slug]/page.tsx). */
export function PluginSkeleton() {
  return (
    <Placeholder>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <Loading label="Loading the plugin" />
        <Bone className="w-24" />
        <div className="mt-4 flex items-start justify-between gap-4">
          <div className="grid flex-1 gap-2">
            <Bone className="h-8 w-1/2" />
            <Bone className="w-3/4" />
            <Bone className="h-3 w-2/3" />
          </div>
          <Bone className="h-8 w-24 rounded-md" />
        </div>
        <div className="mt-8 grid gap-2 rounded-lg border bg-card p-4">
          <Bone className="w-32" />
          <Bone className="w-full" />
          <Bone className="w-5/6" />
        </div>
        <div className="mt-8 grid gap-2">
          <Bone className="w-20" />
          <Rows count={2} />
        </div>
      </main>
    </Placeholder>
  );
}
