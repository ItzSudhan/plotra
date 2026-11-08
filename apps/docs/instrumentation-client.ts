// Analytics in PostHog, when NEXT_PUBLIC_POSTHOG_KEY is set: page views, clicks
// and how far people scroll. Unset, the library is never downloaded. Events go
// to /ingest on this site's own address, which next.config.mjs forwards to
// PostHog, so ad blockers that block PostHog's address let them through.

const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;

if (key) {
  // PostHog's own site, for the links in its toolbar: us.posthog.com for us.i.posthog.com.
  const uiHost = (process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com')
    .replace(/\/+$/, '')
    .replace('.i.posthog.com', '.posthog.com');
  void import('posthog-js').then(({ default: posthog }) =>
    posthog.init(key, {
      api_host: '/ingest',
      ui_host: uiHost,
      defaults: '2026-08-30',
      person_profiles: 'identified_only',
    }),
  );
}

export {};
