# Security

Plotra holds people's unpublished writing. A security problem here can leak a manuscript, so reports are taken seriously, and they are welcome.

Plotra is maintained by one person. There is no bug bounty.

## Reporting a problem

**Please do not open a public issue for a security problem.**

Report it privately through GitHub:

1. Go to the [Security tab](https://github.com/ItzSudhan/plotra/security) of the repository.
2. Choose **Report a vulnerability**.
3. Describe what you found.

This opens a private advisory that only you and the maintainer can see.

<!-- TODO(maintainer): private vulnerability reporting has to be switched on once the repo is public:
     Settings → Code security → Private vulnerability reporting → Enable.
     Until then the "Report a vulnerability" button does not appear. -->

A useful report has:

- what an attacker can do (read someone else's project, edit without permission, take over an account, and so on);
- steps to reproduce it, or a proof of concept;
- which part is affected (the app, the collab server, the public site) and the commit you tested;
- whether you tested against your own instance or the hosted version.

## What to expect

- A reply within 7 days. It is one maintainer, so it may not be the same day.
- An honest assessment, and a fix as fast as it can be made if the problem is real.
- Credit in the advisory and the release notes, unless you would rather not be named.
- Please give a reasonable amount of time to fix the problem before you publish details.

## In scope

- **The app** (`apps/app`): reading or changing a project, note, comment, version or file you have no access to; getting past a project role (a viewer editing, a commenter changing text); getting past row-level security; account or session takeover; server-side request forgery through web clipping; stored cross-site scripting through notes, comments, imports or exports.
- **The collab server** (`apps/collab`): joining a document room without a valid token, writing with a read-only role, or reading another room's content.
- **Published output**: the public wiki or an export containing notes that the spoiler horizon or the canon filter should have left out.
- **The hosted version**, once there is one, and its configuration.
- **Secrets** committed to the repository or its history.

## Out of scope

- Problems that need a compromised device, browser extension or account of the victim.
- Denial of service by sending a lot of traffic. The hosted version runs on free tiers and has rate limits and quotas; a report that a quota can be bypassed is in scope, a flood is not.
- Missing security headers or best-practice settings with no way shown to exploit them.
- Vulnerabilities in a dependency that Plotra doesn't reach. If Plotra is affected, say how.
- Social engineering of the maintainer or of users.
- Someone's own self-hosted instance set up insecurely (default secrets, a database open to the internet).

## Testing rules

- Test against your own instance where you can. It takes a few minutes to run locally; see [CONTRIBUTING.md](./CONTRIBUTING.md#setup).
- On the hosted version, use your own accounts and projects only. Do not read, change or delete other people's work, and stop as soon as you have shown the problem.
- No automated scanning of the hosted version. It lives on free tiers that other writers share.

## Supported versions

There are no versioned releases yet. Fixes go to the `master` branch, and the hosted version runs from it. If you self-host, update to the latest `master`.
