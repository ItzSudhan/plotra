# @plotra/ui

Shared components and the Tailwind theme. The components are [shadcn/ui](https://ui.shadcn.com) ("new-york" style) on Radix, adapted to Plotra's palette. Used by `apps/app`.

Like every package here it ships TypeScript source with no build step: `exports` point at `src/`, and the app lists it in `transpilePackages`.

## What's in it

| Import | File |
| --- | --- |
| `@plotra/ui/components/<name>` | `src/components/<name>.tsx`: button, dialog, dropdown-menu, select, input, switch, sonner, ... |
| `@plotra/ui/lib/utils` | `src/lib/utils.ts`: `cn()`, which merges class names |
| `@plotra/ui/globals.css` | `src/styles/globals.css`: the theme (colours for light and dark mode, radius, font stacks) |

```tsx
import { Button } from "@plotra/ui/components/button";
```

An app imports Tailwind first, then the theme, in its own CSS (as `apps/app/app/globals.css` does):

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "@plotra/ui/globals.css";
```

The theme adds `src/components` to Tailwind's sources, so the components' classes are generated in every app that imports it.

## Rules

- Icons come from `@plotra/icons`. Don't add another icon library, lucide included, whatever `components.json` says. See [CONTRIBUTING.md, "Icons"](../../CONTRIBUTING.md#icons).
- A component belongs here when it knows nothing about Plotra's data. Anything that does lives in the app.

## Scripts

`bun run typecheck`. There are no tests in this package.
