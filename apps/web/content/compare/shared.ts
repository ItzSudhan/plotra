import type { Comparison } from "@/lib/compare";
import asOf from "../blog/shots/campaign-as-of-session-1.webp";
import gmNote from "../blog/shots/campaign-gm-note.webp";
import publish from "../blog/shots/campaign-publish.webp";
import codex from "../blog/shots/bible-codex.webp";
import links from "../blog/shots/bible-links.webp";
import comments from "../blog/shots/cowrite-comments.webp";
import cursors from "../blog/shots/cowrite-cursors.webp";
import history from "../blog/shots/cowrite-history.webp";
import suggest from "../blog/shots/cowrite-suggest.webp";
import continuity from "../blog/shots/holes-continuity.webp";
import knows from "../blog/shots/holes-who-knows.webp";
import corkboardShot from "../blog/shots/outline-corkboard.webp";
import grid from "../blog/shots/outline-plot-grid.webp";
import threads from "../blog/shots/timeline-threads.webp";
import horizon from "../for/shots/canon-horizon-codex.webp";
import exportDialog from "../for/shots/export-dialog.webp";
import importDialog from "../for/shots/import-dialog.webp";
import panes from "../for/shots/panes-split.webp";
import graph from "../for/shots/view-graph.webp";

// What Plotra adds, shown in the app, as the comparison pages use it. Every
// claim here is one the docs make. A page picks the ones that answer what its
// readers are missing, and may change the words to fit.

type Feature = Comparison["features"][number];

export const liveCowriting: Feature = {
  title: "Your co-writer, in the same scene",
  body: "Open the same scene and you see each other's cursors, with names, and the text merges as you type. Nobody waits for the file, and nobody edits an old copy.",
  points: ["Named cursors and presence", "Comments on the words they're about", "Suggesting mode, accepted or rejected one change at a time"],
  shot: {
    src: cursors,
    alt: "The Balcony scene open in the editor. A passage is highlighted in green under the name Priya Nair, and her avatar is in the status bar",
  },
};

export const comment: Feature = {
  title: "Comments on the words they're about",
  body: "Select a passage and comment on it. Threads stay attached to the words, replies stack under them, and either of you resolves a thread when it's settled.",
  points: ["A comment on a passage or on a whole scene", "Replies, resolve and reopen", "The bell tells you when someone answers"],
  shot: {
    src: comments,
    alt: "The Comments panel beside the scene: a thread that quotes a passage, a comment from Alex Morgan, a reply from Priya Nair, and Reply and Resolve buttons",
  },
};

export const suggesting: Feature = {
  title: "Suggest, don't overwrite",
  body: "Turn on suggesting and what you type is marked as an insertion, what you delete as a deletion, until your co-writer accepts or rejects it.",
  points: ["Changes shown in the text and listed in the panel", "Accept or reject one at a time", "Your editor can work the same way"],
  shot: {
    src: suggest,
    alt: "A suggestion in the text: three words struck through in red and a replacement underlined in green, and the panel showing the change with Reject and Accept buttons",
  },
};

export const versions: Feature = {
  title: "Every version, kept",
  body: "Plotra saves versions of each scene as you write, and you can name one before a big rewrite. Compare any version with the current text, and restore it.",
  points: ["The latest 40 automatic versions of every note", "Named versions, kept until you delete them", "Restoring is itself undoable"],
  shot: { src: history, alt: "The History tab listing a named version, Before Priya's pass, above an automatic snapshot" },
};

export const storyBible: Feature = {
  title: "A story bible linked to the draft",
  body: "Characters, places, objects and rules are pages in the same project as the manuscript, with fields you choose. Type [[ in a scene to link one, and every page lists the scenes that mention it.",
  points: ["Your own entry types and fields", "Backlinks, with the sentence around each link", "Hover a link to read the page without leaving the scene"],
  shot: {
    src: codex,
    alt: "The Codex open on The potion: a list of entry types on the left, its text in the middle, and its Owner, Kept at and Significance fields with a Mentioned in list on the right",
  },
};

export const backlinks: Feature = {
  title: "Every mention, in one list",
  body: "Each page lists the scenes that link to it, with the sentence around each link, and the mentions that aren't linked yet. Rename a character and every link shows the new name.",
  points: ["Backlinks and outgoing links", "Unlinked mentions, ready to link", "Aliases, so a nickname finds the page"],
  shot: {
    src: links,
    alt: "The potion's page with the Links tab open, listing four backlinks, each with the sentence around the link, then outgoing links and unlinked mentions",
  },
};

export const timeline: Feature = {
  title: "A timeline built from your scenes",
  body: "Give scenes and events a story date and they take their place on a timeline, in a lane for each plot thread, on a real calendar or one you invent.",
  points: ["Lanes for threads, characters or places", "Custom calendars for invented worlds", "Story order and reading order, side by side"],
  shot: {
    src: threads,
    alt: "A timeline split into lanes for two plot threads, with scenes and events at their dates and a line joining the scenes in reading order",
  },
};

export const plotGrid: Feature = {
  title: "A plot grid, and a corkboard",
  body: "See every scene against every thread in a grid, or shuffle cards on a corkboard. Each view shows the same scenes, so moving a card moves the scene in the book.",
  points: ["Plot grid, corkboard, outline and table", "Drag to reorder the book", "Reorder the cards and the binder follows, for everyone"],
  shot: {
    src: grid,
    alt: "The Plot grid: five scenes down the side, grouped by chapter, and two thread columns. Each filled cell says what happens to that thread in that scene",
  },
};

