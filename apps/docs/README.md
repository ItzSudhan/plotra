# @plotra/docs

The docs at docs.plotra.ink, built with Next.js and [Fumadocs](https://fumadocs.dev). No database and no sign-in.

## Run it

From the repository root:

```bash
bun dev:docs       # http://localhost:3002
```

It needs no variables to run locally. `.env.example` lists the optional ones: this site's address, the app's and the website's, where reader feedback goes, and PostHog. Setup for the whole repository is in [CONTRIBUTING.md](../../CONTRIBUTING.md#setup).

From this folder:

```bash
bun run dev
bun run check-links   # every /docs link and #heading, from the docs and the website
bun run test          # the same check, as a test
bun run typecheck
bun run lint
```

## Where things are

```
content/docs/           the pages, one MDX file each, in four tabs:
  (guides)/             Guides
  (reference)/          Reference
  (developers)/         Developers
  (hosting)/            Self-hosting
app/docs/               the page layout and the page route
app/llms.txt, app/llms-full.txt   the docs as plain text for AI tools: a list of pages, and every page in one file
app/llms.mdx/           one page as Markdown (/docs/<page>.md, or a request that asks for Markdown; see proxy.ts)
app/og/                 the link preview image for each page
components/             MDX components and the reader feedback widget
lib/source.ts           how Fumadocs loads content/docs
scripts/check-links.ts  the link checker
```

## Adding a page

1. Add an `.mdx` file in the right folder, with front matter:

   ```mdx
   ---
   title: Accessibility
   description: One sentence on what the page covers.
   ---
   ```

   Its address is its path without the bracketed folder and without `.mdx`: `content/docs/(guides)/writing/editor.mdx` is `/docs/writing/editor`, and an `index.mdx` is its folder's own address.

2. Add it to the `pages` list in the `meta.json` that lists its folder, so it shows in the sidebar and in the right order. Most folders have their own `meta.json` (`(guides)/writing/meta.json` lists `"editor"`); the `(reference)` tab lists its pages in `(reference)/meta.json` (`"reference/glossary"`).

3. Run `bun run check-links`.

If you move or rename a page or a heading, update every link to it: the docs no longer keep redirects for old addresses, so `bun run check-links` reports any link you missed. To keep an old `#anchor` working after you rename a heading, give the heading its old id: `## The Links tab [#backlinks]`.
