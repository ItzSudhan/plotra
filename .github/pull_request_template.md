<!-- Thanks for the pull request. Keep it to one thing. For anything bigger than a small fix, link the issue where it was discussed. -->

## What this changes

<!-- Two or three sentences. What was wrong or missing, and what this does about it. -->

Closes #

## How I tested it

<!-- Be exact. "Not click-tested" is a fine answer; it tells the reviewer what to check. -->

- [ ] `bun run lint` and `bun run typecheck` pass
- [ ] `bun run build` passes
- [ ] Tried it in a browser
- [ ] Tried it with two people in the same project (only if it touches collaboration, comments or sharing)

What I did not test:

## Checklist

- [ ] Every commit is signed off (`git commit -s`; see CONTRIBUTING.md)
- [ ] Every new or changed server action checks access itself and runs inside `transaction` or `readOnly`
- [ ] No new migration and no change to a table definition, or the issue where it was agreed is linked above
- [ ] No new dependency, or `bun scripts/check-licenses.ts` passes and the reason for it is given above
- [ ] Still works with the optional services' environment variables unset
- [ ] Docs updated if what a feature does has changed (`apps/docs/content/docs`)

<!-- Screenshots or a short recording help a lot for interface changes. -->
