import createMDX from "@next/mdx";
import type { NextConfig } from "next";

// PostHog through this site's own address (instrumentation-client.ts), only when it
// is on. Its API paths end in a slash, which Next.js would otherwise redirect away.
const posthog = Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY);
const posthogHost = (process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com").replace(/\/+$/, "");
// PostHog Cloud serves its scripts and their config from a separate host; a self-hosted PostHog serves them itself.
const posthogAssets = posthogHost.replace(/^https:\/\/(us|eu)\.i\.posthog\.com$/, "https://$1-assets.i.posthog.com");

const nextConfig: NextConfig = {
  transpilePackages: ["@plotra/icons"],
  // 90 is for the blog's screenshots, whose small text smears at the default.
  images: { qualities: [75, 90] },
  rewrites: async () =>
    posthog
      ? [
          { source: "/ingest/static/:path*", destination: `${posthogAssets}/static/:path*` },
          { source: "/ingest/array/:path*", destination: `${posthogAssets}/array/:path*` },
          { source: "/ingest/:path*", destination: `${posthogHost}/:path*` },
        ]
      : [],
  skipTrailingSlashRedirect: posthog,
};

// The blog's posts are MDX files in content/blog. Plugins are named as strings
// so that Turbopack can load them.
const withMDX = createMDX({
  options: {
    remarkPlugins: ["remark-gfm"],
    rehypePlugins: ["rehype-slug"],
  },
});

export default withMDX(nextConfig);
