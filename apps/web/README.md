# @plotra/web

The public site at plotra.ink: the home page, pricing, the blog, the comparison pages ("Plotra vs ...") and the pages for each kind of writer. A Next.js app with no database and no sign-in; its "Sign in" and "Docs" links go to [`apps/app`](../app/README.md) and [`apps/docs`](../docs/README.md).

## Run it

From the repository root:

```bash
bun dev:web        # http://localhost:3001
```

It needs no variables to run locally. `.env.example` lists the optional ones: the addresses of the app, the docs and this site (they default to localhost), and PostHog. Setup for the whole repository is in [CONTRIBUTING.md](../../CONTRIBUTING.md#setup).

From this folder, `bun run dev`, `bun run build`, `bun run lint` and `bun run typecheck`. There are no tests here; links from this site to the docs are checked by the docs' link checker (`cd ../docs && bun run check-links`).

## Where things are

```
app/(marketing)/          the pages: home, pricing, blog, compare, for, download, press, privacy, terms, refunds
app/opengraph-image.tsx   the site's link preview card
content/blog/             blog posts, one MDX file each (lib/blog.ts reads them), with art/ and shots/
content/compare/          one .ts file per "Plotra vs ..." page
content/for/              one .ts file per audience page (novelists, game masters, ...)
components/               the marketing and blog components
lib/                      the helpers that load content, links, JSON-LD and link previews
scripts/social-preview.tsx  draws the repository's social preview image (bun scripts/social-preview.tsx)
```
