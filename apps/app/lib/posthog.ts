// PostHog in the browser (instrumentation-client.ts), when NEXT_PUBLIC_POSTHOG_KEY
// is set. Unset, as on a self-hosted instance unless its owner sets it, the
// library is never downloaded and every call through `posthog` does nothing.
//
// Events go to /ingest on the app's own address, which next.config.ts forwards
// to PostHog, so ad blockers that block PostHog's address let them through.

export const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";

/** PostHog's own site, for the links in its toolbar: us.posthog.com for us.i.posthog.com. */
export const posthogUiHost = (process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com")
  .replace(/\/+$/, "")
  .replace(".i.posthog.com", ".posthog.com");

export const posthog =
  typeof window !== "undefined" && posthogKey ? import("posthog-js").then((module) => module.default) : null;

/** Ties this browser's events to the signed-in person, by id only. */
export function identify(userId: string) {
  // PostHog sends nothing when the browser is already this person.
  void posthog?.then((ph) => ph.identify(userId));
}

/** Starts a new anonymous visitor, after signing out. */
export function forget() {
  void posthog?.then((ph) => ph.reset());
}

// The reader, invitation and share links carry their secret in the path.
const secretPath = /(^|\/\/[^/]+)\/(p|invite|share)\/[^/]+/;

/**
 * Removes what could carry someone's writing or a secret from an address before
 * it is sent: the query string, the fragment, and the token in a reader,
 * invitation or share link. Other values pass through.
 */
export function scrubUrl(value: unknown) {
  if (typeof value !== "string" || !/^(https?:\/\/|\/)/.test(value)) return value;
  return value.split(/[?#]/)[0].replace(secretPath, "$1/$2/:token");
}
