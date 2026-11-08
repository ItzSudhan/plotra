import { createGetUrl } from 'fumadocs-core/source';

export const appName = 'Plotra Docs';

const clean = (url: string) => url.replace(/\/+$/, '');

/** The product, where "Start writing" leads. Set NEXT_PUBLIC_APP_URL to point somewhere else. */
export const appUrl = clean(process.env.NEXT_PUBLIC_APP_URL || 'https://app.plotra.ink');
/** The marketing site, for the pricing page. Set NEXT_PUBLIC_SITE_URL to point somewhere else. */
export const siteUrl = clean(process.env.NEXT_PUBLIC_SITE_URL || 'https://plotra.ink');
/** The docs' own address, for canonical links, robots.txt and the sitemap. Set NEXT_PUBLIC_DOCS_URL in production. */
export const docsUrl = clean(process.env.NEXT_PUBLIC_DOCS_URL || 'http://localhost:3002');
export const signUpUrl = `${appUrl}/sign-up`;
/** The community server, for questions and ideas. */
export const discordUrl = 'https://discord.gg/PxXr7Y4QrU';

export const docsRoute = '/docs';
export const docsImageRoute = '/og/docs';
export const docsContentRoute = '/llms.mdx/docs';

export const gitConfig = {
  user: 'ItzSudhan',
  repo: 'plotra',
  branch: 'master',
};

const getContentUrl = createGetUrl(docsContentRoute);

export function getPageMarkdownUrl(page: { slugs: string[]; locale?: string }) {
  const segments = [...page.slugs, 'content.md'];

  return { segments, url: getContentUrl(segments, page.locale) };
}

const getImageUrl = createGetUrl(docsImageRoute);

export function getPageImageUrl(page: { slugs: string[]; locale?: string }) {
  const segments = [...page.slugs, 'image.webp'];

  return { segments, url: getImageUrl(segments, page.locale) };
}
