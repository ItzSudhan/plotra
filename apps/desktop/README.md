# Plotra desktop

Plotra as an app on your computer (see [local-mode-plan.md](../../local-mode-plan.md), and [desktop-onboarding-plan.md](../../desktop-onboarding-plan.md) for the first run). On first run it asks where your work should live:

- **Plotra Cloud**: a window on app.plotra.ink. "Sign in" and "Create an account" both continue in the browser.
- **On this computer**: a *library*, a folder you name and place on the "Set up your library" screen (default: "Plotra Library" in Documents). The app runs Plotra's own server on this computer, in local mode, with the library's database (PGlite) inside that folder. No account, no internet.

Signing in to Plotra Cloud happens in your own browser, where Google and your password manager work: the app catches the cloud's sign-in page, opens the browser there, and waits on a port of its own at 127.0.0.1 for a one-time code, which its window swaps for a session (src/sign-in.ts, and packages/auth/src/desktop.ts for the cloud's half).

The choice is remembered, and the File menu switches between them, opens other libraries, makes backups (Back Up Now) and restores snapshots. While a library starts, a small "Opening your library…" window shows; with no connection, Plotra Cloud shows an offline page with "Try again".

## A library

```
plotra-library.json   the library's format and secrets (sign-in and saved AI keys are derived from them)
Database/             the database. Don't change these files by hand.
Markdown/             every project as Markdown files, kept up to date while the library is open
Snapshots/            dated copies of the database: one a day, and whenever you ask
.plotra-lock          which copy of Plotra has the library open
```

Only one copy of Plotra may have a library open at a time. A library synced between computers (Dropbox, iCloud) must be closed on one before it's opened on the other; the lock says so if it isn't.

## Developing

```sh
bun install
bun run setup            # downloads Electron's binary (Bun doesn't run its install script)

# Against `next dev`: start the app in local mode, then point the desktop app at it.
cd ../app && PLOTRA_LOCAL=1 DATABASE_URL=pglite:./.plotra-local bun run dev
cd ../desktop && PLOTRA_DESKTOP_DEV_URL=http://localhost:3000 bun run dev

# Against the real bundled server:
bun run bundle-server    # builds apps/app in local mode into build/server
bun run dev
```

## Packaging

`bun run dist` builds for the platform it runs on, into `release/`. Unsigned unless signing is set up: on macOS `CSC_LINK`, `CSC_KEY_PASSWORD`, plus `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` for notarizing (and `notarize: true` in electron-builder.yml); on Windows `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD`. Updates are published as GitHub releases and picked up by the app (src/updates.ts).
