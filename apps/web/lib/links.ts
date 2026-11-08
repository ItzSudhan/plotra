// Where the site points. Auth lives only on the app (plan.md, section 4), so
// "Sign in" and "Start writing" are plain links to it. Both URLs come from the
// environment because the hosted version starts on a subdomain and may move.

const clean = (url: string) => url.replace(/\/+$/, "");

// Unset, they are the dev servers in development and the hosted version in a
// production build, so a deploy that misses a variable never links to localhost.
const dev = process.env.NODE_ENV !== "production";

/** The product. Set NEXT_PUBLIC_APP_URL to point somewhere else. */
export const appUrl = clean(process.env.NEXT_PUBLIC_APP_URL || (dev ? "http://localhost:3000" : "https://app.plotra.ink"));

/** The docs site. Set NEXT_PUBLIC_DOCS_URL to point somewhere else. */
export const docsUrl = clean(process.env.NEXT_PUBLIC_DOCS_URL || (dev ? "http://localhost:3002" : "https://docs.plotra.ink"));

export const signInUrl = `${appUrl}/sign-in`;
export const signUpUrl = `${appUrl}/sign-up`;

export const repoUrl = "https://github.com/ItzSudhan/plotra";
export const sponsorUrl = "https://github.com/sponsors/ItzSudhan";
/** The community server: questions, ideas, and people writing with Plotra. */
export const discordUrl = "https://discord.gg/PxXr7Y4QrU";
export const issuesUrl = `${repoUrl}/issues`;
export const planUrl = `${repoUrl}/blob/master/plan.md`;
export const licenseUrl = `${repoUrl}/blob/master/LICENSE`;
export const openIssueUrl = `${repoUrl}/issues/new/choose`;

/** Where people write about their account, their data, a charge or these pages. */
export const contactEmail = "sudhan@plotra.ink";

/** Where a team writes to talk about an Enterprise plan. */
export const salesEmail = "sudhan@plotra.ink";

export const securityUrl = `${repoUrl}/blob/master/SECURITY.md`;
