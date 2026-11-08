# @plotra/config

Shared TypeScript configuration. Nothing to import at runtime, and no scripts.

- `tsconfig/base.json`: strict, `noEmit`, bundler module resolution, `react-jsx`. The packages `db`, `auth`, `ui` and `icons` extend it.
- `tsconfig/nextjs.json`: `base.json` plus the Next.js plugin. `apps/app`, `apps/web` and `apps/docs` extend it.

```json
{ "extends": "@plotra/config/tsconfig/base.json" }
```

Each `tsconfig.json` that extends one of these sets its own `include`. A change here affects every app and package, so run `bun run typecheck` from the repository root afterwards.

Like the other packages it has no build step: the files are used as they are. How the repository fits together is in [CONTRIBUTING.md, "How the repository is laid out"](../../CONTRIBUTING.md#how-the-repository-is-laid-out).
