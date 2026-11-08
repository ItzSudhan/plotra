"use server";

import { redirect } from "next/navigation";
import { isApiRequest, requireSession } from "../data";
import { rateLimit } from "../rate-limit";
import { readOnly } from "../request-cache";
import { listAiProjects } from "./ai-gate";
import { issuer, redirectWith } from "./oauth";
import { createCode, readAuthorizeRequest } from "./oauth-server";

// The consent page's two buttons (app/oauth/authorize). The request is read
// again from the form, every check with it: nothing the page showed is trusted.

const fields = ["client_id", "redirect_uri", "response_type", "code_challenge", "code_challenge_method", "scope", "state", "resource"] as const;

const paramsOf = (form: FormData) => Object.fromEntries(fields.map((f) => [f, typeof form.get(f) === "string" ? (form.get(f) as string) : undefined]));

async function readForm(form: FormData) {
  if (isApiRequest()) throw new Error("Apps are connected in Plotra, not through the API.");
  const read = await readAuthorizeRequest(paramsOf(form));
  if (!read.ok) {
    if (read.fatal) throw new Error(read.message);
    redirect(redirectWith(read.redirectUri, { error: read.error, error_description: read.message, state: read.state, iss: issuer() }));
  }
  return read.request;
}

/** The person approved: a code goes back to the app, which swaps it for tokens. Only where AI is on, there's anything to approve. */
export async function approveConnection(form: FormData): Promise<void> {
  const request = await readForm(form);
  const { user } = await requireSession();
  await rateLimit("oauth-approve", user.id, { limit: 30, windowSeconds: 3600 });
  if (!(await readOnly(listAiProjects)).length) throw new Error("AI is switched off in all your projects, so there's nothing an AI assistant could open. Switch AI on first.");
  const scope = form.get("access") === "write" ? "write" : "read";
  const code = await createCode(user.id, { clientId: request.client.id, redirectUri: request.redirectUri, codeChallenge: request.codeChallenge, scope, resource: request.resource });
  redirect(redirectWith(request.redirectUri, { code, state: request.state, iss: issuer() }));
}

/** The person said no: the app is told so. */
export async function denyConnection(form: FormData): Promise<void> {
  const request = await readForm(form);
  redirect(redirectWith(request.redirectUri, { error: "access_denied", error_description: "The request was declined.", state: request.state, iss: issuer() }));
}
