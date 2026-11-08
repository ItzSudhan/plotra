import { Icon } from "@plotra/icons";
import { Button } from "@plotra/ui/components/button";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { listAiProjects } from "@/lib/api/ai-gate";
import { issuer, redirectHost, redirectWith } from "@/lib/api/oauth";
import { approveConnection, denyConnection } from "@/lib/api/oauth-actions";
import { readAuthorizeRequest } from "@/lib/api/oauth-server";
import { requireSession } from "@/lib/data";
import { readOnly } from "@/lib/request-cache";

// Where an app such as Claude asks to connect to Plotra (lib/api/oauth.ts).
// The person sees which app, where it'll send them back, which projects it
// could open (only those where AI is on) and whether it may change anything.
// The proxy has them sign in first and come back here.

export const metadata: Metadata = { title: "Connect an app" };

const SHOWN = 6;

function Card({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <Logo className="mb-10 text-lg" />
      <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-xs">{children}</div>
    </main>
  );
}

export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const params = Object.fromEntries(Object.entries(query).map(([k, v]) => [k, typeof v === "string" ? v : undefined]));
  const read = await readAuthorizeRequest(params);
  if (!read.ok && !read.fatal) redirect(redirectWith(read.redirectUri, { error: read.error, error_description: read.message, state: read.state, iss: issuer() }));
  if (!read.ok) {
    return (
      <Card>
        <Icon name="danger-circle-linear" className="size-7 text-muted-foreground" />
        <h1 className="mt-4 text-xl font-semibold tracking-tight">This link can&apos;t connect anything</h1>
        <p className="mt-1 text-sm text-muted-foreground">{read.message}</p>
      </Card>
    );
  }
  const { request } = read;
  const [{ user }, projects] = await Promise.all([requireSession(), readOnly(listAiProjects)]);
  const host = redirectHost(request.redirectUri);
  const hidden = (
    <>
      {Object.entries({ ...params, redirect_uri: request.redirectUri }).map(([name, value]) => (value === undefined ? null : <input key={name} type="hidden" name={name} value={value} />))}
    </>
  );

  if (!projects.length) {
    return (
      <Card>
        <Icon name="magic-stick-3-linear" className="size-7 text-muted-foreground" />
        <h1 className="mt-4 text-xl font-semibold tracking-tight">Switch AI on first</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {request.client.name} is an AI assistant, so it can only open projects where AI is switched on, and none of yours has it on yet.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          The owner of a workspace switches AI on in its <span className="text-foreground">Settings → AI</span>; each project can also switch it off for itself. Then connect again from {request.client.name}.
        </p>
        <form action={denyConnection} className="mt-6 flex gap-2">
          {hidden}
          <Button type="submit" variant="outline">
            Back to {request.client.name}
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/">Open Plotra</Link>
          </Button>
        </form>
      </Card>
    );
  }

  return (
    <Card>
      <Icon name="plug-circle-linear" className="size-7 text-ember-ink" />
      <h1 className="mt-4 text-xl font-semibold tracking-tight">Connect {request.client.name} to Plotra?</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        It will act as you, <span className="text-foreground">{user.email}</span>, and send you back to <span className="font-medium text-foreground">{host}</span>. Only connect it if you
        started this from {host === "claude.ai" || host === "claude.com" ? "Claude" : "that app"}.
      </p>

      <div className="mt-5 grid gap-1.5 text-ui-sm">
        <p className="font-medium">It can open the projects where AI is on</p>
        <ul className="grid gap-1 text-muted-foreground">
          {projects.slice(0, SHOWN).map((p) => (
            <li key={p.id} className="flex items-center gap-2 truncate">
              <Icon name="book-2-linear" className="size-3.5 shrink-0 text-faint" />
              {p.title}
            </li>
          ))}
          {projects.length > SHOWN && <li className="pl-5.5">and {projects.length - SHOWN} more</li>}
        </ul>
        <p className="text-xs text-muted-foreground">Projects where AI is off stay out of its reach, and it stops seeing a project as soon as AI is switched off there.</p>
      </div>

      <form action={approveConnection} className="mt-5 grid gap-4">
        {hidden}
        <fieldset className="grid gap-2 text-ui-sm">
          <legend className="mb-1.5 font-medium">What it may do</legend>
          <label className="flex items-start gap-2 rounded-lg border p-3">
            <input type="radio" name="access" value="read" defaultChecked={request.scope === "read"} className="mt-0.5 size-4 accent-ember" />
            <span>
              <span className="font-medium">Read only</span>
              <span className="block text-muted-foreground">List, read and search your notes.</span>
            </span>
          </label>
          <label className="flex items-start gap-2 rounded-lg border p-3">
            <input type="radio" name="access" value="write" defaultChecked={request.scope === "write"} className="mt-0.5 size-4 accent-ember" />
            <span>
              <span className="font-medium">Read and write</span>
              <span className="block text-muted-foreground">Also make notes and change them, where you can edit. Old text stays in each note&apos;s history.</span>
            </span>
          </label>
        </fieldset>
        <div className="flex flex-wrap gap-2">
          <Button type="submit">Connect</Button>
          <Button type="submit" variant="ghost" formAction={denyConnection}>
            Cancel
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">You can disconnect it any time in Your settings → API tokens and MCP.</p>
      </form>
    </Card>
  );
}
