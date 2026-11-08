import type { Comparison } from "@/lib/compare";
import { no, part, say, yes } from "@/lib/compare-cells";
import art from "./art/campfire.webp";
import { continuityChecks, liveCowriting, plotraPrice, spoilerHorizon, storyBible, timeline } from "./shared";

export const campfire: Comparison = {
  slug: "campfire",
  name: "Campfire",
  title: "Plotra vs Campfire: a Campfire Writing alternative",
  description:
    "Plotra vs Campfire Writing: modules, free-plan limits, co-writing, offline use and prices, side by side, with a source for every fact about Campfire.",
  headline: ["Every tool for the story,", "with nothing to unlock."],
  intro:
    "Campfire is a modular writing and worldbuilding app: you pick the modules you need, from characters and timelines to magic systems and languages, and pay for those. Plotra takes the other road. Every view and tool is on the Free plan, with no cap on characters or events, and you and your co-writer can work in the same scene at once.",
  summary: "Every feature on the Free plan, no caps on characters or events, and live co-writing in the same scene.",
  art: {
    src: art,
    alt: "A small lantern on a desk lighting a circle of character cards, scraps of map and manuscript pages gathered around it",
  },
  verdict: {
    them: [
      "You want very detailed worldbuilding modules: magic, languages, species",
      "You'd like a desktop app that works fully offline",
      "You prefer paying once for a lifetime licence",
    ],
    plotra: [
      "You want every tool without counting characters, events or words",
      "You co-write and want to be in the same scene at the same time",
      "You want continuity checks and who-knows-what tracking",
      "You'd like it open source, with the option to host it yourself",
    ],
  },
  strengths: [
    {
      title: "Granular modules",
      body: "Eighteen modules, from characters, locations and timelines to magic systems, languages, species and calendars. Few apps go as deep on worldbuilding detail.",
    },
    {
      title: "Pay for what you use",
      body: "Buy the modules you need, monthly, yearly or for life, or take them all in one Standard plan.",
    },
    {
      title: "Manuscript included",
      body: "A manuscript editor in the same app as the world, with compile to PDF and EPUB at no extra cost.",
    },
    {
      title: "Collaborators are free",
      body: "Unlimited collaborators on every plan; each needs only a free account to view, comment or edit.",
    },
    {
      title: "Desktop, web and mobile",
      body: "A browser app, desktop apps for Mac and Windows that work offline, and mobile apps.",
    },
    {
      title: "Lifetime options",
      body: "Every module, and the whole bundle, can be bought once for life, future modules included in the bundle.",
    },
  ],
  glance: {
    cowrite: part("Collaborators can edit; live co-editing not stated"),
    manuscript: yes(),
    bible: yes(),
    timeline: yes(),
    anyOs: part("Browser; desktop for Mac and Windows"),
    free: part("Capped: 10 characters, 20 events"),
    open: no(),
  },
  table: [
    {
      group: "The world",
      rows: [
        { feature: "Characters, places and items", plotra: yes("Your own types and fields"), them: yes("A module for each") },
        { feature: "Magic systems, languages, species", plotra: part("As your own entry types"), them: yes("Dedicated modules") },
        { feature: "Timeline", plotra: yes("Lanes and custom calendars"), them: yes("Timeline and Calendars modules") },
        { feature: "Maps", plotra: yes("Pins, regions, paths, layers, maps inside maps"), them: yes() },
      ],
    },
    {
      group: "The book",
      rows: [
        { feature: "Manuscript editor", plotra: yes("Binder, corkboard, plot grid"), them: yes() },
        { feature: "Continuity checks and who knows what", plotra: yes("Rule-based, no AI"), them: no() },
        { feature: "Spoiler horizon by book or episode", plotra: yes(), them: no() },
        { feature: "Import", plotra: say("Scrivener, Plottr, World Anvil, Word, Markdown, plain text, a folder of notes"), them: say("From Campfire Pro") },
        { feature: "Export", plotra: say("Word, RTF, Final Draft, Markdown, plain text, PDF, EPUB"), them: say("PDF and EPUB; elements to Word") },
      ],
    },
    {
      group: "Working together",
      rows: [
        { feature: "Collaborators", plotra: yes("3 members and 5 guests per project free"), them: yes("Unlimited, with a free account") },
        { feature: "Two writers in the same scene at once", plotra: yes("Live, with named cursors"), them: part("Not stated on its site") },
        { feature: "Comments and suggested changes", plotra: yes(), them: part("Comments") },
      ],
    },
    {
      group: "Plans and ownership",
      rows: [
        { feature: "Free plan limits", plotra: say("10 projects, 50 MB; no cap on characters, events or words"), them: say("25,000 words, 10 characters, 20 timeline events, 2 maps") },
        { feature: "Over the limit", plotra: say("Nothing is locked; export always works"), them: say("Extra elements become read-only") },
        { feature: "Works offline", plotra: part("Installs as an app that opens offline; keep whole projects on the device"), them: yes("Desktop apps for Mac and Windows") },
        { feature: "Linux", plotra: yes("In the browser"), them: part("In the browser; no desktop app") },
        { feature: "Open source, self-hostable", plotra: yes("AGPL-3.0"), them: no() },
      ],
    },
  ],
  features: [
    {
      ...storyBible,
      title: "Build any kind of entry",
      body: "Make the entry types your world needs, magic systems, languages, species, ships, with the fields you choose. They're pages in the same project as the book, linked from every scene that mentions them.",
    },
    liveCowriting,
    timeline,
    continuityChecks,
    spoilerHorizon,
  ],
  pricing: {
    rows: [
      ["Free", "Every feature, no caps on characters, events or words", "Capped: 25,000 words, 10 characters, 20 events, 2 maps"],
      ["Everything, monthly", "Pro: $10 a month for the workspace", "Standard: $12 a month"],
      ["Everything, yearly", "Pro: $96 a year", "Standard: $99 a year"],
      ["Lifetime", "–", "Standard: $336"],
      ["One module", "–", "From $0.50 a month; Manuscript $2 a month"],
      ["Host it yourself", plotraPrice.selfHost, "–"],
    ],
    note: "Campfire's prices are in US dollars, from its pricing page; the monthly Standard price was shown as a discount from $19.",
  },
  switching: {
    title: "Moving from Campfire, or using both",
    intro: "Your manuscript moves across in minutes. The world takes a little longer, and it's a good moment to link it to the scenes.",
    steps: [
      { title: "Export the manuscript", body: "In Campfire, export your chapters to Word. Keep a backup download of the whole project too." },
      { title: "Import it", body: "In Plotra, choose Import… and pick the files. Headings become chapters and scenes, with a preview first." },
      { title: "Set up your entry types", body: "Make a type for each module you used: characters, locations, magic, species, with the fields you rely on." },
      { title: "Bring the main entries", body: "Add the characters and places the book leans on most. Paste their text from your Word export of each element." },
      { title: "Link as you write", body: "Type [[ in a scene to link a page. Each page gathers its mentions, so you see where every character appears." },
      { title: "Invite your co-writer", body: "Add them by email, and write the same scene together." },
    ],
  },
  faq: [
    {
      q: "Is Plotra a good Campfire alternative?",
      a: "If you want every tool without paying per module or counting characters and events, or you co-write and want to be in the same scene at once, yes. If you need Campfire's very detailed modules for magic, languages and species, or a desktop app that works fully offline, Campfire may suit you better.",
    },
    {
      q: "What are the limits of Campfire's free plan?",
      a: "Campfire's pricing page lists 25,000 manuscript words, 10 characters, 20 timeline events, 2 maps and 5 encyclopedia articles on the free plan, with anything over the limit becoming read-only. Plotra's Free plan limits projects and storage, not characters, events or words.",
    },
    {
      q: "Is Plotra cheaper than Campfire?",
      a: "Plotra's Free plan has every feature. Pro is $10 a month or $96 a year for a whole workspace. Campfire's Standard plan, with every module, is $12 a month, $99 a year or $336 for life, and single modules start at $0.50 a month.",
    },
    {
      q: "Can I make custom worldbuilding categories in Plotra?",
      a: "Yes. Make your own entry types, such as magic systems, species or ships, each with its own fields. They work like any other page: linked from scenes, with backlinks, on the graph and timeline.",
    },
    {
      q: "Does Plotra work offline?",
      a: "Yes, for writing. Install Plotra from the browser and it opens in its own window, with or without a connection. Choose Keep on this device and every note of a project is there offline; your changes merge when you reconnect. Comments, versions and sharing need the connection. Campfire's desktop apps work fully offline.",
    },
  ],
  sources: [
    { label: "Campfire pricing and free-plan limits", url: "https://www.campfirewriting.com/pricing" },
    { label: "Campfire FAQ: collaborators and sharing", url: "https://campfirewriting.com/faq" },
    { label: "Campfire apps: desktop, web and mobile", url: "https://www.campfirewriting.com/apps" },
  ],
  checked: "2026-10-18",
  audiences: ["worldbuilders", "novelists", "co-writers"],
  guides: ["how-to-write-a-story-bible", "how-to-make-a-story-timeline", "how-to-avoid-plot-holes"],
};
