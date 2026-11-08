"use client";

import { signIn, signUp } from "@plotra/auth/client";
import { Icon } from "@plotra/icons";
import { Button } from "@plotra/ui/components/button";
import { Input } from "@plotra/ui/components/input";
import { Label } from "@plotra/ui/components/label";
import { cn } from "@plotra/ui/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect, useState } from "react";
import { forgetPageCopies } from "@/components/offline/service-worker";
import { authErrorText, isExistingAccount } from "@/lib/auth-errors";
import { GoogleIcon } from "./provider-icons";

type Mode = "sign-in" | "sign-up";

/** What went wrong, and the way out of it when there is one. */
type Problem = { message: string; way?: "sign-in" } | null;

/** The marketing site, where the terms and privacy policy live, when this instance has one. */
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");

// Fields and buttons are pills, as everything you can press on plotra.ink is.
const field =
  "h-12 rounded-full border-black/10 bg-white px-5 text-[15px] shadow-none placeholder:text-black/35 focus-visible:border-ember/50 focus-visible:ring-ember/15 md:text-[15px]";

export function AuthForm({
  mode,
  google,
  callbackURL,
}: {
  mode: Mode;
  google: boolean;
  callbackURL: string;
}) {
  const router = useRouter();
  const [googlePending, setGooglePending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [done, setDone] = useState(false);
  // Whoever signs in next shouldn't find pages someone else kept in this browser (components/offline).
  useEffect(() => void forgetPageCopies(), []);

  const [email, setEmail] = useState("");
  const [googleError, setGoogleError] = useState<string | null>(null);

  const [problem, submit, pending] = useActionState(async (_: Problem, formData: FormData): Promise<Problem> => {
    setGoogleError(null);
    const email = String(formData.get("email"));
    const password = String(formData.get("password"));
    try {
      const { error } =
        mode === "sign-up"
          ? await signUp.email({ name: String(formData.get("name")).trim(), email, password })
          : await signIn.email({ email, password });
      if (error) return { message: authErrorText(error), way: mode === "sign-up" && isExistingAccount(error) ? "sign-in" : undefined };
    } catch (error) {
      return { message: authErrorText(error as Error) };
    }
    setDone(true);
    router.push(callbackURL);
    router.refresh();
    return null;
  }, null);

  const googleFailed = "Couldn't reach Google. Try again, or sign in with your email.";
  async function continueWithGoogle() {
    setGooglePending(true);
    setGoogleError(null);
    try {
      const { error } = await signIn.social({ provider: "google", callbackURL });
      if (error) {
        setGooglePending(false);
        setGoogleError(error.status === 429 ? authErrorText(error) : googleFailed);
      }
    } catch {
      setGooglePending(false);
      setGoogleError(googleFailed);
    }
  }

  const busy = pending || googlePending || done;
  const keep = callbackURL === "/" ? "" : `callbackURL=${encodeURIComponent(callbackURL)}`;
  const otherHref = `/${mode === "sign-in" ? "sign-up" : "sign-in"}${keep ? `?${keep}` : ""}`;
  // The email typed so far comes along, so it needn't be typed twice.
  const forgotHref = `/forgot-password?${new URLSearchParams({ ...(email && { email }), ...(callbackURL !== "/" && { callbackURL }) })}`;
  const error = problem?.message ?? googleError;

  return (
    <div className="grid gap-6">
      {google && (
        <>
          <Button
            type="button"
            variant="outline"
            className="h-12 rounded-full border-black/10 bg-white text-[15px] font-normal shadow-none hover:bg-black/[0.03]"
            disabled={busy}
            onClick={continueWithGoogle}
          >
            <GoogleIcon className="size-[18px]" />
            {googlePending ? "Opening Google…" : "Continue with Google"}
          </Button>
          <div className="flex items-center gap-3 text-xs text-faint">
            <span className="h-px flex-1 bg-black/[0.08]" />
            or with email
            <span className="h-px flex-1 bg-black/[0.08]" />
          </div>
        </>
      )}

      {/* onSubmit rather than action={submit}: React resets <form action> fields after every
          submission, which would wipe the email after a wrong password. */}
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          startTransition(() => submit(formData));
        }}
      >
        {mode === "sign-up" && (
          <Field label="Your name" htmlFor="name" hint="This is your byline.">
            <Input
              id="name"
              aria-describedby="name-hint"
              name="name"
              autoComplete="name"
              placeholder="Ursula K. Le Guin"
              maxLength={80}
              required
              className={field}
            />
          </Field>
        )}
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@studio.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={problem ? true : undefined}
            required
            className={field}
          />
        </Field>
        <Field
          label="Password"
          htmlFor="password"
          hint={mode === "sign-up" ? "At least 8 characters." : undefined}
          aside={
            mode === "sign-in" ? (
              <Link href={forgotHref} className="text-ui-sm text-muted-foreground underline decoration-black/20 underline-offset-4 hover:text-black hover:decoration-black">
                Forgot password?
              </Link>
            ) : undefined
          }
        >
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
              minLength={8}
              required
              aria-describedby={mode === "sign-up" ? "password-hint" : undefined}
              aria-invalid={problem ? true : undefined}
              className={cn(field, "pr-12")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-1 grid w-11 place-items-center text-muted-foreground transition-colors hover:text-black"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              <Icon name={showPassword ? "eye-closed-linear" : "eye-linear"} className="size-[18px]" />
            </button>
          </div>
        </Field>

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-2xl bg-destructive/8 px-4 py-3 text-sm text-destructive">
            <Icon name="danger-circle-linear" className="mt-0.5 size-4 shrink-0" />
            <span>
              {error}
              {problem?.way === "sign-in" && (
                <>
                  {" "}
                  <Link
                    href={`/sign-in?${new URLSearchParams({ ...(callbackURL !== "/" && { callbackURL }) })}`}
                    className="font-medium underline underline-offset-4"
                  >
                    Sign in instead?
                  </Link>
                </>
              )}
            </span>
          </p>
        )}

        <Button
          type="submit"
          disabled={busy}
          className="group mt-2 h-12 rounded-full bg-black text-[15px] font-normal text-white transition-[scale,opacity] duration-200 ease-out hover:bg-black active:scale-[0.97]"
        >
          {done ? (
            <>
              <Icon name="refresh-linear" className="animate-spin" />
              Opening your stories…
            </>
          ) : (
            <>
              {mode === "sign-up" ? "Start writing" : "Sign in"}
              <Caret />
            </>
          )}
        </Button>
      </form>

      {mode === "sign-up" && siteUrl && (
        <p className="text-meta leading-relaxed text-muted-foreground">
          By creating an account you agree to Plotra&apos;s{" "}
          <a href={`${siteUrl}/terms`} target="_blank" rel="noreferrer" className="underline decoration-black/20 underline-offset-4 hover:text-black">
            terms
          </a>{" "}
          and{" "}
          <a href={`${siteUrl}/privacy`} target="_blank" rel="noreferrer" className="underline decoration-black/20 underline-offset-4 hover:text-black">
            privacy policy
          </a>
          .
        </p>
      )}

      <p className="text-sm text-muted-foreground">
        {mode === "sign-in" ? "New to Plotra? " : "Already writing with us? "}
        <Link
          href={otherHref}
          className="text-black underline decoration-black/20 underline-offset-4 transition-colors hover:decoration-black"
        >
          {mode === "sign-in" ? "Create an account" : "Sign in"}
        </Link>
      </p>
    </div>
  );
}

