import type { Audience } from "@/lib/audiences";
import reactions from "../blog/shots/beta-reactions.webp";
import links from "../blog/shots/bible-links.webp";
import continuity from "../blog/shots/holes-continuity.webp";
import grid from "../blog/shots/outline-plot-grid.webp";
import horizon from "./shots/canon-horizon-codex.webp";
import panes from "./shots/panes-split.webp";

export const novelists: Audience = {
  slug: "novelists",
  name: "Novelists",
  icon: "book-2-bold-duotone",
  title: "Novel writing software with a linked story bible",
  description:
    "Write your novel and keep its story bible in one linked project. Plotra tracks canon, catches continuity slips without AI and keeps a series straight.",
  headline: ["Your manuscript and your story bible,", "linked."],
  intro:
    "Plotra keeps the draft and the world behind it in one project. Scenes link to the characters and places they mention, the same chapters open as an outline, index cards or a plot grid, and for a series Plotra remembers what is canon and what readers have been told by each book.",
  summary: "Draft in scenes, keep the story bible beside the manuscript, and keep a series straight from book to book.",
  hero: {
    src: panes,
    alt: "Plotra with two panes side by side: the scene The Balcony on the left and the corkboard of its chapter on the right",
  },
  pains: [
    {
      title: "The bible goes stale",
      body: "Your notes say one thing, chapter nine says another, and you find out when a reader does.",
    },
    {
      title: "Book two forgets book one",
      body: "Ages, scars and secrets drift between books, and rereading the first one to check takes a week.",
    },
    {
      title: "Eight tabs to write one scene",
      body: "The draft in one app, the timeline in a spreadsheet, the notes on your phone, and none of them agree.",
    },
  ],
  features: [
    {
      title: "Type [[ and the scene links to the world",
      body: "Link a character, a place or an object as you write. Every page then lists the scenes that mention it, each with the sentence around it, so the story bible fills itself in while you draft.",
      points: [
        "Backlinks, with the sentence each one sits in",
        "Unlinked mentions, to link when you're ready",
        "The Codex: the whole world in one view, by kind",
      ],
      shot: {
        src: links,
        alt: "The potion's page with the Links tab open, listing four backlinks, each with the sentence around the link, then outgoing links and unlinked mentions",
        caption: "Every scene that mentions the potion, with the sentence around each mention.",
      },
    },
    {
      title: "See the shape of the book",
      body: "Look at the same chapters as a table, a stack of index cards, or a grid of scenes against plot threads. The subplot that goes quiet for six chapters shows up as an empty column before your editor finds it.",
      points: [
        "Outline, Corkboard and Plot grid, all the same project",
        "Beat sheets to write into: Save the Cat, the Hero's Journey, three acts",
        "A scene and its corkboard side by side in split panes",
      ],
      shot: {
        src: grid,
        alt: "The Plot grid: five scenes down the side, grouped by chapter, and two thread columns. Each filled cell says what happens to that thread in that scene",
        caption: "The empty cell shows the feud going quiet during The Balcony.",
      },
    },
    {
      title: "Continuity checks, with no AI",
      body: "Plotra reads the dates, places and secrets you record, and tells you when a character appears after their death, is in two places at once, is an age the timeline doesn't allow, or knows a secret before the scene where they learn it. They are plain rules, so they never guess.",
      points: [
        "Who knows what: each secret, who learns it and where",
        "Setups and payoffs, so no promise to the reader is dropped",
        "A timeline built from the story dates you give your scenes",
      ],
      shot: {
        src: continuity,
        alt: "The Continuity view reporting that Romeo refers to the secret marriage in The Balcony, before he learns it in The Secret Wedding",
        caption: "One slip, left in the sample novel on purpose, and the check that finds it.",
      },
    },
    {
      title: "Write book two with book one's eyes",
      body: "Give each book a release, then choose World as of Book 1. The binder, the Codex, the graph and the Read view show only what readers know by then, so the recap at the start of book two can't give away book four.",
      points: [
        "Tag a single paragraph for a later book, or as never revealed",
        "A canon status on every page, and retcons kept as versions",
        "Two books can share one world bible from separate projects",
      ],
      shot: {
        src: horizon,
        alt: "Juliet Capulet's page in the Codex with the spoiler horizon on: the passage revealed in Part 2 is blurred, and the list says four pages are not revealed yet",
        caption: "Juliet's page as a reader of Part 1 knows her. What Part 2 reveals is blurred.",
      },
    },
    {
      title: "From beta readers to a finished file",
      body: "Share the project with beta readers as commenters: they comment on a passage or react to it with one click. Your editor suggests changes you accept or reject. When it's done, the manuscript leaves as a Word file, an EPUB or a PDF.",
      points: [
        "Six one-click reactions, and questionnaires for your readers",
        "Suggesting mode, and a version history you can restore from",
        "Word in standard manuscript format, for an agent",
      ],
      shot: {
        src: reactions,
        alt: "A sentence selected in The Tomb scene, and a bubble under it offering Comment and six reaction faces",
        caption: "What a beta reader sees when they select a passage.",
      },
    },
  ],
  steps: [
    {
      title: "Answer three questions",
      body: "Name a character, a place and what they want or hide, choose A novel, and say whether it's one book or a series. Or open the Romeo and Juliet sample and look around first.",
    },
    {
      title: "Bring the draft in",
      body: "Import a Word, Markdown or plain-text file, split into chapters and scenes at its headings or its scene breaks.",
    },
    {
      title: "Draft in scenes",
      body: "Every change saves as you type, and keeps working when the connection drops. Set a daily goal and a target for the book.",
    },
    {
      title: "Link as you go",
      body: "Type [[ for every character and place. The bible grows out of the draft instead of beside it.",
    },
    {
      title: "Check it before anyone reads it",
      body: "Run the continuity checks, mark what is canon, and set a release for each book of a series.",
    },
    {
      title: "Send it out",
      body: "Share it with beta readers and your editor, then export Word for an agent, an EPUB for readers or a PDF to print.",
    },
  ],
  tools: [
    {
      name: "Scrivener",
      good: "Long manuscripts, compiling, a one-time price.",
      adds: "A co-writer in the scene with you, a linked story bible and continuity checks, in any browser, Linux and Chromebooks included.",
    },
    {
      name: "Google Docs",
      good: "Writing with other people, live.",
      adds: "Structure: a binder of scenes, links, a story bible and a timeline. Google Docs knows your words. Plotra knows your story.",
    },
    {
      name: "World Anvil or Campfire",
      good: "Worldbuilding and public wikis.",
      adds: "Your world and your book in the same linked project, with every feature on the Free plan.",
    },
  ],
  faq: [
    {
      q: "Is Plotra free for novelists?",
      a: "Yes. The Free plan has every view, module and feature, with no time limit and no card. A workspace on it holds 10 projects and 50 MB of files. Pro is $10 a month for the whole workspace and adds room, more collaborators and hosted AI.",
    },
    {
      q: "Does Plotra use AI to write my book?",
      a: "No. Plotra works without AI, and the continuity checks are plain rules. The AI agent is off until you turn it on, runs on your own key or a local model if you do, and nothing you write is ever used to train a model.",
    },
    {
      q: "Can I bring in a manuscript I've already started?",
      a: "Yes. Plotra imports Scrivener projects directly, binder, synopses and all, and Word (.docx), rich text (.rtf), Markdown and plain text, which it can split into chapters and scenes at their headings or their scene breaks.",
    },
    {
      q: "Can I export my novel?",
      a: "Any time, on either plan: Word and RTF in standard manuscript format or a layout of your own (fonts, spacing, chapter headings, scene breaks), Markdown, plain text and PDF. The Publishing module adds an EPUB ready for Kindle and the other stores, with a cover, and a series bible. No plan limit ever stops an export.",
    },
    {
      q: "Is it good for writing a series?",
      a: "That is what it is built for. Give each book a release and Plotra knows what readers have been told by each one, so you can look at the world as it stood at the end of any book. A sequel can also use the first book's project as its world bible.",
    },
    {
      q: "Does it work offline?",
      a: "Your writing does. Install Plotra from the browser and it opens with or without a connection. Notes you have opened keep saving on your device, and Keep on this device fetches every note of a project ahead of time. It's all merged with everyone else's when you're back. Comments, versions and sharing need the connection.",
    },
  ],
  guides: ["how-to-write-a-story-bible", "how-to-avoid-plot-holes", "how-to-outline-a-novel"],
  docs: { label: "The novelist's route through the docs", path: "/docs/for/novelists" },
};
