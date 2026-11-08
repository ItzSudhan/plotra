import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

// PostHog through this site's own address (instrumentation-client.ts), only when it
// is on. Its API paths end in a slash, which Next.js would otherwise redirect away.
const posthog = Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY);
const posthogHost = (process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com').replace(/\/+$/, '');
// PostHog Cloud serves its scripts and their config from a separate host; a self-hosted PostHog serves them itself.
const posthogAssets = posthogHost.replace(/^https:\/\/(us|eu)\.i\.posthog\.com$/, 'https://$1-assets.i.posthog.com');

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // Takumi, which draws the link cards, loads a native binding that cannot be bundled.
  serverExternalPackages: ['@takumi-rs/core'],
  rewrites: async () =>
    posthog
      ? [
          { source: '/ingest/static/:path*', destination: `${posthogAssets}/static/:path*` },
          { source: '/ingest/array/:path*', destination: `${posthogAssets}/array/:path*` },
          { source: '/ingest/:path*', destination: `${posthogHost}/:path*` },
        ]
      : [],
  skipTrailingSlashRedirect: posthog,
};

export default withMDX(config);