export const corkboardView: Feature = {
  title: "The corkboard, and the scene beside it",
  body: "Split the screen and keep the corkboard of a chapter open next to the scene you're writing. Tabs and panes work the way they do in a code editor.",
  points: ["Tabs and split panes", "Corkboard, outline, plot grid and table views", "A quick switcher and a command palette"],
  shot: {
    src: panes,
    alt: "Plotra with two panes side by side: the scene The Balcony on the left and the corkboard of its chapter on the right",
  },
};

export const continuityChecks: Feature = {
  title: "Continuity checks, without AI",
  body: "Plotra reads your scenes against what your story bible says, and reports what doesn't fit: a character who refers to a secret before learning it, an event out of order.",
  points: ["Rule-based, so every report says why", "Who knows which secret, and since when", "Setups and their payoffs"],
  shot: {
    src: continuity,
    alt: "The Continuity view reporting that Romeo refers to the secret marriage in The Balcony, before he learns it in The Secret Wedding",
  },
};

export const whoKnows: Feature = {
  title: "Who knows what",
  body: "Mark the secrets in your story and which characters learn each one, in which scene, and whether they hold the truth or a lie. Plotra keeps track as the draft changes.",
  points: ["Each secret, and who knows it", "Where they learned it", "The truth, or a false version"],
  shot: {
    src: knows,
    alt: "The Who knows what tab: two secrets, each listing the characters who know, where they learned it, and whether they hold the truth or a false version",
  },
};

export const spoilerHorizon: Feature = {
  title: "The spoiler horizon",
  body: "Tag a passage with the book, episode or session where readers learn it. Set the whole project as of a release, and everything later is hidden: blurred in the text, dimmed in the binder, left out of the Codex, the graph and the timeline.",
  points: ["Tag a whole page or a single passage", "Releases for books, episodes or sessions", "Share a world that's safe to read"],
  shot: {
    src: horizon,
    alt: "Juliet Capulet's page in the Codex with the spoiler horizon on: the passage revealed in Part 2 is blurred, and the list says four pages are not revealed yet",
  },
};

export const asOfSession: Feature = {
  title: "The world, as of any session",
  body: "Tag each secret with the session it's revealed in. Switch the project to Session 3, and what your players haven't found yet blurs out, everywhere.",
  points: ["Sessions as releases", "GM-only passages that are never revealed", "A wiki for players, spoiler-free"],
  shot: {
    src: asOf,
    alt: "An NPC's page with World as of Session 1 switched on. Both tagged passages are blurred, and later sessions and the secrets folder are dimmed in the binder",
  },
};

export const gmNotes: Feature = {
  title: "Notes only the GM reads",
  body: "Mark one paragraph, or a whole page, as never revealed. It stays in your prep, beside what the players can see, and never leaves the project when you publish.",
  points: ["Per-paragraph tags", "A secrets folder for the whole campaign", "The binder dims what the table hasn't reached"],
  shot: {
    src: gmNote,
    alt: "Session prep from the sample campaign. One paragraph beginning GM: has a bar down its side and the tag Never revealed",
  },
};

export const playerWiki: Feature = {
  title: "A player wiki that follows the campaign",
  body: "Publish the world as of the last session you played: a static wiki you can host anywhere, with nothing in it the players haven't earned yet.",
  points: ["Published as of a release", "A zip of plain HTML, yours to host", "Publish again after every session"],
  shot: {
    src: publish,
    alt: "The Publish view with As of set to Session 2: Fire, and a Public wiki card with a Download .zip button",
  },
};

export const graphView: Feature = {
  title: "The graph of your story",
  body: "Every note is a dot and every link a line, coloured by kind. Filter it to characters and places, or to what one scene touches.",
  points: ["Global and local graphs", "Filters, and a local graph around one note", "Hidden past the spoiler horizon, like everything else"],
  shot: {
    src: graph,
    alt: "The Graph: every note in the project as a dot coloured by kind and every link as a line, with search and filters above",
  },
};

export const importFiles: Feature = {
  title: "Bring your writing with you",
  body: "Import a Scrivener or Plottr project, a World Anvil world, or Word, rich text, Markdown and plain-text files, or a whole folder of them. A preview shows what will be made before anything is.",
  points: ["Scrivener, Plottr and World Anvil, kept in their shape", "Word, RTF, Markdown, plain text, or an Obsidian vault", "Split at headings or scene breaks"],
  shot: {
    src: importDialog,
    alt: "The Import dialog with a folder chosen, the options for splitting notes, and a preview of the chapters and scenes it will create",
  },
};

export const exportFiles: Feature = {
  title: "Take it with you, any time",
  body: "Export a scene, a chapter or the whole book as Word, Markdown or plain text, or print it to PDF. No plan limit ever blocks an export.",
  points: ["Word, Markdown, Markdown as a zip, plain text and PDF", "On every plan", "Going back to Free deletes nothing"],
  shot: { src: exportDialog, alt: "The Export dialog offering Word, Markdown, Markdown as a zip, plain text and PDF" },
};

export const corkboard: Feature = {
  title: "Scene cards you can shuffle",
  body: "Every scene is a card with its synopsis. Drag cards on the corkboard and the binder order follows.",
  points: ["Corkboard, outline and plot grid", "Synopsis, status and point of view on each card", "The same scenes in every view"],
  shot: { src: corkboardShot, alt: "The Corkboard for the chapter Violent Delights: two index cards, The Secret Wedding and The Duel, each with its synopsis and word count" },
};

/** Plotra's own column in the price tables. */
export const plotraPrice = {
  free: "Free: every feature, 10 projects, 3 members, 5 guests per project",
  pro: "Pro: $10 a month or $96 a year for the whole workspace, 25 members",
  selfHost: "Free to host yourself (AGPL-3.0)",
};
