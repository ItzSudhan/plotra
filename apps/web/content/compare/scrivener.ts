import type { Comparison } from "@/lib/compare";
import { no, part, say, yes } from "@/lib/compare-cells";
import art from "./art/scrivener.webp";
import { continuityChecks, importFiles, liveCowriting, plotraPrice, storyBible, timeline } from "./shared";

export const scrivener: Comparison = {
  slug: "scrivener",
  name: "Scrivener",
  title: "Plotra vs Scrivener: a Scrivener alternative to co-write",
  description:
    "Plotra vs Scrivener, side by side: what Scrivener does best, where Plotra adds live co-writing, a linked story bible and any-browser access, and the prices.",
  headline: ["Scrivener, if your co-writer", "could be in it with you."],
  intro:
    "Scrivener is the writing studio a generation of novelists grew up on: a binder, a corkboard and a compile that turns a draft into a book. Plotra keeps the binder and the corkboard, and adds what a desktop app can't: your co-writer in the same scene, a story bible linked to every mention, and any computer with a browser, Linux and Chromebooks included.",
  summary: "Scrivener's binder and corkboard, with your co-writer in the same scene and a story bible linked to the draft.",
  art: {
    src: art,
    alt: "A worn leather-bound manuscript book on a desk beside an open notebook, with an orange pen and a violet pen lying on its pages",
  },
  verdict: {
    them: [
      "You write alone, on a Mac, Windows PC or iPad, and want a one-time price",
      "You compile to many formats, with fine control over the result",
      "You want everything offline, in files on your own disk",
    ],
    plotra: [
      "You write with a co-author, an editor or beta readers, at the same time",
      "You want the characters, places and timeline linked to the scenes",
      "You use Linux, a Chromebook or more than one computer",
      "You'd like it open source, with the option to host it yourself",
    ],
  },
  strengths: [
    {
      title: "The binder",
      body: "A long manuscript, broken into pieces you can see, move and label, with synopses and word counts. It's the idea every writing app since has borrowed.",
    },
    {
      title: "The corkboard",
      body: "Index cards that are the manuscript: shuffle the cards and the chapters reorder. On the iPad too.",
    },
    {
      title: "Compile",
      body: "One draft out to Word, PDF, EPUB, Kindle, Final Draft and more, with deep control over how each looks.",
    },
    {
      title: "Research in the project",
      body: "PDFs, images and web pages kept in the same project as the draft, open beside the scene you're writing.",
    },
    {
      title: "A one-time price",
      body: "Buy a licence once, with a 30-day trial first. No subscription.",
    },
    {
      title: "Offline, on your disk",
      body: "Your project is files on your own computer. No internet needed to write.",
    },
  ],
  glance: {
    cowrite: no(),
    manuscript: yes(),
    bible: part("Character and setting sheets"),
    timeline: no("Not on its feature list"),
    anyOs: no("Mac, Windows, iOS"),
    free: no("30-day trial"),
    open: no(),
  },
  table: [
    {
      group: "Writing",
      rows: [
        { feature: "Binder of chapters and scenes", plotra: yes(), them: yes() },
        { feature: "Corkboard of scene cards", plotra: yes(), them: yes() },
        { feature: "Outline view", plotra: yes(), them: yes() },
        { feature: "Distraction-free writing", plotra: yes("Focus mode, typewriter scrolling"), them: yes("Composition mode") },
        { feature: "Screenplay formatting", plotra: yes("With Fountain in and out"), them: yes("With Final Draft export") },
      ],
    },
    {
      group: "Working together",
      rows: [
        { feature: "Two writers in the same scene at once", plotra: yes("Live, with named cursors"), them: no() },
        { feature: "Comments and suggested changes", plotra: yes(), them: part("Comments and revision marks, in your own copy") },
        { feature: "Share with an editor or beta readers", plotra: yes("By email, as viewer, commenter or editor"), them: no("Send them a file") },
        { feature: "Version history", plotra: yes("Automatic and named versions"), them: yes("Snapshots") },
      ],
    },
    {
      group: "The story world",
      rows: [
        { feature: "Wiki-links between scenes and characters", plotra: yes("Type [[, with backlinks"), them: part("Links between documents") },
        { feature: "Story bible with your own fields", plotra: yes(), them: part("Template sheets") },
        { feature: "Timeline of story dates", plotra: yes("With lanes and custom calendars"), them: no("Not on its feature list") },
        { feature: "Plot grid of scenes against threads", plotra: yes(), them: no() },
        { feature: "Continuity checks", plotra: yes("Rule-based, no AI"), them: no() },
      ],
    },
    {
      group: "Where and how",
      rows: [
        { feature: "Platforms", plotra: say("Any modern browser, on any OS"), them: say("macOS, Windows, iOS and iPadOS") },
        { feature: "Linux and Chromebook", plotra: yes(), them: no() },
        { feature: "Works offline", plotra: part("Installs as an app that opens offline; keep whole projects on the device"), them: yes() },
        { feature: "Sync between devices", plotra: yes("Always the latest, nothing to set up"), them: part("Through Dropbox") },
        { feature: "Export", plotra: say("Word, RTF, Final Draft, Markdown, plain text, PDF, EPUB, with layout presets"), them: say("Word, RTF, PDF, EPUB, Kindle, Final Draft, plain text and more") },
        { feature: "Open source, self-hostable", plotra: yes("AGPL-3.0"), them: no() },
      ],
    },
  ],
  features: [
    liveCowriting,
    storyBible,
    timeline,
    continuityChecks,
    {
      ...importFiles,
      title: "Bring the manuscript over",
      body: "Choose your .scriv project and it comes across as you left it: parts, chapters and scenes in their order, synopses on every card, and your Characters and Places folders as linked pages. A preview shows what will be made before anything is.",
      points: ["Scrivener 3 and Scrivener 2 projects", "Binder, text, synopses and keywords", "Characters and places become story-bible pages"],
    },
  ],
  pricing: {
    rows: [
      ["To start", "Free, with every feature, no card", "30-day free trial"],
      ["To keep", "Free, or Pro at $10 a month per workspace", "$59.99 once for macOS or Windows"],
      ["More than one platform", "Included: it's the same app in every browser", "$95.98 for macOS and Windows; iOS $23.99, sold separately"],
      ["Co-writers", "3 workspace members free; 25 on Pro, same price", "Each writer buys their own licence"],
      ["Host it yourself", plotraPrice.selfHost, "–"],
    ],
    note: "Scrivener's prices are in US dollars from the Literature & Latte store.",
  },
  voices: [
    {
      quote: "…doesn't support realtime collaboration…",
      who: "A Scrivener user sharing screen-sharing workarounds on the Literature & Latte forum, 2024",
      url: "https://forum.literatureandlatte.com/t/using-screen-sharing-for-realtime-remote-scrivener-collaboration/142855",
    },
    {
      quote: "How can we bring back a Linux version of Scrivener?",
      who: "A paying user on the Literature & Latte forum, January 2026",
      url: "https://forum.literatureandlatte.com/t/how-can-we-bring-back-a-linux-version-of-scrivener/152953",
    },
  ],
  switching: {
    title: "Moving from Scrivener, or using both",
    intro:
      "Plotra reads Scrivener projects directly: the binder, the text and the synopses come across in one import, and nothing in your .scriv is changed.",
    steps: [
      { title: "Close the project in Scrivener", body: "So everything you wrote is saved to the .scriv before Plotra reads it." },
      { title: "Import it", body: "In Plotra, choose Import… and choose the project's .scriv folder. On a Mac, drop the .scriv on the dialog, or compress it and choose the .zip." },
      { title: "Check the preview", body: "Parts, chapters and scenes appear in their order; Characters and Places folders become characters and places. Research PDFs and pictures stay in Scrivener." },
      { title: "Link the world", body: "Type [[ in a scene to link a character or a place. Every page collects its mentions." },
      { title: "Set it up like Scrivener", body: "In Customize, choose Work like… and Like Scrivener: the manuscript, corkboard and outline come first, paragraphs are indented, and ⌥⌘F (Ctrl+Alt+F) opens full-screen writing." },
      { title: "Invite your co-writer", body: "Add them to the workspace by email. On Free, a workspace has room for three, counting you." },
      { title: "Keep Scrivener for compile, if you like", body: "Export the finished book as Word and compile it wherever you prefer. Export is never held back by a plan." },
    ],
  },
  faq: [
    {
      q: "Is Plotra a good Scrivener alternative?",
      a: "If you write with someone else, want a linked story bible and timeline, or use Linux or a Chromebook, yes. If you write alone on a Mac or Windows PC and depend on Scrivener's compile, Scrivener may still suit you better, and you can use the two side by side.",
    },
    {
      q: "Can two people work in Scrivener at the same time?",
      a: "Scrivener doesn't offer real-time collaboration; projects sync between your own devices through Dropbox. In Plotra two or more writers can work in the same scene at once and see each other's cursors.",
    },
    {
      q: "Does Scrivener run on Linux or a Chromebook?",
      a: "Literature & Latte sells Scrivener for macOS, Windows and iOS. Plotra runs in any modern browser, so it works on Linux and Chromebooks as it does on a Mac or a PC.",
    },
    {
      q: "Can I import a Scrivener project into Plotra?",
      a: "Yes. Choose the project's .scriv folder (or, on a Mac, drop it on the Import dialog or choose a .zip of it). Parts, chapters and scenes keep their order, synopses and keywords come with them, and documents in Characters and Places folders become characters and places. Research PDFs and pictures, document notes, labels and status are left out. Scrivener 3 and 2 projects both work.",
    },
    {
      q: "Is Plotra free?",
      a: "The Free plan has every feature, with no trial clock and no card. Pro is $10 a month for a whole workspace, for more projects, storage and people. You can also host Plotra yourself for free under the AGPL-3.0 licence.",
    },
    {
      q: "Does Plotra work offline?",
      a: "Yes, for writing. Install Plotra from the browser and it opens in its own window, with or without a connection. Choose Keep on this device and every scene of a project is there offline; what you write is merged with your co-writer's when you reconnect. Comments, versions and sharing need the connection, and the project lives on a server rather than in files on your disk: if that matters most, Scrivener is the better fit.",
    },
  ],
  sources: [
    { label: "Scrivener overview, Literature & Latte", url: "https://www.literatureandlatte.com/scrivener/overview" },
    { label: "Scrivener store and prices", url: "https://www.literatureandlatte.com/store/scrivener" },
    {
      label: "Forum: screen sharing for real-time Scrivener collaboration (2024)",
      url: "https://forum.literatureandlatte.com/t/using-screen-sharing-for-realtime-remote-scrivener-collaboration/142855",
    },
    {
      label: "Forum: bringing back a Linux version of Scrivener (2026)",
      url: "https://forum.literatureandlatte.com/t/how-can-we-bring-back-a-linux-version-of-scrivener/152953",
    },
  ],
  checked: "2026-10-18",
  audiences: ["novelists", "co-writers"],
  guides: ["how-to-co-write-a-novel", "how-to-outline-a-novel", "how-to-write-a-story-bible"],
};
