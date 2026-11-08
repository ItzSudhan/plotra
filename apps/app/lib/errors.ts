// Messages meant for the person using the app: "Give your project a title.",
// "That folder is in the trash."
//
// In a production build Next replaces the message of anything thrown on the
// server with a generic one, so details can't leak, and sends only the error's
// `digest`. Errors we throw on purpose are safe to show, so their message
// travels in the digest and `errorText` reads it back on the client. Server
// actions get this by running inside `transaction` / `readOnly`
// (lib/request-cache.ts), which call `expose` on what they throw.

const PREFIX = "PLOTRA:";

type Carried = { m: string };

type Digested = Error & { digest?: string };

/** An error whose message is written for the user. */
export class UserError extends Error {
  digest: string;
  constructor(message: string) {
    super(message);
    this.name = "UserError";
    this.digest = PREFIX + JSON.stringify({ m: message } satisfies Carried);
  }
}

/**
 * Makes a deliberately thrown error's message survive the trip to the client.
 * Only plain `Error`s qualify: database, network and programming errors are
 * subclasses, and Next's own control-flow errors already carry a digest.
 */
export function expose<T>(error: T): T {
  const e = error as Digested;
  if (e instanceof Error && e.constructor === Error && !e.digest && !e.cause && e.message) {
    e.digest = PREFIX + JSON.stringify({ m: e.message } satisfies Carried);
  }
  return error;
}

function carried(error: unknown): Carried | null {
  const digest = (error as Digested | null)?.digest;
  if (typeof digest !== "string" || !digest.startsWith(PREFIX)) return null;
  try {
    const parsed = JSON.parse(digest.slice(PREFIX.length)) as Carried;
    return typeof parsed.m === "string" ? parsed : null;
  } catch {
    return null;
  }
}

const GENERIC = "Something went wrong. Try again in a moment.";

export const OFFLINE = "Couldn't reach Plotra. Check your connection and try again.";

/** Messages from the browser and libraries, said in words people use. */
const known: [RegExp, string][] = [
  [/failed to fetch|networkerror|network request failed|load failed|fetch failed|ERR_INTERNET|ERR_NETWORK|ECONNREFUSED|ETIMEDOUT/i, OFFLINE],
  [/aborted|AbortError/i, "That took too long and was stopped. Try again."],
  [/user already exists|USER_ALREADY_EXISTS/i, "There's already an account for this email. Sign in instead."],
  [/invalid email or password|INVALID_EMAIL_OR_PASSWORD/i, "That email and password don't match. Check for typos, or reset your password."],
  [/password too short|PASSWORD_TOO_SHORT/i, "Use at least 8 characters for your password."],
  [/invalid email|INVALID_EMAIL/i, "That doesn't look like an email address."],
  [/slug.*(taken|exists)|ORGANIZATION_ALREADY_EXISTS|SLUG_IS_TAKEN/i, "That web address is taken. Try another."],
  [/too many requests|rate limit|429/i, "That's a lot in a short time. Wait a minute, then try again."],
  [/quota|QuotaExceeded/i, "This device is out of storage space for Plotra. Free some space and try again."],
];

/** The friendly version of a browser or library message, if there is one. */
export function friendlyMessage(message: string): string | null {
  for (const [pattern, text] of known) if (pattern.test(message)) return text;
  return null;
}

/** Words for an HTTP status, for errors that only have one. */
export function statusText(status: number): string {
  if (status === 401) return "You've been signed out. Sign in again and retry.";
  if (status === 403) return "You don't have permission to do that.";
  if (status === 404) return "That couldn't be found. It may have been deleted.";
  if (status === 409) return "Someone else changed this at the same time. Reload and try again.";
  if (status === 413) return "That file is too large.";
  if (status === 429) return "That's a lot in a short time. Wait a minute, then try again.";
  if (status >= 500) return "Plotra had a problem on its side. Your work is safe; try again in a moment.";
  return GENERIC;
}

/** What to tell the user about an error from a server action, a read or anything else. */
export function errorText(error: unknown, fallback = GENERIC): string {
  const found = carried(error);
  if (found) return found.m;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return OFFLINE;
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (message) {
    // Next's stand-in for a server error it wouldn't describe.
    if (/omitted in production|Server Components render/.test(message)) return fallback;
    const friendly = friendlyMessage(message);
    if (friendly) return friendly;
    // Errors we wrote ourselves are short sentences; anything that looks like
    // code, a stack or a JSON body isn't for people.
    if (error instanceof Error && error.constructor !== Error && error.name !== "UserError") return fallback;
    if (/[{}<>]|^\w+Error\b|\bat \w+ \(|\bundefined\b|\bnull\b/i.test(message) || message.length > 200) return fallback;
    return message;
  }
  return fallback;
}

/**
 * A route handler's own check of what it may say: the message of an error we
 * threw on purpose, and `fallback` for anything else (database, network,
 * programming errors), whose messages aren't written for the user.
 */
export function publicMessage(error: unknown, fallback = GENERIC): string {
  const found = carried(expose(error));
  return found ? found.m : fallback;
}

/** Rebuilds the error a route handler described with `publicMessage`. */
export function errorFromBody(text: string, fallback = GENERIC): Error {
  return new UserError(text || fallback);
}
