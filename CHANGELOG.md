# Changelog

What changed in each tagged release of Plotra. The hosted app at app.plotra.ink deploys from `master` and is usually ahead of the latest tag.

## 0.1.0 (to be tagged on 27 October 2026)

The first public release. Plotra is a writing app where a novel, a screenplay or a tabletop campaign lives in one linked project with its world: scenes, characters, places, a timeline and a plot grid. It is free to use at [app.plotra.ink](https://app.plotra.ink), free to host yourself, and licensed under AGPL-3.0-or-later.

**How tested it is.** Everything below passes typecheck, lint and the unit tests, and runs in production. Most of it has been used by one person; little of it by two people at once. The [roadmap issue](https://github.com/ItzSudhan/plotra/issues) says what has and hasn't been tried by hand. Bug reports are the most useful thing you can send.

### Writing

- A binder of books, parts, chapters and scenes, with tabs, splits, a command palette and a quick switcher.
- An editor with Markdown as you type, smart quotes, focus and typewriter modes, and a writing bar above the keyboard on phones.
- Corkboard, outline, manuscript and a paged Read view for printing.
- Screenplay, stage play, comic and audio drama formats, with Fountain import and export and (MORE) / (CONT'D) across pages.
- Comments, suggestions, version history with a diff and restore, beat sheets, writing goals and stats that count typing, not pastes.

### The world

- Wiki-links, backlinks, hover previews, typed properties, tags, a codex and a graph.
- A timeline with your own calendars, a storyboard, a relationship map, family trees, a diplomacy web, a plot grid and maps with regions.
- Canon and retcons, releases, reveals and the spoiler horizon: the whole project as of any book or session, so a reader's wiki or a players' handout leaves out what isn't revealed yet.
- Who knows which secret, setups and payoffs, and continuity checks (a character who appears after their death, or in two places at once) with plain rules and no AI.
- Shared worlds that several projects link into.

### Together

- Live co-writing: one Cloudflare Durable Object per document, cursors, presence and an offline cache.
- Workspaces, per-project sharing and guest roles (editor, commenter, viewer), notifications and a daily digest.
- Read-only public links with a reader, a gallery of public worlds, and copying a project from a public link.

### In and out

- Import from Markdown, Word, text, PDF, an Obsidian vault (pictures and properties included), Scrivener, Plottr and World Anvil.
- Export to Markdown, Word, RTF, text, PDF, EPUB (with pictures), AO3, OPML for Scrivener, a static wiki, a series bible and a `.plotra` project file.
- Personal API tokens, a REST API, an MCP server that Claude and other assistants connect to by signing in (OAuth), only in projects where AI is on, webhooks, a project kept in a GitHub repository as Markdown, and plugins: your own sandboxed scripts that add commands, panels and export formats.

### Make it yours

- "Work like…" presets (Scrivener, Plottr, Google Docs, Obsidian, World Anvil), rebindable shortcuts, themes and your own CSS.
- Hide any toolbar button, status-bar item, menu entry or command; rename views, modules and kinds of note; your own templates and fields.
- Defaults for a workspace or a project, under each person's own choices; settings search and setup files.

### AI, off by default

- An optional agent on your own key or a local model (Ollama), with Ask, Suggest and Auto modes, approvals, checkpoints and "Undo run". It never runs unless the workspace's owner turns it on (admins can't), and an owner can promise "no AI" for a project, or a server can switch it off with `PLOTRA_NO_AI=1`.

### Self-hosting

- Docker images for the app, the collab server and migrations on the GitHub Container Registry (`ghcr.io/itzsudhan/plotra-app`, `plotra-collab`, `plotra-migrate`), and a compose file. Optional services (email, R2, Google sign-in, Sentry) stay optional.
- Guides for self-hosting, deploying, backups and restore at [docs.plotra.ink](https://docs.plotra.ink).
