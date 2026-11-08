# Plotra for phones

Plotra on iPhone and Android, built with Expo (SDK 58) and Expo Router. It talks to Plotra Cloud, or a self-hosted Plotra, through the same API as everything else (`apps/app/app/api/v1`), with a token of its own.

## What it does

- **Library**: every project, by workspace, and the notes you opened lately.
- **A project's binder**: folders, chapters, scenes and notes in the web app's order. Open and close folders, filter by title or tag, hold a note for its menu.
- **Reading**: a note's text set in serif, with `[[links]]` that open the note they name, and Previous / Next to read straight through. Boards, timelines and dialogues open on the web.
- **Writing**: the note's own document, live, in Plate (the web's editor) running in a web view (`src/components/rich-editor`, an Expo DOM component) joined to the note's room on the collab server. There's nothing to save: every keystroke goes into the shared document, people writing elsewhere appear as they type, and comments, suggestions, block tags and formatting the phone doesn't show stay as they are. A formatting bar sits above the keyboard (bold, italic, headings, lists, to-dos, quotes, scene breaks, undo; script elements in a script), and `[[` opens a note picker to link. The document is kept on the phone, so you can write offline; what you write then goes when you're back, from the editor or, if it's closed, from the outbox (`POST /api/mobile/doc`).
- **Details**: title, synopsis, tags and status. New notes of any kind the API can make, at the top or inside a folder or chapter. Moving a note to the trash.
- **Quick note**: catch an idea as a new note in any project, or at the end of a note you pick.
- **Search** across all your projects at once, or one. Every project's text is kept on the phone, so search finds words inside notes offline too.
- **As of a release**: pick a book, episode or session in a project, and the binder dims what readers don't know yet, the reader leaves out passages revealed later, and the editor dims them.
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

Comments and replies, chat, accepting or rejecting suggestions, version history, boards, timelines, the graph, the plot grid, sharing and settings. They open on the web from the app. Other people's cursors aren't drawn (their names show above the keyboard), and pictures can't be added from the phone.
