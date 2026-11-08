// What the site says about itself to search engines and link previews: the
// tab title, the meta description, the Open Graph card. Written for a writer
// deciding whether to click, so it says what they get, not how it is built.

const clean = (url: string) => url.replace(/\/+$/, "");

/**
 * This site's own address. Set NEXT_PUBLIC_SITE_URL to point somewhere else; unset, it is the
 * dev server in development and the hosted site (www, where plotra.ink redirects) in a production build.
 */
export const siteUrl = clean(
  process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.NODE_ENV !== "production" ? "http://localhost:3001" : "https://www.plotra.ink"),
);

/**
 * Where the site's videos are served from. In a production build they come from the R2 bucket
 * `plotra-media` at media.plotra.ink, so a busy day doesn't spend Vercel bandwidth; in development
 * they come from public/, which holds the same files. NEXT_PUBLIC_MEDIA_URL overrides both.
 */
const mediaBase = clean(
  process.env.NEXT_PUBLIC_MEDIA_URL ?? (process.env.NODE_ENV === "production" ? "https://media.plotra.ink" : ""),
);

/** A video's address, from its path under public/ (for example "/press/plotra-promo.mp4"). */
export const mediaUrl = (path: string) => `${mediaBase}${path}`;

export const siteName = "Plotra";

export const siteTitle = "Plotra: write your novel and build its world in one place";

export const siteTagline = "Write your novel and build its world in one place.";

export const siteDescription =
  "Write your novel and build its world in one place. Scenes, characters and timeline stay linked, co-writers join you live, and canon stays straight. Start free.";
