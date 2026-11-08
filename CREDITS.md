# Credits

Plotra exists because other people gave their work away. This file names the main pieces and gives the attribution their licences ask for.

## Icons

The icons in Plotra and on its site are from the [Solar icon set](https://www.figma.com/community/file/1166831539721848736) by **480 Design**, used under the [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/) licence (CC BY 4.0).

They reach Plotra through the [Iconify](https://icon-sets.iconify.design/solar/) package `@iconify-json/solar`. Plotra ships a subset of the set. The drawings themselves are not changed; they are shown at different sizes and in the colour of the surrounding text.

## Fonts

| Font | By | Used for | Licence |
| --- | --- | --- | --- |
| [Inter](https://rsms.me/inter/) | The Inter Project Authors | Interface text | SIL Open Font License 1.1 |
| [Young Serif](https://github.com/noirblancrouge/YoungSerif) | The Young Serif Project Authors | Headlines on this site | SIL Open Font License 1.1 |
| [Instrument Serif](https://github.com/Instrument/instrument-serif) | The Instrument Serif Project Authors | Headings | SIL Open Font License 1.1 |
| [Newsreader](https://github.com/productiontype/Newsreader) | The Newsreader Project Authors | Prose in the editor | SIL Open Font License 1.1 |
| [Geist Mono](https://github.com/vercel/geist-font) | The Geist Project Authors | Code and scripts | SIL Open Font License 1.1 |

The fonts are served from Plotra's own pages, not from a font service.

## Software

The main open-source projects Plotra depends on directly. Licences are as stated in each package's `package.json` at the version installed on 2 October 2026.

| Project | Used for | Licence |
| --- | --- | --- |
| [Next.js](https://nextjs.org) | The framework for the app, this site and the docs | MIT |
| [React](https://react.dev) | The interface | MIT |
| [Plate](https://platejs.org) | The editor | MIT |
| [Slate](https://www.slatejs.org) | The editing model under Plate | MIT |
| [Yjs](https://yjs.dev) | Real-time co-editing and offline merging | MIT |
| [y-indexeddb, y-protocols](https://github.com/yjs) | The browser cache and the sync protocol | MIT |
| [slate-yjs](https://github.com/BitPhinix/slate-yjs) | Connects the editor to Yjs | MIT |
| [PartyServer, y-partyserver](https://github.com/cloudflare/partykit) | The collaboration server on Cloudflare Durable Objects | ISC |
| [Better Auth](https://www.better-auth.com) | Accounts, sessions and workspaces | MIT |
| [Drizzle ORM](https://orm.drizzle.team) | Database queries and migrations | Apache-2.0 |
| [Neon serverless driver](https://github.com/neondatabase/serverless) | The Postgres connection | MIT |
| [PostgreSQL](https://www.postgresql.org) | The database | PostgreSQL License |
| [jose](https://github.com/panva/jose) | Verifying tokens on the collaboration server | MIT |
| [Dockview](https://dockview.dev) | Tabs and split panes | MIT |
| [cmdk](https://github.com/pacocoursey/cmdk) | The command palette and quick switcher | MIT |
| [sigma.js, graphology](https://www.sigmajs.org) | The graph view | MIT |
| [React Flow](https://reactflow.dev) | The storyboard canvas and the dialogue editor | MIT |
| [React DnD](https://react-dnd.github.io/react-dnd/) | Drag and drop in the editor | MIT |
| [Radix UI](https://www.radix-ui.com) | Dialogs, menus and other interface primitives | MIT |
| [shadcn/ui](https://ui.shadcn.com) | The component patterns the interface kit is built from | MIT |
| [Tailwind CSS](https://tailwindcss.com) | Styling | MIT |
| [Sonner](https://sonner.emilkowal.ski) | Notifications | MIT |
| [Motion](https://motion.dev) | Animation on this site | MIT |
| [Iconify utils](https://iconify.design) | Rendering the icons | MIT |
| [Fumadocs](https://fumadocs.dev) | The docs site | MIT |
| [AI SDK](https://ai-sdk.dev) | Talking to the AI provider you choose | Apache-2.0 |
| [Zod](https://zod.dev) | Validating data | MIT |
| [mammoth](https://github.com/mwilliamson/mammoth.js) | Reading Word documents | BSD-2-Clause |
| [docx](https://docx.js.org) | Writing Word documents | MIT |
| [aws4fetch](https://github.com/mhart/aws4fetch) | Talking to file storage | MIT |
| [fractional-indexing](https://github.com/rocicorp/fractional-indexing) | Ordering notes in the binder | CC0-1.0 |
| [Bun, Turborepo, TypeScript, ESLint, Wrangler](https://bun.sh) | Building and running the project | MIT and Apache-2.0 |

These bring their own dependencies with them: a few hundred packages in all, most under the MIT licence, the rest under Apache-2.0, ISC, BSD and similar permissive licences. The image library that Next.js uses includes libvips, which is under the LGPL-3.0-or-later.

## Data

The build tools use browser-support data from [caniuse.com](https://caniuse.com), through the `caniuse-lite` package, under CC BY 4.0.

## How the licences are checked

Plotra is distributed under the [AGPL-3.0](./LICENSE), so everything it ships has to be under a licence that allows that. [`scripts/check-licenses.ts`](./scripts/check-licenses.ts) reads the licence of every installed production dependency and reports anything that doesn't fit or states no licence. On 2 October 2026 it found nothing to flag.

The background videos on the site's home page (`apps/web/public/marketing/hero`) were made for Plotra.

If you see something used here without proper credit, please [open an issue](https://github.com/ItzSudhan/plotra/issues/new/choose). It will be fixed.
