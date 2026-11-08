import type { Comparison } from "@/lib/compare";
import { no, part, yes } from "@/lib/compare-cells";
import art from "./art/google-docs.webp";
import { backlinks, continuityChecks, corkboardView, importFiles, plotraPrice, storyBible, timeline } from "./shared";

export const googleDocs: Comparison = {
  slug: "google-docs",
  name: "Google Docs",
  title: "Plotra vs Google Docs for writing a novel together",
  description:
    "Writing a novel in Google Docs? Plotra keeps the live co-writing and adds a binder of scenes, a linked story bible, a timeline and continuity checks.",
  headline: ["Google Docs knows your words.", "Plotra knows your story."],
  intro:
    "Google Docs made writing together easy: open a link and you're both in the document, typing. It's where many co-written novels start. As the book grows, a story needs more than pages: chapters you can move, a cast you can look up, dates that line up. Plotra keeps the live co-writing and builds the rest around it.",
  summary: "The live co-writing you're used to, with a binder of scenes, a linked story bible and a timeline around it.",
  art: {
    src: art,
    alt: "Loose sheets of paper on the left of a desk gathering, toward the right, into a tabbed binder, a timeline strip and character cards",
  },
  verdict: {
    them: [
      "You're writing something short, or one document is enough",
      "Everyone already lives in Google Workspace",
      "You need the fastest way to share a page with anyone",
    ],
    plotra: [
      "Your novel has outgrown one long document, or a folder of them",
      "You want characters, places and dates linked to the scenes",
      "You'd like a corkboard, a plot grid and a timeline of the same scenes",
      "You want to catch continuity errors before your readers do",
    ],
  },
  strengths: [
    {
      title: "The best at live editing",
      body: "Real-time co-editing, comments and suggestions that just work, for any number of people.",
    },
    {
      title: "Everyone has it",
      body: "Free with a Google account, in any browser and on phones, with nothing to install.",
    },
    {
      title: "Document tabs",
      body: "Up to 100 tabs in one document, nested three levels deep, each with its own outline.",
    },
    {
      title: "Version history",
      body: "Every change kept, named versions, and who wrote what.",
    },
    {
      title: "Word, in and out",
      body: "Opens and saves Word files cleanly, so an agent or editor can use whatever they like.",
    },
    {
      title: "Offline, if you set it up",
      body: "Mark files for offline use in Chrome or Edge and keep writing without a connection.",
    },
  ],
  glance: {
    cowrite: yes(),
    manuscript: part("One document, or tabs"),
    bible: no("General-purpose"),
    timeline: no(),
    anyOs: yes(),
    free: yes("With a Google account"),
    open: no(),
  },
  table: [
    {
      group: "Writing together",
      rows: [
        { feature: "Live co-editing with cursors", plotra: yes(), them: yes() },
        { feature: "Comments and suggestions", plotra: yes(), them: yes() },
        { feature: "Version history", plotra: yes("Automatic and named"), them: yes("Automatic and named") },
        { feature: "Share with guests by role", plotra: yes("Viewer, commenter or editor"), them: yes("Viewer, commenter or editor") },
      ],
    },
    {
      group: "Shaping a book",
      rows: [
        { feature: "Chapters and scenes as separate pieces", plotra: yes("A binder you can reorder"), them: part("Tabs, up to 100") },
        { feature: "Corkboard, outline, plot grid", plotra: yes(), them: no() },
        { feature: "Synopsis, status and point of view per scene", plotra: yes("Typed properties"), them: no() },
        { feature: "Word counts and goals", plotra: yes(), them: part("Word count") },
      ],
    },
    {
      group: "The story world",
      rows: [
        { feature: "Character and place pages with fields", plotra: yes(), them: no() },
        { feature: "Wiki-links with backlinks", plotra: yes("Every page lists its mentions"), them: part("Links between documents") },
        { feature: "Timeline of story dates", plotra: yes("Lanes and custom calendars"), them: no() },
        { feature: "Continuity checks and who knows what", plotra: yes("Rule-based, no AI"), them: no() },
      ],
    },
    {
      group: "Where and how",
      rows: [
        { feature: "Works in any browser", plotra: yes(), them: yes() },
        { feature: "Works offline", plotra: part("Installs as an app that opens offline; keep whole projects on the device"), them: part("Chrome or Edge, files marked one by one") },
        { feature: "Import and export Word", plotra: yes(), them: yes() },
        { feature: "Open source, self-hostable", plotra: yes("AGPL-3.0"), them: no() },
      ],
    },
  ],
  features: [
    corkboardView,
    storyBible,
    backlinks,
    timeline,
    continuityChecks,
    {
      ...importFiles,
      title: "Bring the Doc with you",
      body: "Download your document as Word and import it. Heading 1 becomes a chapter, Heading 2 a scene, and a line of *** can start a new scene. A preview shows what will be made first.",
    },
  ],
  pricing: {
    rows: [
      ["To start", "Free, with every feature", "Free with a Google account"],
      ["For a team", "Pro: $10 a month for the whole workspace, 25 members", "Google Workspace, priced per user"],
      ["Host it yourself", plotraPrice.selfHost, "–"],
    ],
  },
  switching: {
    title: "Moving a novel out of Google Docs",
    intro: "If your headings are in order, the move takes a few minutes, and your co-writer can join you right away.",
    steps: [
      { title: "Tidy the headings", body: "Make chapter titles Heading 1 and scene titles Heading 2. If you use *** between scenes, that works too." },
      { title: "Download as Word", body: "File, Download, Microsoft Word (.docx). One file per document or tab." },
      { title: "Import into Plotra", body: "Choose Import…, add the files, and check the preview of chapters and scenes." },
      { title: "Keep it as quiet as Docs", body: "In Customize, choose Work like… and Like Google Docs: one long document, comments and history to hand, and little else on screen." },
      { title: "Invite your co-writer", body: "Add them to the workspace by email; you'll see each other's cursors in the first scene you open." },
      { title: "Build the cast", body: "Make pages for the main characters and places, and type [[ in scenes to link them." },
      { title: "Lay out the plot", body: "Give scenes dates and threads, and open the timeline and plot grid to see the shape of the book." },
    ],
  },
  faq: [
    {
      q: "Is Google Docs good for writing a novel?",
      a: "It's excellent for writing together, and document tabs help organise a long draft. What it doesn't have is anything story-specific: no character or world pages, no corkboard or plot grid, no story timeline and no continuity checks. Plotra keeps the live co-writing and adds those.",
    },
    {
      q: "Can my co-writer and I type at the same time in Plotra, like in Google Docs?",
      a: "Yes. Open the same scene and you see each other's cursors with names, and the text merges as you type. Comments, suggestions and version history work as you'd expect.",
    },
    {
      q: "How do I move my novel from Google Docs to Plotra?",
      a: "Download the document as Word and import the .docx. With Split at headings on, Heading 1 becomes a chapter and Heading 2 a scene. You can also start a new scene at every *** break.",
    },
    {
      q: "Is Plotra free like Google Docs?",
      a: "The Free plan has every feature and room for three workspace members, so two or three co-writers can work for free. Pro is $10 a month for the whole workspace, not per person.",
    },
  ],
  sources: [
    { label: "Google Docs help: use document tabs", url: "https://support.google.com/docs/answer/15499791" },
    { label: "Google Docs help: work offline", url: "https://support.google.com/docs/answer/6388102" },
    { label: "Google Workspace pricing", url: "https://workspace.google.com/pricing" },
  ],
  checked: "2026-10-18",
  audiences: ["co-writers", "novelists", "web-serial-writers"],
  guides: ["how-to-co-write-a-novel", "how-to-outline-a-novel", "how-to-write-a-story-bible"],
};
