import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OtherAccount } from "@/components/auth/desktop-sign-in";
import { requireSession } from "@/lib/data";
import { readDesktopRequest } from "@/lib/desktop-sign-in";
import { approveDesktopSignIn } from "@/lib/desktop-sign-in-actions";
import { isLocalMode } from "@/lib/local-mode";

export const metadata: Metadata = { title: "Open the Plotra app" };

// Where the desktop app sends the person's browser to sign in
// (packages/auth/src/desktop.ts). The proxy has them sign in first and come
// back here; then one button hands the app a one-time code, on this computer.
// It's a button rather than at once, so a link someone else made can't sign an
// app in without the person seeing it.

const heading = "animate-rise font-brand text-[2.75rem] leading-[0.95] tracking-[-0.03em] text-balance text-black motion-reduce:animate-none sm:text-[3.25rem]";
const lead = "mt-5 mb-9 animate-rise text-base leading-relaxed text-muted-foreground [animation-delay:80ms] motion-reduce:animate-none";

export default async function DesktopSignInPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (isLocalMode) notFound();
  const query = await searchParams;
  const request = readDesktopRequest(query);
  if (!request) {
    return (
      <>
        <h1 className={heading}>
          This link <em className="wikilink">has lost its way.</em>
        </h1>
        <p className={lead}>It can&apos;t sign the Plotra app in. Go back to the app and sign in again from there.</p>
      </>
    );
  }
  const { user } = await requireSession();
  const here = `/desktop/sign-in?${new URLSearchParams({ port: String(request.port), state: request.state, challenge: request.challenge })}`;

  return (
    <>
      <h1 className={heading}>
        Back to <em className="wikilink">the Plotra app.</em>
      </h1>
      <p className={lead}>
        You&apos;re signed in as <span className="text-black">{user.name || user.email}</span>
        {user.name ? ` (${user.email})` : ""}. Open the app on this computer with this account?
      </p>
      <div className="grid animate-rise gap-6 [animation-delay:160ms] motion-reduce:animate-none">
        <form action={approveDesktopSignIn}>
          <input type="hidden" name="port" value={request.port} />
          <input type="hidden" name="state" value={request.state} />
          <input type="hidden" name="challenge" value={request.challenge} />
          <button
            type="submit"
            autoFocus
            className="inline-flex h-12 w-full items-center justify-center rounded-full bg-black text-[15px] text-white transition-[scale] duration-200 ease-out active:scale-[0.97]"
          >
            Open the Plotra app
          </button>
        </form>
        <OtherAccount callbackURL={here} />
      </div>
    </>
  );
}
