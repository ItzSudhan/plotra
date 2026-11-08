import { socialProviders } from "@plotra/auth";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { getSession } from "@/lib/data";
import { safeCallbackURL } from "@/lib/slug";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const callbackURL = safeCallbackURL((await searchParams).callbackURL);
  if (await getSession()) redirect(callbackURL);
  // Arriving from an invitation's link (proxy.ts).
  const invited = callbackURL.startsWith("/invite/");
  // Sent by the desktop app, to sign it in through this browser (app/(auth)/desktop/sign-in).
  const desktop = callbackURL.startsWith("/desktop/");

  return (
    <>
      <h1 className="animate-rise font-brand text-[2.75rem] leading-[0.95] tracking-[-0.03em] text-balance text-black motion-reduce:animate-none sm:text-[3.25rem]">
        {invited ? (
          <>
            You&apos;ve been invited <em className="wikilink">to write together.</em>
          </>
        ) : desktop ? (
          <>
            Sign in to <em className="wikilink">the Plotra app.</em>
          </>
        ) : (
          <>
            Pick up <em className="wikilink">where the story left off.</em>
          </>
        )}
      </h1>
      <p className="mt-5 mb-9 animate-rise text-base leading-relaxed text-muted-foreground [animation-delay:80ms] motion-reduce:animate-none">
        {invited
          ? "Sign in with the email the invitation was sent to."
          : desktop
            ? "Sign in here, in your browser, and Plotra opens on your computer."
            : "Your worlds, notes and collaborators are waiting."}
      </p>
      <div className="animate-rise [animation-delay:160ms] motion-reduce:animate-none">
        <AuthForm mode="sign-in" google={socialProviders.includes("google")} callbackURL={callbackURL} />
      </div>
    </>
  );
}
