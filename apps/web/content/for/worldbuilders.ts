import type { Audience } from "@/lib/audiences";
import codex from "../blog/shots/bible-codex.webp";
import graph from "./shots/view-graph.webp";
import publish from "./shots/module-publish.webp";
import relationships from "./shots/view-relationships.webp";
import timeline from "./shots/view-timeline.webp";

export const worldbuilders: Audience = {
  slug: "worldbuilders",
  name: "Worldbuilders",
  icon: "planet-bold-duotone",
  title: "A worldbuilding app that keeps your story linked",
  description:
    "Build your world as linked pages: factions, species and magic systems with fields of your own, a calendar for your world, and a wiki that spoils nothing.",
  headline: ["Build the world,", "then write in it."],
  intro:
    "Characters, places, factions, species and magic systems as linked pages with fields you choose, a map of who is bound to whom, a timeline in your world's own calendar, and the story itself in the same project. When you show the world to readers, show them only what they have reached.",
  summary: "A page for every faction, species and magic system, a calendar of your own, and the story in the same project.",
  hero: {
    src: graph,
    alt: "The Graph: every note in the project as a dot coloured by kind and every link as a line, with search and filters above",
  },
  pains: [
    {
      title: "The wiki and the book drift apart",
      body: "The world lives in one tool and the manuscript in another, and every change has to be made twice.",
    },
    {
      title: "Dates that only work on Earth",
      body: "Your world has thirteen months and its own eras, and every timeline tool assumes January.",
    },
    {
      title: "A wiki that spoils the ending",
      body: "Readers want a wiki of your world. Yours has every secret in it.",
    },
  ],
  features: [
    {
      title: "A page for everything in the world",
      body: "Characters and places are built in. Nine more kinds start you off (factions, objects, events, species, cultures, languages, religions, systems and themes), and you can rename them, reshape them or make your own, each with its own fields.",
      points: [
        "Fields that point at other pages: a faction's leader, an object's owner",
        "Text, numbers, dates, choices and checkboxes",
        "A canon status on every page: Canon, Draft, Speculative, Retconned",
      ],
      shot: {
        src: codex,
        alt: "The Codex open on The potion: a list of entry types on the left, its text in the middle, and its Owner, Kept at and Significance fields with a Mentioned in list on the right",
        caption: "An object in the Codex: its fields, and every page that mentions it.",
      },
    },
    {
      title: "Who is bound to whom",
      body: "Draw the relationships between your characters as a map, each line labelled: mentor, rival, married in secret. The graph shows every link in the project, or only the pages around the one you are on.",
      points: [
        "Relationship types of your own",
        "A global graph and a local one, with filters and colours by kind",
        "Every page lists the scenes and pages that link to it",
      ],
      shot: {
        src: relationships,
        alt: "The Relationships map: five characters joined by labelled lines such as Mentor of, Enemy, cousins and married in secret",
      },
    },
    {
      title: "A timeline in your world's calendar",
      body: "Make a calendar with your own months, the length of a day and named eras, then place scenes and events on it. Lanes split the timeline by plot thread or point of view, and the continuity checks read the same dates.",
      points: [
        "Up to 60 months, each as long as you like",
        "Eras: with AE starting in 300, the year 312 reads as 13 AE",
        "In story order, or in the order a reader meets it",
      ],
      shot: {
        src: timeline,
        alt: "A timeline with a lane for each plot thread, scenes and events placed on their story dates across a week, and the Calendar and Lanes controls above",
      },
    },
    {
      title: "A wiki for readers, without the spoilers",
      body: "Choose a book, a chapter or a session and download a small website about your world: a page for every revealed character, place and world entry, linked to each other, holding only what readers have been told by then.",
      points: [
        "Passages you tagged as never revealed are always left out",
        "Plain files: put them on any host that serves a folder",
        "A search box once there are more than eight pages",
      ],
      shot: {
        src: publish,
        alt: "The Publish view: what to publish and as of which release at the top, then cards for an EPUB, a manuscript PDF, a series bible and a public wiki",
      },
    },
  ],
  steps: [
    {
      title: "Switch on the world bible",
      body: "In a new project, turn on World bible and the nine starting kinds appear: factions, objects, events, species and more.",
    },
    {
      title: "Shape the kinds to your world",
      body: "Rename them, delete the ones you don't need, and add fields: a species' lifespan, a magic system's limits and costs.",
    },
    {
      title: "Link everything",
      body: "Type [[ in any page or scene. The Codex, the graph and every backlink list build themselves from those links.",
    },
    {
      title: "Give the world a calendar",
      body: "Name the months, set the length of a day, start an era, and put the history on a timeline.",
    },
    {
      title: "Decide what is canon",
      body: "Mark pages Canon, Speculative or Retconned. A retcon asks for the reason and keeps the old text as a version.",
    },
    {
      title: "Write the story in it",
      body: "Chapters and scenes live in the same binder as the world they link to. When readers arrive, give them the wiki.",
    },
  ],
  tools: [
    {
      name: "World Anvil or Campfire",
      good: "Worldbuilding, templates and public wikis.",
      adds: "The manuscript and the world in one linked project, live co-writing, open source, and every feature on the Free plan.",
    },
    {
      name: "Obsidian",
      good: "Local Markdown, plugins, a graph of your notes.",
      adds: "Built for stories: kinds with fields, a calendar of your own, canon and a spoiler-safe wiki, with live co-editing built in.",
    },
    {
      name: "A spreadsheet",
      good: "Flexible, and nothing new to learn.",
      adds: "Pages that link to each other and to the scenes they appear in, so nothing has to be copied across by hand.",
    },
  ],
  faq: [
    {
      q: "Can I make my own templates for factions, species or magic systems?",
      a: "Yes. Each kind of page has its own name, icon, colour and fields. A field can be text, a number, a date, one or several choices, a checkbox, or a link to another page, such as a faction's leader. Nine kinds are made for you to start from.",
    },
    {
      q: "Does Plotra support fantasy calendars?",
      a: "Yes. A calendar has its own months (up to 60, each with its own number of days), its own length of day and its own eras. A timeline can use any calendar in the project. Custom calendars have no leap years.",
    },
    {
      q: "Can I publish a wiki of my world?",
      a: "Yes. The Publish view downloads a small website of plain files: a page for every revealed character, place and world entry, linked together. Plotra doesn't host it; put it anywhere that serves static files, and download it again when the world grows.",
    },
    {
      q: "Can I put maps in my world?",
      a: "Yes. Make a map from any picture, pin places and characters to it, draw regions and paths, and sort them into layers. A pin can open another map, so maps nest, and every place lists the maps it's on. Everyone in the project sees changes as they're made.",
    },
    {
      q: "Can one world be shared by several books or projects?",
      a: "Yes. A project can use another project in the same workspace as its world bible, so a book and its sequel, or a series and a game, share one set of characters and places.",
    },
    {
      q: "Is it free?",
      a: "Yes. Every kind of page, view and module is on the Free plan, with no time limit and no card. The Free plan limits room, not features: 10 projects and 50 MB of files per workspace.",
    },
  ],
  guides: ["how-to-write-a-story-bible", "how-to-make-a-story-timeline", "campaign-notes-your-players-cant-spoil"],
  docs: { label: "The world bible in the docs", path: "/docs/canon" },
};
