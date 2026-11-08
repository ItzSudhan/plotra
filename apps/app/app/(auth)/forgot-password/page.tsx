import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth/password-reset";
import { safeCallbackURL } from "@/lib/slug";

export const metadata: Metadata = { title: "Forgot password" };

// Open to anyone (proxy.ts): the person asking is, by definition, signed out.
export default async function ForgotPasswordPage({ searchParams }: PageProps<"/forgot-password">) {
  const query = await searchParams;
  const callbackURL = safeCallbackURL(query.callbackURL);
  const email = typeof query.email === "string" ? query.email.slice(0, 320) : "";

  return (
    <>
      <h1 className="animate-rise font-brand text-[2.75rem] leading-[0.95] tracking-[-0.03em] text-balance text-black motion-reduce:animate-none sm:text-[3.25rem]">
        Forgot your <em className="wikilink">password?</em>
      </h1>
      <p className="mt-5 mb-9 animate-rise text-base leading-relaxed text-muted-foreground [animation-delay:80ms] motion-reduce:animate-none">
        It happens. Enter your email and we&apos;ll send you a link to choose a new one.
      </p>
      <div className="animate-rise [animation-delay:160ms] motion-reduce:animate-none">
        <ForgotPasswordForm email={email} callbackURL={callbackURL} />
      </div>
    </>
  );
}
