// Better Auth's errors, said in words people use. Its client returns
// `{ code, message, status }`; server calls throw an APIError whose body has
// the same. Codes are matched first (they don't change with the wording), then
// the message, then the HTTP status.

import { errorText, OFFLINE, statusText } from "./errors";

type AuthError = { code?: string; message?: string; status?: number; body?: { code?: string; message?: string } } | null | undefined;

const byCode: Record<string, string> = {
  USER_ALREADY_EXISTS: "There's already an account for this email.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "There's already an account for this email.",
  INVALID_EMAIL_OR_PASSWORD: "That email and password don't match. Check for typos, or reset your password.",
  INVALID_PASSWORD: "That password isn't right.",
  INVALID_EMAIL: "That doesn't look like an email address.",
  PASSWORD_TOO_SHORT: "Use at least 8 characters for your password.",
  PASSWORD_TOO_LONG: "That password is too long. Use 128 characters or fewer.",
  INVALID_TOKEN: "This link has expired or has already been used. Ask for a new one.",
  TOKEN_EXPIRED: "This link has expired. Ask for a new one.",
  SESSION_EXPIRED: "For your safety, sign out and sign in again, then try once more.",
  SESSION_NOT_FRESH: "For your safety, sign out and sign in again, then try once more.",
  CREDENTIAL_ACCOUNT_NOT_FOUND: "Your account has no password yet. Set one first.",
  USER_ALREADY_HAS_PASSWORD: "Enter your password to confirm.",
  EMAIL_NOT_VERIFIED: "Confirm your email first: look for the message we sent you.",
  SOCIAL_ACCOUNT_ALREADY_LINKED: "That Google account is already connected to another Plotra account.",
  LINKED_ACCOUNT_ALREADY_EXISTS: "That Google account is already connected.",
  FAILED_TO_UNLINK_LAST_ACCOUNT: "It's the only way you sign in. Set a password before disconnecting it.",
  FAILED_TO_CREATE_USER: "Couldn't create your account. Try again in a moment.",
  ORGANIZATION_ALREADY_EXISTS: "That web address is taken. Try another.",
  ORGANIZATION_SLUG_ALREADY_TAKEN: "That web address is taken. Try another.",
  YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER: "You're its only owner. Make someone else an owner first, or delete the workspace.",
  YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER: "A workspace needs an owner. Make someone else an owner first.",
  YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION: "Only the workspace's owner can delete it.",
  YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION: "Only owners and admins can change the workspace.",
  YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION: "This invitation was sent to a different email address.",
  INVITATION_NOT_FOUND: "This invitation has expired, was revoked or has already been used.",
  USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION: "You're already a member of this workspace.",
  USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION: "They've already been invited.",
  CHANGE_EMAIL_DISABLED: "Changing your email isn't available on this server.",
  VERIFICATION_EMAIL_NOT_ENABLED: "This server can't send email, so your address can't be changed here.",
};

/** What to tell someone about a Better Auth error. */
export function authErrorText(error: AuthError, fallback = "Something went wrong. Try again in a moment."): string {
  if (!error) return fallback;
  const code = error.code ?? error.body?.code;
  if (code && byCode[code]) return byCode[code];
  const status = error.status;
  if (status === 429) return statusText(429);
  // The fetch never reached the server.
  if (status === 0) return OFFLINE;
  const message = error.message ?? error.body?.message;
  if (message) {
    // Messages we wrote ourselves on the server (packages/auth) are already sentences for people.
    if (/^You're the only owner/.test(message)) return message;
    return errorText(message, fallback);
  }
  if (status && status >= 500) return statusText(status);
  return fallback;
}

/** Whether the error means the email already has an account, so "Sign in instead?" fits. */
export const isExistingAccount = (error: AuthError) => /^USER_ALREADY_EXISTS/.test(error?.code ?? error?.body?.code ?? "") || /user already exists/i.test(error?.message ?? "");
