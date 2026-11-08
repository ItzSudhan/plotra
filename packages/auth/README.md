# @plotra/auth

Sign-in, for `apps/app`: the [Better Auth](https://www.better-auth.com) configuration on the server, its React client, and the email sender. It stores everything through `@plotra/db`.

Like every package here it ships TypeScript source with no build step: `exports` point at `src/`, and the app lists it in `transpilePackages`.

## What's in it

| Import | File | What it is |
| --- | --- | --- |
| `@plotra/auth` | `src/index.ts` | `auth` (the server instance), `Session`, `socialProviders` |
| `@plotra/auth/client` | `src/client.ts` | `authClient`, `signIn`, `signUp`, `signOut`, `useSession`, for client components |
| `@plotra/auth/email` | `src/email.ts` | `sendEmail` and `emailConfigured`, over SMTP |

What it sets up:

- Email and password sign-in, and Google when its credentials are set.
- Password reset ("Forgot password?"): the link works for an hour, and resetting signs the account out everywhere.
- Changing the account's email (approved from the old address, then confirmed from the new one) and deleting the account. An account can't be deleted while it is the only owner of a workspace other people share.
- Workspaces are Better Auth organizations (the `organization` plugin), invitations included.
- The `jwt` plugin, which issues the short-lived tokens the collab server (`apps/collab`) verifies through `/api/auth/jwks`.
- Rate limits on sign-in, sign-up, invitations, password-reset requests and email changes, counted in Postgres, in production only.

## Variables

They live in `apps/app/.env.local` with the rest of the app's (see `apps/app/.env.example`).

| Variable | |
| --- | --- |
| `BETTER_AUTH_SECRET` | Required. Read by Better Auth itself. |
| `BETTER_AUTH_URL` | The app's public address. Defaults to `http://localhost:3000`. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional. Without them the Google button is hidden. |
| `SMTP_URL`, `EMAIL_FROM` | Optional. Send invitations, password-reset links and email-change confirmations. Without `SMTP_URL`, nothing is sent: each of those emails is printed to the server's log instead, link included, so sign-in still works locally. On a real server that means nobody can reset a forgotten password or change their email unless you pass them the link from the log. |

Optional services must stay optional; see [CONTRIBUTING.md, "Setup"](../../CONTRIBUTING.md#setup).

## Scripts

`bun run typecheck`. There are no tests in this package.
