import type { Audience } from "@/lib/audiences";
import share from "../blog/shots/beta-share.webp";
import links from "../blog/shots/bible-links.webp";
import comments from "../blog/shots/cowrite-comments.webp";
import cursors from "../blog/shots/cowrite-cursors.webp";
import history from "../blog/shots/cowrite-history.webp";
import suggest from "../blog/shots/cowrite-suggest.webp";

export const coWriters: Audience = {
  slug: "co-writers",
  name: "Co-writers",
  icon: "users-group-two-rounded-bold-duotone",
  title: "Co-writing software: write a novel together, live",
  description:
    "Write a novel with a co-author in real time: named cursors, comments, suggestions and version history, in a project that also holds your story bible.",
  headline: ["Write the same scene", "at the same time."],
  intro:
    "Two writers, one draft, always the latest. Open the same scene and you see each other's cursors, with names, and the text merges as you type. Comment on a line, suggest a change, go back to an earlier version, and keep the characters, places and timeline you both rely on in the same project.",
  summary: "Named cursors in the same scene, comments, suggestions and history, around one shared story bible.",
  hero: {
    src: cursors,
    alt: "The Balcony scene open in the editor. A passage is highlighted in green under the name Priya Nair, and her avatar is in the status bar",
  },
  pains: [
    {
      title: "final_v3_REAL.docx",
      body: "Copies of chapters go back and forth by email, and someone always edits the old one.",
    },
    {
      title: "Whose turn is it?",
      body: "When only one of you can have the file open, the other one is waiting.",
    },
    {
      title: "Two memories of one world",
      body: "You remember her eyes as grey, your co-writer remembers green, and the book says both.",
    },
  ],
  features: [
    {
      title: "Comments on the words they're about",
      body: "Select a passage and comment on it. Threads stay attached to the words, replies stack under them, and either of you resolves a thread when it's settled. No more \"see my note on page 40\".",
      points: [
        "A comment on a passage or on a whole scene",
        "Replies, resolve and reopen",
        "The bell tells you when someone answers",
      ],
      shot: {
        src: comments,
        alt: "The Comments panel beside the scene: a thread that quotes a passage, a comment from Alex Morgan, a reply from Priya Nair, and Reply and Resolve buttons",
      },
    },
    {
      title: "Suggest, don't overwrite",
      body: "Turn on suggesting and what you type is marked as an insertion, what you delete as a deletion, until your co-writer accepts or rejects it. Edit each other's chapters without anyone losing a line they cared about.",
      points: [
        "Changes shown in the text and listed in the panel",
        "Accept or reject one at a time",
        "Your editor can work the same way",
      ],
      shot: {
        src: suggest,
        alt: "A suggestion in the text: three words struck through in red and a replacement underlined in green, and the panel showing the change with Reject and Accept buttons",
      },
    },
    {
      title: "Every version, kept",
      body: "Plotra saves versions of each scene as you write, and you can name one before a big rewrite. Compare any version with the current text, and restore it if the rewrite didn't work.",
      points: [
        "The latest 40 automatic versions of every note",
        "Named versions, kept until you delete them",
        "Restoring is itself undoable",
      ],
      shot: {
        src: history,
        alt: "The History tab listing a named version, Before Priya's pass, above an automatic snapshot",
      },
    },
    {
      title: "One story bible for both of you",
      body: "Characters, places and rules live as linked pages in the same project as the draft. When one of you settles a fact, the other sees it, and every page lists the scenes that mention it.",
      points: [
        "Type [[ to link a character or a place",
        "Continuity checks that read both your chapters",
        "A timeline you both place scenes on",
      ],
      shot: {
        src: links,
        alt: "A page with the Links tab open, listing every scene that links to it, each with the sentence around the link",
      },
    },
    {
      title: "Bring in your editor and beta readers",
      body: "Share one project by email as a viewer, a commenter or an editor. Beta readers comment and react without seeing your workspace, and an editor can suggest changes beside you.",
      points: [
        "Three roles for one project, plus members for the whole workspace",
        "5 guests per project on Free, 200 on Pro",
        "A read-only link for someone without an account",
      ],
      shot: {
        src: share,
        alt: "The Share dialog: a field for an email address with a role menu, a list of two commenters, the workspace's two members, and a switch for a read-only link",
      },
    },
  ],
  steps: [
    {
      title: "Make a workspace for the book",
      body: "Invite your co-writer to it by email. On the Free plan a workspace has room for three members, counting you.",
    },
    {
      title: "Agree on the world first",
      body: "Put the main characters, the places and the rules in as linked pages, so you start from the same facts.",
    },
    {
      title: "Split the chapters, or don't",
      body: "Take a chapter each, or write the same scene together. Plotra doesn't make you choose.",
    },
    {
      title: "Comment instead of messaging",
      body: "Ask about a line on the line itself, so the question and the answer stay with the text.",
    },
    {
      title: "Edit in suggesting mode",
      body: "Rewrite each other's scenes as suggestions, and accept what works.",
    },
    {
      title: "Name a version before a big change",
      body: "Then rewrite freely. The old version is one click away.",
    },
  ],
  tools: [
    {
      name: "Google Docs",
      good: "Writing together, live, in a browser.",
      adds: "Structure: a binder of chapters and scenes, links, a story bible and a timeline, in the same place you co-write.",
    },
    {
      name: "Scrivener",
      good: "Long manuscripts and compiling them.",
      adds: "Your co-writer in the same scene, at the same moment, in any browser.",
    },
    {
      name: "Ellipsus",
      good: "Co-writing, with a firm stance against AI.",
      adds: "A linked story bible, a timeline and continuity checks next to the draft. AI is off unless you switch it on, and Plotra is open source.",
    },
  ],
  faq: [
    {
      q: "How much does it cost to co-write in Plotra?",
      a: "Nothing to start. The Free plan has every feature and room for three workspace members, so two or three co-writers can work on it. Pro is $10 a month for the whole workspace, not per person, and makes room for 25 members.",
    },
    {
      q: "Can we write in the same scene at the same time?",
      a: "Yes. Open the same scene and you each see the other's cursor and selection, in their colour and under their name. Text from both of you is merged as you type, so nobody takes turns and nothing is locked.",
    },
    {
      q: "What's the difference between a co-writer and a guest?",
      a: "A co-writer is usually a member of the workspace, and can write in every project in it. A guest is given one project as a viewer, a commenter or an editor, which suits an editor or a beta reader. A project can have 5 guests on Free and 200 on Pro.",
    },
    {
      q: "What happens if one of us loses the connection?",
      a: "Keep writing. Your changes are kept in your browser and merged with your co-writer's when you reconnect, so neither set is lost. This works for scenes you have already opened in that browser.",
    },
    {
      q: "Can we undo each other's changes?",
      a: "Yes. Every scene keeps its recent versions, and you can name a version before a big rewrite. Compare any version with the current text and restore it if you need to. For changes you want to approve first, use suggesting mode.",
    },
    {
      q: "Who owns what we write?",
      a: "You do. Plotra never trains AI on your writing, and everyone in the project can export it, on either plan, whatever limits the workspace has reached.",
    },
  ],
  guides: ["how-to-co-write-a-novel", "how-to-work-with-beta-readers", "how-to-write-a-story-bible"],
  docs: { label: "Working together, in the docs", path: "/docs/collaboration" },
};
