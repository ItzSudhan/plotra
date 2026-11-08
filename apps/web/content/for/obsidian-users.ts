import type { Audience } from "@/lib/audiences";
import cursors from "../blog/shots/cowrite-cursors.webp";
import threads from "../blog/shots/timeline-threads.webp";
import link from "./shots/editor-link.webp";
import exportDialog from "./shots/export-dialog.webp";
import graph from "./shots/view-graph.webp";
import importDialog from "./shots/import-dialog.webp";

export const obsidianUsers: Audience = {
  slug: "obsidian-users",
  name: "Obsidian users",
  icon: "folder-with-files-bold-duotone",
  title: "Writing fiction in Obsidian? Bring your vault along",
  description:
    "Import your Obsidian vault with its [[links]] intact, then add what a story needs: a timeline, a plot grid, canon, continuity checks and live co-writing.",
  headline: ["Obsidian, built for stories,", "with your co-writer in it."],
  intro:
    "If you write fiction in Obsidian, you already think in [[links]]. Plotra keeps that: bring the vault in with its links, aliases and tags, and keep typing [[ the way you do now. Then add what a story needs and a vault doesn't have built in: a timeline, a plot grid, canon, continuity checks, and other people writing in it with you, live.",
  summary: "Your vault imports with its links. Then a timeline, a plot grid, canon checks and live co-writing.",
  hero: {
    src: graph,
    alt: "The Graph: every note as a dot coloured by kind and every link as a line, with the Global and Local switch, a search box and filters above",
  },
  pains: [
    {
      title: "A vault for one",
      body: "Sharing a vault with a co-author means sync conflicts, or taking turns.",
    },
    {
      title: "A writing app made of plugins",
      body: "A timeline plugin, a long-form plugin and a query for the cast, and the setup is yours to keep working.",
    },
    {
      title: "Players in the vault",
      body: "Sharing a campaign vault with the table means sharing the secrets in it too.",
    },
  ],
  features: [
    {
      title: "Your vault, with its links",
      body: "Choose the vault folder. Notes come in with their [[links]], aliases, headings and embeds, front-matter tags come with them, and .obsidian and other dot-folders are left out. A preview shows what will be made before anything is.",
      points: [
        "[[Note|alias]], [[Note#Heading]] and ![[embeds]]",
        "Single line breaks kept, the way Obsidian shows them",
        "Callouts, highlights and task lists come across",
      ],
      shot: {
        src: importDialog,
        alt: "The Import dialog with a folder chosen, the options for splitting notes, and a preview of the chapters and scenes it will create",
      },
    },
    {
      title: "Keep typing [[",
      body: "Links, backlinks with the sentence around each one, unlinked mentions, embeds and a graph, local or global. The habits you have carry straight over.",
      points: [
        "Link to a note, a heading or a note in a folder",
        "Aliases that links can use",
        "A graph with filters and colours by kind",
      ],
      shot: {
        src: link,
        alt: "Typing two square brackets and Fr in a scene opens Link to a note, offering Friar Laurence, Friar Laurence's cell and Create Fr",
      },
    },
    {
      title: "What a story needs, built in",
      body: "A timeline built from your scenes' story dates, in your world's own calendar. A plot grid of scenes against threads. A corkboard, a codex of the world, canon status, and continuity checks that read all of it. Nothing to install, nothing to keep in step.",
      points: [
        "Lanes by plot thread or point of view",
        "Who knows what, and setups and payoffs",
        "A spoiler horizon for series and campaigns",
      ],
      shot: {
        src: threads,
        alt: "A timeline split into lanes for two plot threads, with scenes and events at their dates and a line joining the scenes in reading order",
      },
    },
    {
      title: "Someone else in the vault, live",
      body: "Invite a co-writer or a co-GM and write in the same note at the same time, each cursor named. Comments, suggestions and version history come with it.",
      points: [
        "Text merges as you both type",
        "Viewers, commenters and editors for one project",
        "A player-safe wiki for the table",
      ],
      shot: {
        src: cursors,
        alt: "A scene open in the editor with a co-writer's selection highlighted under her name, and her avatar in the status bar",
      },
    },
    {
      title: "Leave the way you came",
      body: "Export the whole project as a zip of Markdown files, a file per note, mirroring the binder, with the [[links]] kept. It is the closest thing to a copy of your vault, and it imports back into Obsidian or into Plotra.",
      points: [
        "Front matter with title, kind, order and tags",
        "Word, plain text and PDF too",
        "Export is never stopped by a plan limit",
      ],
      shot: {
        src: exportDialog,
        alt: "The Export dialog offering Word, Markdown, Markdown as a zip, plain text and PDF",
      },
    },
  ],
  steps: [
    {
      title: "Make a project",
      body: "Answer the first questions and choose the kind of story: a novel, a campaign or something else.",
    },
    {
      title: "Import the vault",
      body: "New…, then Import…, then Choose a folder…. Check the preview and import.",
    },
    {
      title: "Sort the notes into kinds",
      body: "Mark characters, places and scenes as what they are, so the codex, the timeline and the continuity checks can read them.",
    },
    {
      title: "Switch on the tools you want",
      body: "World bible, Releases & reveals, Publishing: each is a switch, and none is locked behind a plan.",
    },
    {
      title: "Bring someone in",
      body: "Invite a co-writer to the workspace, or share one project with an editor, a beta reader or a co-GM.",
    },
  ],
  tools: [
    {
      name: "Obsidian",
      good: "Local Markdown files you own, plugins for anything, and a personal knowledge base.",
      adds: "Built for stories: a timeline, a plot grid, canon and continuity checks, and live co-editing, with nothing to install.",
    },
  ],
  faq: [
    {
      q: "Will my Obsidian links survive the import?",
      a: "Yes. [[Links]] become real links, with display text, links to headings, links to a note in a folder, and embeds. Block references point at the whole note. A link that matches nothing stays in the text exactly as typed, so nothing is lost.",
    },
    {
      q: "What doesn't come across?",
      a: "Pictures, canvases and PDFs stored in the vault are left out, and the dialog counts them; an embedded picture stays in the text as typed. Plugins don't come across either: Plotra reads the Markdown, not what a plugin makes of it. Obsidian comments are removed.",
    },
    {
      q: "Does Plotra keep my notes as local Markdown files?",
      a: "No, and it's the biggest difference. Plotra keeps a project in its database, on the hosted version or on a server you run. Plotra installs as an app that opens offline, a whole project can be kept on your device, and you can export the whole project as Markdown at any time.",
    },
    {
      q: "Can I go back to Obsidian?",
      a: "Yes. Export the project as Markdown, a file per note in a zip: folders mirror the binder and [[links]] are kept. Unzip it and open the folder as a vault.",
    },
    {
      q: "Is Plotra open source?",
      a: "Yes, under the AGPL. You can run all of it on your own server with Docker, with every feature and no plan limits.",
    },
    {
      q: "Is it free?",
      a: "Yes. The hosted Free plan has every feature, with no time limit and no card: 10 projects, 50 MB of files and 3 members per workspace.",
    },
  ],
  guides: ["how-to-write-a-story-bible", "how-to-co-write-a-novel", "campaign-notes-your-players-cant-spoil"],
  docs: { label: "Importing a vault, in the docs", path: "/docs/import-export/import" },
};
