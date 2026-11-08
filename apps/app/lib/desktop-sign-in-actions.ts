"use server";

import { auth } from "@plotra/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireSession } from "./data";
import { desktopCallback, readDesktopRequest } from "./desktop-sign-in";
import { isLocalMode } from "./local-mode";
import { rateLimit } from "./rate-limit";

/** "Open the Plotra app": a one-time code goes to the app waiting on this computer, which swaps it for a session. */
export async function approveDesktopSignIn(form: FormData): Promise<void> {
  if (isLocalMode) throw new Error("The desktop app signs in to Plotra Cloud, not to a library.");
  const request = readDesktopRequest({ port: form.get("port"), state: form.get("state"), challenge: form.get("challenge") });
  if (!request) throw new Error("This link can't sign the app in. Sign in again from the Plotra app.");
  const { user } = await requireSession();
  await rateLimit("desktop-sign-in", user.id, { limit: 30, windowSeconds: 3600 });
  const { code } = await auth.api.createDesktopCode({ headers: await headers(), body: { challenge: request.challenge } });
  redirect(desktopCallback(request, code));
}
