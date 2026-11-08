import { socialProviders } from "@plotra/auth";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { getSession } from "@/lib/data";
import { safeCallbackURL } from "@/lib/slug";

export const metadata: Metadata = { title: "Create account" };

export default async function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  const callbackURL = safeCallbackURL((await searchParams).callbackURL);
  if (await getSession()) redirect(callbackURL);
  // Arriving from an invitation's link (proxy.ts).
  const invited = callbackURL.startsWith("/invite/");

  return (
    <>
      <h1 className="animate-rise font-brand text-[2.75rem] leading-[0.95] tracking-[-0.03em] text-balance text-black motion-reduce:animate-none sm:text-[3.25rem]">
        {invited ? (
          <>
            You&apos;ve been invited <em className="wikilink">to write together.</em>
          </>
        ) : (
          <>
            Every world begins with <em className="wikilink">a single line.</em>
          </>
        )}
      </h1>
      <p className="mt-5 mb-9 animate-rise text-base leading-relaxed text-muted-foreground [animation-delay:80ms] motion-reduce:animate-none">
        {invited ? "Make an account with the email the invitation was sent to. Already have one? Sign in at the bottom." : "Write yours here, alone or with your whole room."}
      </p>
      <div className="animate-rise [animation-delay:160ms] motion-reduce:animate-none">
        <AuthForm mode="sign-up" google={socialProviders.includes("google")} callbackURL={callbackURL} />
      </div>
    </>
  );
}
