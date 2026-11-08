import type { Comparison } from "@/lib/compare";
import { no, part, say, yes } from "@/lib/compare-cells";
import art from "./art/world-anvil.webp";
import { continuityChecks, liveCowriting, plotraPrice, spoilerHorizon, storyBible, timeline } from "./shared";

export const worldAnvil: Comparison = {
  slug: "world-anvil",
  name: "World Anvil",
  title: "Plotra vs World Anvil: a World Anvil alternative",
  description:
    "Plotra vs World Anvil: worldbuilding tools, manuscripts, co-writing, privacy on the free plan and prices, side by side, with sources for every fact.",
  headline: ["Your world and your book,", "in the same place."],
  intro:
    "World Anvil is a hosted worldbuilding wiki with templates for everything, interactive maps and a large community of worldbuilders and GMs. Plotra puts the world beside the manuscript instead: the scenes you write link to the pages they rely on, you and your co-writer write in them together, and every feature is on the Free plan.",
  summary: "A world bible linked to the manuscript you write in, live co-writing, and every feature on Free.",
  art: {
    src: art,
    alt: "A hand-drawn world map and an open manuscript laid side by side on a desk, stitched together by a single orange thread",
  },
  verdict: {
    them: [
      "You're building a public world for readers or players to browse",
      "You want 25+ article templates, interactive maps and family trees",
      "You'd like a large worldbuilding community around your work",
    ],
    plotra: [
      "The world is there to serve a book or a series you're writing",
      "You want to co-write the manuscript live, beside the world",
      "You want private projects and every feature without paying",
      "You'd rather own the code: Plotra is open source and self-hostable",
    ],
  },
  strengths: [
    {
      title: "A template for everything",
      body: "Over 25 article templates, from characters and settlements to religions and spells, each with the fields worldbuilders reach for.",
    },
    {
      title: "Interactive maps",
      body: "Maps with layers, markers and groups of markers, linked to the articles they show.",
    },
    {
      title: "Chronicles and family trees",
      body: "Parallel timelines, family trees and diplomacy webs for the history and politics of a world.",
    },
    {
      title: "A world to share",
      body: "Public world pages, with secrets and subscriber-only content for players and patrons on paid plans.",
    },
    {
      title: "Community",
      body: "A large, active community of worldbuilders, with challenges and events through the year.",
    },
    {
      title: "Export on every plan",
      body: "World data export is on every tier, Free included.",
    },
  ],
  glance: {
    cowrite: part("Co-authors on paid plans; manuscripts aren't co-written"),
    manuscript: part("Manuscripts, on paid plans"),
    bible: yes(),
    timeline: yes("Advanced timelines on paid plans"),
    anyOs: yes(),
    free: part("2 public worlds, with ads"),
    open: no(),
  },
  table: [
    {
      group: "The world",
      rows: [
        { feature: "Wiki pages for characters, places and things", plotra: yes("30 ready-made types, or your own"), them: yes("25+ templates") },
        { feature: "Interactive maps", plotra: yes("Pins, regions, paths and layers"), them: yes("With layers and markers") },
        { feature: "Family trees and relationship maps", plotra: yes("Relationships map"), them: yes("Family trees, diplomacy webs") },
        { feature: "Timelines", plotra: yes("Lanes and custom calendars"), them: yes("Chronicles; advanced timelines on paid plans") },
        { feature: "Hide what readers or players don't know yet", plotra: yes("Spoiler horizon, by release or session"), them: part("Secrets, on paid plans") },
      ],
    },
    {
      group: "The book",
      rows: [
        { feature: "Write the manuscript", plotra: yes("Binder, corkboard, plot grid"), them: part("Manuscripts, on paid plans") },
        { feature: "Links from scenes to world pages", plotra: yes("Type [[, with backlinks"), them: yes() },
        { feature: "Continuity checks and who knows what", plotra: yes("Rule-based, no AI"), them: no() },
        { feature: "Export the manuscript", plotra: say("Word, RTF, Markdown, plain text, PDF, EPUB"), them: say("HTML, then print to PDF") },
      ],
    },
    {
      group: "Working together",
      rows: [
        { feature: "Co-writers", plotra: yes("3 members free, 25 on Pro"), them: part("4 to 20 co-authors, by paid plan; none on Free") },
        { feature: "Two writers in the same manuscript at once", plotra: yes("Live, with named cursors"), them: no("Manuscripts aren't co-written, per its help") },
      ],
    },
    {
      group: "Plans and ownership",
      rows: [
        { feature: "Private projects on the free plan", plotra: yes(), them: no("Free worlds are public") },
        { feature: "Ads", plotra: no("None, on any plan"), them: part("On the free plan") },
        { feature: "Storage on the free plan", plotra: say("50 MB, files up to 10 MB"), them: say("100 MB, uploads up to 1 MB") },
        { feature: "Open source, self-hostable", plotra: yes("AGPL-3.0"), them: no("Hosted only") },
      ],
    },
  ],
  features: [
    {
      ...storyBible,
      title: "The world bible, inside the book",
      body: "Characters, places, factions and rules are pages in the same project as the manuscript, with the fields you choose. Type [[ in a scene to link one, and each page lists every scene that mentions it.",
    },
    liveCowriting,
    spoilerHorizon,
    timeline,
    continuityChecks,
  ],
  pricing: {
    rows: [
      ["Free", "Every feature, private projects, no ads", "Freeman: 2 public worlds, ads, no manuscripts or co-authors"],
      ["Paid, monthly", "Pro: $10 a month for the workspace", "Master $7 · Grandmaster $12 · Sage $34"],
      ["Paid, yearly", "Pro: $96 a year", "Master $54 · Grandmaster $99 · Sage $300"],
      ["Lifetime", "–", "Grandmaster $650 · Sage $1,350"],
      ["Co-writers", "3 free; 25 on Pro, same price", "Master 4 · Grandmaster 9 · Sage 20"],
      ["Host it yourself", plotraPrice.selfHost, "–"],
    ],
    note: "World Anvil's prices are in US dollars, before VAT.",
  },
  switching: {
    title: "Moving from World Anvil, or using both",
    intro:
      "Many worldbuilders keep a public world on World Anvil and write the book somewhere else. Plotra can be that somewhere else, or the home of both.",
    steps: [
      { title: "Export your world", body: "In World Anvil, export the world as a zip (Settings, then Export World). Keep it as your backup." },
      { title: "Import it", body: "In Plotra, choose Import… and pick the zip. Categories become folders, people characters, settlements and landmarks places, and every other article a note, with its template's fields and links to its related articles." },
      { title: "Bring in your manuscript", body: "Import your chapters as Word, Markdown or plain text. Headings become chapters and scenes." },
      { title: "Link as you write", body: "Type [[ in a scene to link a page. Every page gathers the scenes that mention it." },
      { title: "Tag what's revealed when", body: "Mark passages with the book or chapter where readers learn them, and check the world as of any release." },
      { title: "Set it up as a wiki", body: "In Customize, choose Work like… and Like World Anvil or LegendKeeper: the codex, graph, relationships, secrets and continuity come first." },
      { title: "Invite your co-writer", body: "Add them by email and write the same scene together, with the world one click away." },
    ],
  },
  faq: [
    {
      q: "Is Plotra a good World Anvil alternative?",
      a: "If your world exists to serve a book or a series, yes: Plotra keeps the world bible and the manuscript in one linked project, lets you co-write live, and has every feature free. If you mainly want a public world wiki with interactive maps and a community around it, World Anvil does that well.",
    },
    {
      q: "Are projects private on Plotra's free plan?",
      a: "Yes. Every project is private until you share it, on every plan. On World Anvil's free plan, worlds and articles are public; private content is a paid feature.",
    },
    {
      q: "Can I write a novel in World Anvil?",
      a: "World Anvil has Manuscripts on its paid plans, linked to your world. Its help says manuscripts don't support collaborative writing. In Plotra the manuscript is the centre of the project, and co-writers can work in the same scene at once.",
    },
    {
      q: "Can I import my World Anvil world?",
      a: "Yes, from World Anvil's zip export (the JSON one, which World Anvil's help puts on its Guild plans). Choose Import… and pick the zip: categories become folders, people become characters, places become places, and other articles notes tagged with their type. The text, the template's fields and links to related articles come across; pictures, maps, timelines and secrets don't.",
    },
    {
      q: "Does Plotra have maps?",
      a: "Yes. Upload a picture of your world, pin places and characters to it, draw regions and paths, and sort them into layers. A pin can open another map, so a continent's map opens a city's, and the spoiler horizon hides pins for what readers don't know yet. Every place lists the maps it's on.",
    },
    {
      q: "Can I keep using World Anvil's maps?",
      a: "Yes. Many worldbuilders keep a public world, maps included, on World Anvil. To have a map beside your manuscript as well, bring its picture across and pin your places to it in Plotra.",
    },
    {
      q: "Can I show players or readers only what they know so far?",
      a: "Yes. Tag passages with the release where they're revealed, a book, an episode or a session, and set the project as of any release. Later reveals are blurred in the text and left out of the Codex, graph and timeline, and you can publish a wiki that holds only what's been revealed.",
    },
    {
      q: "Can I host Plotra myself?",
      a: "Yes. Plotra is open source under AGPL-3.0, and one docker compose command runs the app, the database and the collaboration server on your own machine.",
    },
  ],
  sources: [
    { label: "World Anvil pricing and plan limits", url: "https://www.worldanvil.com/pricing" },
    { label: "World Anvil help: co-authors", url: "https://www.worldanvil.com/learn/access-rights/co-authors" },
    { label: "World Anvil guide: Manuscripts", url: "https://www.worldanvil.com/learn/manuscripts-guides/manuscripts" },
    {
      label: "World Anvil blog: October 2026 feature drop, Manuscripts 1.5",
      url: "https://blog.worldanvil.com/worldanvil/dev-news/october-feature-drop-new-manuscripts-styling-updates/",
    },
  ],
  checked: "2026-10-18",
  audiences: ["worldbuilders", "game-masters", "novelists"],
  guides: ["how-to-write-a-story-bible", "how-to-make-a-story-timeline", "campaign-notes-your-players-cant-spoil"],
};
