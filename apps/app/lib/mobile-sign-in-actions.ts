"use server";

import { auth } from "@plotra/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireSession } from "./data";
import { isLocalMode } from "./local-mode";
import { mobileCallback, readMobileRequest } from "./mobile-sign-in";
import { rateLimit } from "./rate-limit";

/** "Open the Plotra app": a one-time code goes back to the phone app, which swaps it for a token. */
export async function approveMobileSignIn(form: FormData): Promise<void> {
  if (isLocalMode) throw new Error("The phone app signs in to Plotra Cloud, not to a library.");
  const request = readMobileRequest({ state: form.get("state"), challenge: form.get("challenge") });
  if (!request) throw new Error("This link can't sign the app in. Sign in again from the Plotra app.");
  const { user } = await requireSession();
  await rateLimit("mobile-sign-in", user.id, { limit: 30, windowSeconds: 3600 });
  const { code } = await auth.api.createDesktopCode({ headers: await headers(), body: { challenge: request.challenge } });
  redirect(mobileCallback(request, code));
}
