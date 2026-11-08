# @plotra/icons

The icon component. Plotra uses [Solar icons](https://icon-sets.iconify.design/solar/) and ships only the ones it lists, so the full set never reaches a bundle. Used by `apps/app`, `apps/web` and `@plotra/ui`.

Like every package here it ships TypeScript source with no build step: `exports` point at `src/`, and each app lists it in `transpilePackages`.

## What's in it

- `src/index.tsx`: `<Icon name="..." />` and the `IconName` type. It renders an inline SVG at `1em`, so it takes the size and colour of the text around it; pass `className` to change them.
- `src/registry.ts`: every icon name in use.
- `src/solar-subset.json`: the SVG data for those icons. Generated; don't edit it by hand.
- `scripts/build-icons.ts`: writes `solar-subset.json` from the registry.

```tsx
import { Icon } from "@plotra/icons";

<Icon name="add-linear" className="size-4" />;
```

## Adding an icon

1. Find its name at [icon-sets.iconify.design/solar](https://icon-sets.iconify.design/solar/).
2. Add it to `src/registry.ts`, keeping the list sorted.
3. Run `bun run icons` from the repository root (it runs this package's `build:icons`), and commit the regenerated `solar-subset.json`.

An unknown name makes the script fail and say which. Don't add another icon library; see [CONTRIBUTING.md, "Icons"](../../CONTRIBUTING.md#icons).

## Scripts

`bun run build:icons` (what `bun run icons` runs from the root) and `bun run typecheck`.
