# Plotra for phones

Plotra on iPhone and Android, built with Expo (SDK 58) and Expo Router. It talks to Plotra Cloud, or a self-hosted Plotra, through the same API as everything else (`apps/app/app/api/v1`), with a token of its own.

## What it does

- **Library**: every project, by workspace, and the notes you opened lately.
- **A project's binder**: folders, chapters, scenes and notes in the web app's order. Open and close folders, filter by title or tag, hold a note for its menu.
- **Reading**: a note's text set in serif, with `[[links]]` that open the note they name, and Previous / Next to read straight through. Boards, timelines and dialogues open on the web.
- **Writing**: Markdown with a formatting bar above the keyboard, lists that carry on when you press Return, and `[[` suggesting notes to link. What you type is kept on the phone as a draft until it's saved. Saving checks nobody changed the note meanwhile, rewrites only the paragraphs you changed (so comments and formatting elsewhere stay), and the server keeps the version before in the note's history.
- **Details**: title, synopsis, tags and status. New notes of any kind the API can make, at the top or inside a folder or chapter. Moving a note to the trash.
- **Quick note**: catch an idea as a new note in any project, or at the end of a note you pick.
- **Search** across all your projects, or one.
- **Inbox**: mentions, replies, shares and reviews, with a badge on the tab.
- **Offline**: everything you've opened is saved on the phone and shown when there's no connection. Changes made offline wait on the phone and are sent when you're back (Account lists them, and keeps the text of any the server turns down).
- **Account**: light, dark or the phone's setting; reading text size; links to the web; sign out.

## Signing in

The app opens `/mobile/sign-in` on the server in a browser sheet, where you sign in as you do on the web (Google and password managers work there). The page hands a one-time code back on `plotra://sign-in`; the app swaps it, with a verifier only it holds, for an API token at `/api/mobile/token` (see `apps/app/lib/mobile-sign-in.ts` and `packages/auth/src/desktop.ts`). The token can write, lasts a year, is kept in the keychain or keystore, and shows in Settings → API tokens as "Plotra app on <phone>". Signing out revokes it.

## Developing

```sh
bun install            # from the repo root
cd apps/mobile
bunx expo run:ios      # or run:android: a development build (it uses native modules Expo Go may not have)
bun run typecheck && bun run lint && bun run test
```

To point it at a local server, choose "Use your own server" on the first screen and enter your computer's address on the network (for example `http://192.168.1.4:3000`); the phone can't reach `localhost`.

## Releasing

With EAS (`eas.json`): `bunx eas-cli build --profile production --platform all`, then `bunx eas-cli submit`. The bundle id is `ink.plotra.app` on both platforms. `ios/` and `android/` are generated from `app.json`; don't edit them by hand.

## Not on the phone yet

Comments and replies, chat, suggestions (track changes), version history, boards, timelines, the graph, the plot grid, sharing and settings. They open on the web from the app. A paragraph you change on the phone is rewritten from its Markdown, so formatting Markdown can't hold (and comments anchored in it) don't carry over to that paragraph; the version before stays in the note's history.