/**
 * plotra.ink's call to action: pointed at, the button becomes a line you're
 * about to write, with your caret after the last word, named the way a co-writer's is.
 */
function Caret() {
  return (
    <span aria-hidden className="relative -ml-2 h-[1.15em] w-0">
      <span className="absolute inset-y-0 left-[0.2em] w-[1.5px] bg-ember opacity-0 group-hover:animate-caret group-hover:opacity-100 group-focus-visible:opacity-100" />
      <span className="absolute bottom-full left-[0.2em] origin-bottom-left translate-y-1 scale-75 rounded-[3px] rounded-bl-none bg-ember px-1.5 py-0.5 text-meta leading-none font-medium opacity-0 transition-[opacity,scale,translate] duration-200 ease-out group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:scale-100 group-focus-visible:opacity-100">
        You
      </span>
    </span>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  aside,
  children,
}: {
  label: string;
  htmlFor: string;
  /** Read out with the field: give the control `aria-describedby={`${htmlFor}-hint`}`. */
  hint?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <Label htmlFor={htmlFor} className="text-ui-sm text-black/80">
          {label}
        </Label>
        {hint && (
          <span id={`${htmlFor}-hint`} className="text-xs text-faint">
            {hint}
          </span>
        )}
        {aside}
      </div>
      {children}
    </div>
  );
}
