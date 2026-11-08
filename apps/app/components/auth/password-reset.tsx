"use client";

import { authClient } from "@plotra/auth/client";
import { Icon } from "@plotra/icons";
import { Button } from "@plotra/ui/components/button";
import { Input } from "@plotra/ui/components/input";
import { Label } from "@plotra/ui/components/label";
import { cn } from "@plotra/ui/lib/utils";
import Link from "next/link";
import { startTransition, useActionState, useState } from "react";
import { authErrorText } from "@/lib/auth-errors";

// "Forgot password?": ask for a link by email (app/(auth)/forgot-password),
// then choose a new password from it (app/(auth)/reset-password). Better Auth
// sends the link (packages/auth: `sendResetPassword`); it works for an hour.

// The same pills as the sign-in form (./auth-form.tsx).
const field =
  "h-12 rounded-full border-black/10 bg-white px-5 text-[15px] shadow-none placeholder:text-black/35 focus-visible:border-ember/50 focus-visible:ring-ember/15 md:text-[15px]";
const submitClass = "mt-2 h-12 rounded-full bg-black text-[15px] font-normal text-white hover:bg-black/90";
const linkClass = "text-black underline decoration-black/20 underline-offset-4 transition-colors hover:decoration-black";

function Alert({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="flex items-start gap-2 rounded-2xl bg-destructive/8 px-4 py-3 text-sm text-destructive">
      <Icon name="danger-circle-linear" className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

const signInHref = (callbackURL: string) => `/sign-in${callbackURL === "/" ? "" : `?callbackURL=${encodeURIComponent(callbackURL)}`}`;

/** Asks for the email, then says where the link went. Says the same whether or not there's an account for it. */
export function ForgotPasswordForm({ email: initial, callbackURL }: { email: string; callbackURL: string }) {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, submit, pending] = useActionState(async (_: string | null, formData: FormData) => {
    const email = String(formData.get("email")).trim();
    try {
      const { error } = await authClient.requestPasswordReset({ email, redirectTo: `/reset-password${callbackURL === "/" ? "" : `?callbackURL=${encodeURIComponent(callbackURL)}`}` });
      if (error) return authErrorText(error);
    } catch (e) {
      return authErrorText(e as Error);
    }
    setSentTo(email);
    return null;
  }, null);

  if (sentTo) {
    return (
      <div role="status" className="grid gap-5">
        <p className="text-base leading-relaxed text-muted-foreground">
          We&apos;ve sent a link to <span className="text-black">{sentTo}</span>. It works for an hour. If it doesn&apos;t arrive in a few minutes, look in your spam folder, or check
          the address and try again.
        </p>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <button type="button" onClick={() => setSentTo(null)} className={linkClass}>
            Use a different email
          </button>
          <Link href={signInHref(callbackURL)} className={linkClass}>
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(() => submit(formData));
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="email" className="px-1 text-ui-sm text-black/80">
          Email
        </Label>
        <Input id="email" name="email" type="email" autoComplete="email" placeholder="you@studio.com" defaultValue={initial} required autoFocus className={field} />
      </div>
      {error && <Alert>{error}</Alert>}
      <Button type="submit" disabled={pending} className={submitClass}>
        {pending ? "Sending…" : "Send me a link"}
      </Button>
      <p className="text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link href={signInHref(callbackURL)} className={linkClass}>
          Sign in
        </Link>
      </p>
    </form>
  );
}

/** A new password, from the emailed link. A link that has expired or was used leads back to asking for another. */
export function ResetPasswordForm({ token, invalid, callbackURL }: { token: string | null; invalid: boolean; callbackURL: string }) {
  const [show, setShow] = useState(false);
  const [done, setDone] = useState(false);
  const [error, submit, pending] = useActionState(async (_: string | null, formData: FormData) => {
    const password = String(formData.get("password"));
    if (password !== String(formData.get("confirm"))) return "The two passwords don't match.";
    try {
      const { error } = await authClient.resetPassword({ newPassword: password, token: token ?? "" });
      if (error) return authErrorText(error);
    } catch (e) {
      return authErrorText(e as Error);
    }
    setDone(true);
    return null;
  }, null);

  if (invalid || !token) {
    return (
      <div className="grid gap-5">
        <Alert>This link has expired or has already been used. Links work for an hour, once.</Alert>
        <Link href={`/forgot-password${callbackURL === "/" ? "" : `?callbackURL=${encodeURIComponent(callbackURL)}`}`} className={cn(linkClass, "text-sm")}>
          Send me a new link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div role="status" className="grid gap-5">
        <p className="text-base leading-relaxed text-muted-foreground">Your password is changed, and you&apos;re signed out everywhere else. Sign in with the new one.</p>
        <Button asChild className={submitClass}>
          <Link href={signInHref(callbackURL)}>Sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(() => submit(formData));
      }}
    >
      <div className="grid gap-2">
        <div className="flex items-baseline justify-between px-1">
          <Label htmlFor="password" className="text-ui-sm text-black/80">
            New password
          </Label>
          <span id="password-hint" className="text-xs text-faint">
            At least 8 characters.
          </span>
        </div>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            minLength={8}
            required
            autoFocus
            aria-describedby="password-hint"
            className={cn(field, "pr-12")}
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute inset-y-0 right-1 grid w-11 place-items-center text-muted-foreground transition-colors hover:text-black"
            aria-label={show ? "Hide passwords" : "Show passwords"}
          >
            <Icon name={show ? "eye-closed-linear" : "eye-linear"} className="size-[18px]" />
          </button>
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="confirm" className="px-1 text-ui-sm text-black/80">
          The same again
        </Label>
        <Input id="confirm" name="confirm" type={show ? "text" : "password"} autoComplete="new-password" minLength={8} required className={field} />
      </div>
      {error && <Alert>{error}</Alert>}
      <Button type="submit" disabled={pending} className={submitClass}>
        {pending ? "Saving…" : "Save new password"}
      </Button>
    </form>
  );
}
