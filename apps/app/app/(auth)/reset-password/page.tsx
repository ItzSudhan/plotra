import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/password-reset";
import { safeCallbackURL } from "@/lib/slug";

export const metadata: Metadata = { title: "Choose a new password" };

// Where the emailed link lands, through Better Auth, which adds `?token=` when
// the link is good and `?error=INVALID_TOKEN` when it has expired or was used.
export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const query = await searchParams;
  const token = typeof query.token === "string" ? query.token : null;
  const callbackURL = safeCallbackURL(query.callbackURL);

  return (
    <>
      <h1 className="animate-rise font-brand text-[2.75rem] leading-[0.95] tracking-[-0.03em] text-balance text-black motion-reduce:animate-none sm:text-[3.25rem]">
        Choose a <em className="wikilink">new password.</em>
      </h1>
      <p className="mt-5 mb-9 animate-rise text-base leading-relaxed text-muted-foreground [animation-delay:80ms] motion-reduce:animate-none">
        Then sign in with it. Your stories are just as you left them.
      </p>
      <div className="animate-rise [animation-delay:160ms] motion-reduce:animate-none">
        <ResetPasswordForm token={token} invalid={Boolean(query.error)} callbackURL={callbackURL} />
      </div>
    </>
  );
}
