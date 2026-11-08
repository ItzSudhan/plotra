import type { Comparison } from "@/lib/compare";
import { no, part, say, yes } from "@/lib/compare-cells";
import art from "./art/ellipsus.webp";
import { continuityChecks, plotraPrice, spoilerHorizon, storyBible, suggesting, timeline } from "./shared";
import ai from "../for/shots/workspace-ai.webp";

export const ellipsus: Comparison = {
  slug: "ellipsus",
  name: "Ellipsus",
  title: "Plotra vs Ellipsus: co-write and keep the world straight",
  description:
    "Plotra vs Ellipsus for co-writers: live co-writing in both, plus a linked story bible, timeline and continuity checks in Plotra. Neither trains AI on your work.",
  headline: ["Co-write the book,", "and keep the world straight."],
  intro:
    "Ellipsus is a lovely place to write with other people: live co-writing, drafts you can merge, chat beside the page and a firm promise of no generative AI. Plotra shares the respect for your writing and adds the world around it: a story bible linked to every scene, a timeline, a plot grid and continuity checks, all in the same project you co-write in.",
  summary: "Live co-writing in both, with a linked story bible, timeline and continuity checks around the draft.",
  art: {
    src: art,
    alt: "Two fountain pens crossing over one shared page, beside a small box of index cards and a ribbon laid out like a timeline",
  },
  verdict: {
    them: [
      "You want a simple, beautiful place to write together, and nothing more",
      "You write fan fiction and publish to AO3",
      "You want a firm guarantee that generative AI will never be in the app",
    ],
    plotra: [
      "Your story has a world to keep track of: a cast, places, rules, dates",
      "You'd like a corkboard, plot grid and timeline of the same scenes",
      "You want continuity checks and who-knows-what tracking",
      "You'd like it open source, with the option to host it yourself",
    ],
  },
  strengths: [
    {
      title: "Live co-writing",
      body: "Write together in real time and see each other's cursors, with comments and chat beside the page.",
    },
    {
      title: "Drafts and merging",
      body: "Branch a draft, try something, compare it with the original and merge what works.",
    },
    {
      title: "No generative AI",
      body: "A public commitment not to include generative AI, not to train on your work, and no ads.",
    },
    {
      title: "Free collaborators",
      body: "Unlimited documents, drafts and collaborators on the free plan.",
    },
    {
      title: "Made for fan fiction",
      body: "Publish straight to AO3, and import Markdown and Word.",
    },
    {
      title: "Own your licence",
      body: "Plus is $6 a month, and after 24 months the licence is yours.",
    },
  ],
  glance: {
    cowrite: yes(),
    manuscript: yes(),
    bible: no("Not on its feature list"),
    timeline: no("Not on its feature list"),
    anyOs: yes(),
    free: yes("Unlimited collaborators"),
    open: no(),
  },
  table: [
    {
      group: "Writing together",
      rows: [
        { feature: "Live co-writing with cursors", plotra: yes(), them: yes() },
        { feature: "Comments", plotra: yes("With replies and resolve"), them: yes() },
        { feature: "Suggested changes", plotra: yes("Accept or reject each"), them: part("Drafts you compare and merge") },
        { feature: "Chat beside the page", plotra: no(), them: yes("Moving to Plus") },
        { feature: "Collaborators on the free plan", plotra: say("3 members, 5 guests per project"), them: say("Unlimited") },
      ],
    },
    {
      group: "The story world",
      rows: [
        { feature: "Story bible linked to the scenes", plotra: yes(), them: no("Not on its feature list") },
        { feature: "Timeline and plot grid", plotra: yes(), them: no("Not on its feature list") },
        { feature: "Continuity checks and who knows what", plotra: yes("Rule-based, no AI"), them: no("Not on its feature list") },
      ],
    },
    {
      group: "AI and ownership",
      rows: [
        { feature: "Trains AI on your writing", plotra: no("Never"), them: no("Never") },
        { feature: "Generative AI in the app", plotra: part("Off unless the owner turns it on"), them: no("A firm no") },
        { feature: "Import", plotra: say("Word, Markdown, plain text"), them: say("Word and Markdown") },
        { feature: "Export", plotra: say("Word, RTF, Markdown, plain text, PDF, EPUB"), them: say("PDF, Markdown, AO3") },
        { feature: "Open source, self-hostable", plotra: yes("AGPL-3.0"), them: no() },
      ],
    },
  ],
  features: [
    storyBible,
    timeline,
    continuityChecks,
    spoilerHorizon,
    suggesting,
    {
      title: "AI is off unless you want it",
      body: "A new workspace has no AI in it. Only its owner can switch it on, with your own key or a local model, and Plotra never trains AI on your writing either way.",
      points: ["Off by default, for the whole workspace", "Your own key or a local model on Free", "Never trained on your writing"],
      shot: {
        src: ai,
        alt: "The AI tab of the workspace settings with Allow AI in this workspace switched off, and the three things that follow from switching it on",
      },
    },
  ],
  pricing: {
    rows: [
      ["Free", "Every feature; 3 members, 5 guests per project", "Unlimited documents, drafts and collaborators"],
      ["Paid", "Pro: $10 a month or $96 a year for the workspace", "Plus: $6 a month, yours after 24 months; or $99 once"],
      ["Host it yourself", plotraPrice.selfHost, "–"],
    ],
    note: "Ellipsus's prices are in US dollars, from its pricing page.",
  },
  switching: {
    title: "Moving from Ellipsus, or using both",
    intro: "Your documents move across as Markdown, and your co-writer can join the same afternoon.",
    steps: [
      { title: "Export as Markdown", body: "Export each document from Ellipsus as Markdown." },
      { title: "Import them", body: "In Plotra, choose Import… and add the files. Headings become chapters and scenes." },
      { title: "Invite your co-writer", body: "Add them by email. You'll see each other's cursors in the first scene you open." },
      { title: "Build the cast and places", body: "Make a page for each, and type [[ in the scenes to link them." },
      { title: "Lay out the plot", body: "Give scenes dates and threads to fill the timeline and the plot grid." },
      { title: "Run a continuity check", body: "Mark the secrets and who learns them, and see what doesn't line up." },
    ],
  },
  faq: [
    {
      q: "Is Plotra a good Ellipsus alternative?",
      a: "If your story needs a world kept straight beside the draft, a cast, places, a timeline and continuity checks, yes. If you want the simplest possible place to co-write, with chat and AO3 publishing, Ellipsus is lovely for that.",
    },
    {
      q: "Does Plotra use AI?",
      a: "Only if the workspace's owner switches it on, with their own API key, a local model or, on Pro, hosted credits. It's off by default, and Plotra never trains AI on your writing. Continuity checks are rule-based and use no AI.",
    },
    {
      q: "Can we co-write live in Plotra?",
      a: "Yes. Open the same scene and you see each other's named cursors, and the text merges as you type, with comments, suggestions and version history.",
    },
    {
      q: "Is Plotra free for co-writers?",
      a: "The Free plan has every feature and room for three workspace members, plus five guests per shared project. Pro is $10 a month for the whole workspace, with 25 members.",
    },
  ],
  sources: [
    { label: "Ellipsus pricing", url: "https://ellipsus.com/pricing" },
    { label: "Ellipsus download and apps", url: "https://ellipsus.com/download" },
    { label: "Ellipsus blog: new in Q1 2024", url: "https://ellipsus.com/blog/new-in-ellipsus-q1-2024" },
  ],
  checked: "2026-10-18",
  audiences: ["co-writers", "novelists", "web-serial-writers"],
  guides: ["how-to-co-write-a-novel", "how-to-write-a-story-bible", "how-to-avoid-plot-holes"],
};
