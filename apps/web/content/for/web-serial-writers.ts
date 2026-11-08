import type { Audience } from "@/lib/audiences";
import reactions from "../blog/shots/beta-reactions.webp";
import continuity from "../blog/shots/holes-continuity.webp";
import tag from "./shots/editor-block-tag.webp";
import publish from "./shots/module-publish.webp";
import horizon from "./shots/canon-horizon-codex.webp";
import roadmap from "./shots/canon-roadmap.webp";

export const webSerialWriters: Audience = {
  slug: "web-serial-writers",
  name: "Web-serial writers",
  icon: "library-bold-duotone",
  title: "Web serial writing software, with a reader wiki",
  description:
    "Write a web serial chapter by chapter and keep its world straight. Plotra knows what readers have been told by each chapter and builds a spoiler-free wiki.",
  headline: ["A reader wiki that never spoils", "the next chapter."],
  intro:
    "A serial is published while it's written, so every chapter fixes facts you can't take back. In Plotra each chapter is a release: the project knows what readers have been told by any chapter, warns you when the story contradicts itself, and builds a wiki for readers that stops where they are.",
  summary: "Each chapter a release, continuity across hundreds of chapters, and a wiki that stops where your readers are.",
  hero: {
    src: horizon,
    alt: "A character's page with the spoiler horizon on: the passage revealed in a later part is blurred, and the list says four pages are not revealed yet",
  },
  pains: [
    {
      title: "Chapter 212 contradicts chapter 9",
      body: "Your readers remember everything, and rereading two hundred chapters to check one detail isn't possible.",
    },
    {
      title: "The wiki spoils the arc",
      body: "Readers ask for a wiki, and one written from your notes gives the next arc away.",
    },
    {
      title: "No time to keep notes up to date",
      body: "A posting schedule leaves no time to maintain a wiki beside the draft.",
    },
  ],
  features: [
    {
      title: "Each chapter is a release",
      body: "Release a chapter and everything in it counts as revealed. The roadmap lists what readers learn in each one, and where: the chapter itself, a side story, a social post. Choose World as of Chapter 40 to see the story as your readers know it.",
      points: [
        "Write ahead without losing track of what's out",
        "Channels of your own: main text, side stories, Q&As",
        "The binder dims what readers haven't reached",
      ],
      shot: {
        src: roadmap,
        alt: "The Release roadmap with three releases, a column for each channel, and a button to reveal a note in each cell",
      },
    },
    {
      title: "Foreshadow now, reveal later",
      body: "Tag a single passage with the chapter where readers learn it, or as never revealed. The project and the wiki hold it back until then, so you can write the truth into a character's page today.",
      points: [
        "A canon status for every page, and retcons kept as versions",
        "Setups and payoffs, for every promise to your readers",
        "Who knows what, secret by secret",
      ],
      shot: {
        src: tag,
        alt: "The Tag this block dialog with three fields: Canon, Revealed and Layer",
      },
    },
    {
      title: "Continuity across the whole serial",
      body: "Plotra reads the dates, places and secrets you record, and finds the character who appears after their death, is in two places at once, or knows a secret before the chapter where they learn it. Plain rules, no AI.",
      points: [
        "Contradictions first, then what's worth a look",
        "A plot thread picked up after it was resolved",
        "Ages that don't match the timeline",
      ],
      shot: {
        src: continuity,
        alt: "The Continuity view reporting that a character refers to a secret before the scene where they learn it",
      },
    },
    {
      title: "A wiki as of the latest chapter",
      body: "Choose the latest chapter and download a small website about your world: a page for every revealed character, place and world entry, linked together. Link it from your serial's page and replace it when the next arc lands.",
      points: [
        "Nothing past the chapter you choose",
        "Plain files, for any host that serves a folder",
        "Light and dark, and readable on a phone",
      ],
      shot: {
        src: publish,
        alt: "The Publish view: what to publish and as of which release, then cards for an EPUB, a manuscript PDF, a series bible and a public wiki",
      },
    },
    {
      title: "Beta readers before you post",
      body: "Share the project with a few early readers as commenters. They react to a passage with one click or comment on it, and you fix the chapter before it goes out.",
      points: ["Six one-click reactions", "Questionnaires at the end of an arc", "Free for up to 5 people a project"],
      shot: {
        src: reactions,
        alt: "A sentence selected in a scene, and a bubble under it offering Comment and six reaction faces",
      },
    },
  ],
  steps: [
    {
      title: "Start a web serial",
      body: "Choose Web serial under Something else when you start a project. A release in it is called a chapter.",
    },
    {
      title: "Switch on two modules",
      body: "Releases & reveals, for what readers know by each chapter, and Publishing, for the wiki.",
    },
    {
      title: "Draft ahead",
      body: "Write chapters in the binder as far ahead as your buffer allows, linking characters and places as you go.",
    },
    {
      title: "Release each chapter as it posts",
      body: "Record it on the roadmap, so the project knows what is out.",
    },
    {
      title: "Check before you post",
      body: "Run the continuity checks and read the chapter as of the one before it.",
    },
    {
      title: "Update the wiki",
      body: "Download it as of the latest chapter, and replace the old copy.",
    },
  ],
  tools: [
    {
      name: "Google Docs",
      good: "Quick to start, easy to share with a beta reader.",
      adds: "A binder for hundreds of chapters, linked pages for the cast, and a record of what readers know by each chapter.",
    },
    {
      name: "Scrivener",
      good: "Long manuscripts in one file.",
      adds: "Releases, the spoiler horizon and a reader wiki, in any browser, with beta readers in the project.",
    },
  ],
  faq: [
    {
      q: "Does Plotra post my chapters to Royal Road, Wattpad or AO3?",
      a: "No. Plotra is where you write the serial and keep its world. You post where your readers are: copy the chapter across, or export it as Word, Markdown or plain text.",
    },
    {
      q: "How does the reader wiki work?",
      a: "Choose a chapter in the Publish view and download a zip of plain web pages: one for each character, place and world entry revealed by then, linked to each other. Passages tagged for a later chapter or as never revealed are left out. Plotra doesn't host it; put it on any static host.",
    },
    {
      q: "Can beta readers see chapters I haven't posted?",
      a: "Yes, and everything else in the project too: sharing a project shows the whole of it. To show a reader only part of the story, share a separate project or send an export made as of a chapter.",
    },
    {
      q: "Is it free?",
      a: "Yes. Every feature is on the Free plan, with no time limit and no card. A workspace on it holds 10 projects and 50 MB of files, and a project can be shared with 5 people.",
    },
    {
      q: "Does it use AI?",
      a: "Not unless you turn it on. The continuity checks are plain rules, the AI agent is off by default and runs on your own key or a local model, and your writing is never used to train a model.",
    },
  ],
  guides: ["how-to-write-a-story-bible", "how-to-avoid-plot-holes", "how-to-work-with-beta-readers"],
  docs: { label: "Releases and reveals, in the docs", path: "/docs/canon/releases-and-reveals" },
};
