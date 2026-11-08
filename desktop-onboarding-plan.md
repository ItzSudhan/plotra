# Desktop onboarding: a first run shaped by where your work lives

Written 8 November 2026.

## Status

| # | Step | State |
| --- | --- | --- |
| 1 | The desktop app's first-run window: sign in or sign up for the cloud; set up a library in the window | Done, untried |
| 2 | A local library's first screens in the app: "Welcome to your library", then AI (Ollama found and set up in one click) | Done, untried |
| 3 | A cloud account in the desktop app: a one-time "Plotra on your desktop" card on the projects page | Done, untried |

**Done:**

- Step 1 (8 November 2026): the first-run window (`apps/desktop/static/chooser.html`) has two screens. Plotra Cloud offers **Sign in** and **Create an account** (the second opens the cloud at `/sign-up`, which goes on to the browser in sign-up mode). **New library…** leads to "Set up your library": name, place (Documents unless changed), the folder it will be, and what it keeps. File → New Library… opens the same screen. Folder names are cleaned for every platform, and a name already taken by a folder that isn't a library gets " 2" (`newLibraryPath`, tested). Typecheck and the desktop tests pass.

- Step 2 (8 November 2026): in local mode the Cold Open's first screen is "Welcome to your library." (`components/onboarding/cold-open.tsx`): the library's folder (from `PLOTRA_LIBRARY`), daily snapshots and File → Back Up Now, the Markdown copy, and its name, prefilled with the folder's name. Then, once, when AI isn't set up and wasn't taken out of the build, "Would you like AI to help?" (`components/onboarding/local-ai-step.tsx`): the server looks for Ollama at 127.0.0.1:11434 (`lib/local-setup-actions.ts`, local mode only); its models are offered with one that calls tools first (`lib/onboarding/ollama.ts`, tested), and "Use <model>" saves it as the person's AI and switches AI on for the library. Without Ollama: where to get it, a link to Settings for a provider's key, and "Check again". "Not now" always. Typecheck, lint and the onboarding tests pass.

- Step 3 (8 November 2026): on the projects page, someone signed in to Plotra Cloud in the desktop app (its user agent, `lib/desktop.ts`) sees "Plotra on your desktop" (`components/onboarding/desktop-welcome.tsx`): who they're signed in as, the same projects as on the web, another window with ⌘⇧N (Ctrl+Shift+N), links opening in the browser, and File → New Library… for something private. Closing it is saved as `gettingStarted.dismissedDesktop` (a JSON field: no migration). Typecheck, lint and all 1,060 app tests pass.

**Not done:**

- **For you, by hand:** none of the three steps has been tried in a running app (no Electron or browser run here). Worth a look: the first-run window's height with the recent-libraries list; that "Create an account" doesn't flash the cloud's sign-up page in the window before the browser opens; the AI step with Ollama running, stopped, and running with no models; the desktop card on the projects page, and that it stays closed.
- The cloud card goes live once the web app is deployed; the first-run window and library screens ship with the next desktop release (`desktop-v*` tag).

## The problem

The desktop app's first run asks one question, cloud or this computer, and then drops the person into the web app's onboarding (the Cold Open), which was written for a cloud account in a browser:

- **Cloud**: "Use Plotra Cloud" opens the cloud's sign-in page, which hands over to the browser. Someone without an account has to find "Create an account" on a page in their browser, and nobody is told what the desktop app does differently from the website.
- **Local**: "New library…" opens a bare folder picker before the person knows what a library is or what the folder will hold. Then the Cold Open asks them to "name your workspace", which "holds your projects and the people you write with": wrong in local mode, where there are no other people. Nothing says where the work is kept, that it is backed up once a day, that there's a Markdown copy, or that AI needs a key or a model on this computer. Ollama, if it's already running, isn't noticed.

## What changes

### 1. The first-run window (apps/desktop)

- **Plotra Cloud** gets two buttons: **Sign in** and **Create an account**. Both open the cloud in the window, which sends the browser to the right page (`/sign-in` or `/sign-up`, through the browser sign-in that's already there).
- **On this computer → New library…** no longer opens a folder picker at once. The window moves to a second screen, "Set up your library":
  - its name (default "Plotra Library"), which becomes the folder's name;
  - where it goes (default Documents), with "Change…";
  - the full path it will have, shown as it's typed;
  - what the folder holds and how it's backed up, in three lines;
  - **Create library** and **Back**.
  A folder of that name that is already a library is opened; one that isn't gets " 2" (" 3", …) added.

### 2. A library's first screens (apps/app, local mode)

The Cold Open's first question for someone with no workspace yet:

- **Welcome to your library**, in place of "First, name your workspace": the name, prefilled with the library folder's name, and what it means to keep work here: where the folder is, a snapshot every day and File → Back Up Now, a Markdown copy of every project, only you.
- **Then AI**, only in local mode, only when AI hasn't been set up and hasn't been taken out of the build: the server looks for Ollama on this computer (`127.0.0.1:11434`).
  - Found, with models: "Use <model>" sets it up in one click (a model known to call tools is preferred).
  - Found, no models: how to pull one, and "Check again".
  - Not found: a link to get Ollama, "Check again", and "Use a key from a provider" (Settings, in a new window).
  - Always: "Not now", which goes on to "What are you making?".

### 3. A cloud account in the desktop app (apps/app)

On the projects page, once, for someone signed in to the cloud in the desktop app: a small card, "Plotra on your desktop": the same projects as at app.plotra.ink, another window with ⌘⇧N (Ctrl+Shift+N), links to other sites open in the browser, and a private library on this computer from File → New Library…. Closing it is saved with the person's settings (`gettingStarted.dismissedDesktop`), so it doesn't come back on another computer.

## Left out

- A tour of the app itself: the Cold Open and the "Getting started" checklist already do that, the same in both modes.
- Importing from another app on first run: the import dialog is a click away on the projects page.
