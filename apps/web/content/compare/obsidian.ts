import type { Comparison } from "@/lib/compare";
import { no, part, say, yes } from "@/lib/compare-cells";
import art from "./art/obsidian.webp";
import { continuityChecks, importFiles, liveCowriting, plotGrid, plotraPrice, spoilerHorizon, timeline } from "./shared";

export const obsidian: Comparison = {
  slug: "obsidian",
  name: "Obsidian",
  title: "Plotra vs Obsidian for writing fiction and co-authoring",
  description:
    "Plotra vs Obsidian for novels and worldbuilding: wiki-links and the graph in both, plus story tools and live co-editing built in. Your vault imports.",
  headline: ["Obsidian, built for stories,", "with more than one person in it."],
  intro:
    "Obsidian is a superb place to think: plain Markdown files on your own disk, wiki-links, a graph, and a plugin for almost anything. Plotra borrows the parts writers love, the [[links]], backlinks, graph, tabs and command palette, and builds the story tools in: a manuscript, a timeline, a plot grid, canon and continuity. And your co-writer can be in the same note as you, live.",
  summary: "The links, backlinks and graph you know, with story tools built in and your co-writer in the same note.",
  art: {
    src: art,
    alt: "A polished black volcanic stone used as a paperweight on a ring of note cards tied with coloured threads, as a hand adds one more card",
  },
  verdict: {
    them: [
      "You want plain Markdown files on your own disk, forever",
      "You love tuning your setup with plugins and themes",
      "You write alone, often offline, on every device including phones",
    ],
    plotra: [
      "You write with a co-author and want to edit the same note at once",
      "You'd like a timeline, plot grid and continuity checks without plugins",
      "You want to share a world with readers or players without spoilers",
      "You'd like the code open, and to host it yourself if you choose",
    ],
  },
  strengths: [
    {
      title: "Your files, your disk",
      body: "Notes are plain Markdown files on your own device. Any app can open them, today and in twenty years.",
    },
    {
      title: "Plugins for everything",
      body: "Thousands of community plugins and themes. Longform, for one, turns a vault into a manuscript you can compile.",
    },
    {
      title: "Links and the graph",
      body: "Wiki-links, backlinks and the graph view: the way of working that made linked notes popular.",
    },
    {
      title: "Fast, and offline",
      body: "A quick desktop app that needs no connection, on Mac, Windows and Linux, with apps for iOS and Android.",
    },
    {
      title: "Free to use",
      body: "The app is free for personal and commercial use. Sync and Publish are optional paid services.",
    },
    {
      title: "Private by design",
      body: "No telemetry, and end-to-end encrypted Sync if you choose to use it.",
    },
  ],
  glance: {
    cowrite: part("Shared vaults sync; no live co-editing of one note"),
    manuscript: part("With plugins such as Longform"),
    bible: yes("Linked notes"),
    timeline: part("With plugins"),
    anyOs: part("Desktop and mobile apps; no browser editor"),
    free: yes("The app is free"),
    open: no("The app's code isn't published"),
  },
  table: [
    {
      group: "Notes and links",
      rows: [
        { feature: "Wiki-links, backlinks, unlinked mentions", plotra: yes(), them: yes() },
        { feature: "Graph view", plotra: yes("Global and local"), them: yes("Global and local") },
        { feature: "Tabs, split panes, command palette", plotra: yes(), them: yes() },
        { feature: "Typed properties on notes", plotra: yes(), them: yes() },
        { feature: "Plain Markdown files on your disk", plotra: part("Export to Markdown any time"), them: yes() },
        { feature: "Plugins and themes", plotra: no(), them: yes("Thousands") },
      ],
    },
    {
      group: "Story tools, built in",
      rows: [
        { feature: "Manuscript with chapters and scenes", plotra: yes(), them: part("With plugins") },
        { feature: "Corkboard and plot grid", plotra: yes(), them: part("With plugins") },
        { feature: "Timeline with custom calendars", plotra: yes(), them: part("With plugins") },
        { feature: "Canon, retcons and who knows what", plotra: yes(), them: no() },
        { feature: "Continuity checks", plotra: yes("Rule-based, no AI"), them: no() },
        { feature: "Spoiler horizon by book or session", plotra: yes(), them: no() },
      ],
    },
    {
      group: "Working together",
      rows: [
        { feature: "Two people editing the same note at once", plotra: yes("Live, with named cursors"), them: no("Not built in, per its help") },
        { feature: "Shared projects", plotra: yes("3 members free; guests per project"), them: part("Shared vaults, each person on Sync") },
        { feature: "Comments and suggested changes", plotra: yes(), them: no("Not built in") },
        { feature: "Version history", plotra: yes("Automatic and named versions"), them: yes("With Sync, or file recovery") },
      ],
    },
    {
      group: "Where and how",
      rows: [
        { feature: "Platforms", plotra: say("Any modern browser"), them: say("Mac, Windows, Linux, iOS, Android") },
        { feature: "Works offline", plotra: part("Installs as an app that opens offline; keep whole projects on the device"), them: yes() },
        { feature: "Publish a wiki", plotra: yes("Static wiki, as of any release"), them: part("Publish, a paid service") },
        { feature: "Open source, self-hostable", plotra: yes("AGPL-3.0"), them: no("Proprietary app") },
      ],
    },
  ],
  features: [
    {
      ...importFiles,
      title: "Your vault comes with you",
      body: "Choose your vault folder and Plotra imports the Markdown with its folders, links, tags and aliases. Dot-folders like .obsidian are left out, and a preview shows what will be made first.",
      points: ["Folders, wiki-links, tags and aliases", "Front matter titles and order", "Single line breaks kept, as Obsidian shows them"],
    },
    liveCowriting,
    plotGrid,
    timeline,
    continuityChecks,
    spoilerHorizon,
  ],
  pricing: {
    rows: [
      ["The app", "Free, with every feature", "Free, including commercial use"],
      ["Sync and sharing", "Included", "Sync $4 a month yearly (Standard) or $8 (Plus); each collaborator needs their own"],
      ["Publishing a wiki", "Included", "Publish: $8 a site a month, yearly"],
      ["More room and people", "Pro: $10 a month for the workspace", "–"],
      ["Host it yourself", plotraPrice.selfHost, "Your files are already local"],
    ],
    note: "Obsidian's prices are in US dollars, billed yearly; monthly billing is $5, $10 and $10.",
  },
  voices: [
    {
      quote: "…edit the same document at the same time and see each others cursors…",
      who: "A request on the Obsidian forum for live team editing",
      url: "https://forum.obsidian.md/t/obsidian-sync-live-team-collaborative-editing/6058",
    },
  ],
  switching: {
    title: "Bringing a vault over, or using both",
    intro:
      "Plenty of writers keep Obsidian for everything else and move the story to Plotra. A vault comes across in one import.",
    steps: [
      { title: "Choose your vault folder", body: "In Plotra, choose Import…, then Choose a folder…, and pick the vault. One note per file is on." },
      { title: "Check the preview", body: "See the folders and notes it will make. Pictures, canvases and PDFs are counted and left out for now." },
      { title: "Import", body: "Folders, links, tags and aliases come with it. Nothing in your vault is changed." },
      { title: "Turn notes into scenes", body: "Mark manuscript notes as chapters and scenes, and characters and places as entries, so the story views pick them up." },
      { title: "Date your scenes", body: "Give scenes a story date to see them on the timeline, and assign threads for the plot grid." },
      { title: "Set it up like Obsidian", body: "In Customize, choose Work like… and Like Obsidian: the graph, codex and outline come first, each side panel gets its own tab, and ⌘⇧F (Ctrl+Shift+F) searches the project." },
      { title: "Invite your co-writer", body: "Add them by email and edit the same note together, live." },
    ],
  },
  faq: [
    {
      q: "Can I co-write a novel in Obsidian?",
      a: "Obsidian's help says it does not yet support collaborative live editing on the same file. Shared vaults sync notes between people, each with their own Sync subscription, and third-party plugins add more. In Plotra, co-writers edit the same scene at once with named cursors, comments and suggestions built in.",
    },
    {
      q: "Can I import my Obsidian vault into Plotra?",
      a: "Yes. Choose the vault folder in the Import dialog. Markdown notes come across with their folders, wiki-links, tags and aliases; the .obsidian folder, pictures, canvases and PDFs are left out for now.",
    },
    {
      q: "Is Plotra just Obsidian in a browser?",
      a: "It shares Obsidian's way of working: wiki-links, backlinks, a graph, tabs, split panes and a command palette. It adds tools made for stories, a manuscript, corkboard, plot grid, timeline, canon and continuity, plus live co-editing and sharing. It has no plugin system.",
    },
    {
      q: "Are my notes still Markdown?",
      a: "Plotra stores your writing in its own database so several people can edit it at once. You can export any note, folder or the whole project to Markdown at any time, on any plan.",
    },
    {
      q: "Is Plotra open source?",
      a: "Yes, under AGPL-3.0, and you can host it yourself with one docker compose command. Obsidian is free to use, but the app's own code isn't published.",
    },
  ],
  sources: [
    { label: "Obsidian pricing", url: "https://obsidian.md/pricing" },
    { label: "Obsidian Sync", url: "https://obsidian.md/sync" },
    { label: "Obsidian help: collaborate on a shared vault", url: "https://obsidian.md/help/sync/collaborate" },
    { label: "Obsidian licence", url: "https://obsidian.md/license" },
    { label: "Obsidian forum: live team collaborative editing", url: "https://forum.obsidian.md/t/obsidian-sync-live-team-collaborative-editing/6058" },
  ],
  checked: "2026-10-18",
  audiences: ["obsidian-users", "worldbuilders", "game-masters"],
  guides: ["how-to-write-a-story-bible", "how-to-co-write-a-novel", "campaign-notes-your-players-cant-spoil"],
};
