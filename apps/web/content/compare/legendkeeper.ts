import type { Comparison } from "@/lib/compare";
import { no, part, say, yes } from "@/lib/compare-cells";
import art from "./art/legendkeeper.webp";
import { asOfSession, gmNotes, liveCowriting, playerWiki, plotraPrice, whoKnows } from "./shared";

export const legendKeeper: Comparison = {
  slug: "legendkeeper",
  name: "LegendKeeper",
  title: "Plotra vs LegendKeeper: a campaign wiki players can't spoil",
  description:
    "Plotra vs LegendKeeper for game masters: campaign wikis, maps, secrets by session, who knows what, live co-editing and prices, side by side, with sources.",
  headline: ["A campaign wiki", "your players can't spoil."],
  intro:
    "LegendKeeper is a fast, polished worldbuilding wiki with huge maps and live co-editing, and many GMs swear by it. Plotra comes at the campaign from the other side: each session is a release, every secret is tagged with the session it's revealed in, and you can see, or publish, the world exactly as your players know it after any session.",
  summary: "Each session a release, each secret tagged with when it's revealed, and the world as your players know it.",
  art: {
    src: art,
    alt: "A fantasy campaign map with some regions hidden under folded paper flaps and others open, with dice and a lantern beside it",
  },
  verdict: {
    them: [
      "Big, nested, interactive maps are at the heart of your prep",
      "You want a fast wiki that works offline",
      "You'd like whiteboards for planning and an API to build on",
    ],
    plotra: [
      "You want the world as of any session, with later secrets hidden",
      "You track which character knows which secret, and since when",
      "You write the campaign up as fiction, or plan to",
      "You'd like a free plan with every feature, or to host it yourself",
    ],
  },
  strengths: [
    {
      title: "Maps",
      body: "Huge nested maps, up to 14,000 pixels and 100 MB, with pins, regions and paths, and live editing on them too.",
    },
    {
      title: "Live co-editing",
      body: "Edit the same page at the same time and see each other's cursors.",
    },
    {
      title: "Control what players see",
      body: "Show players only the information you want them to see, and invite guests for free.",
    },
    {
      title: "Calendars and timelines",
      body: "Custom calendars and timelines for the history of your world.",
    },
    {
      title: "Whiteboards",
      body: "Collaborative whiteboards for planning sessions and mapping relationships.",
    },
    {
      title: "Speed, offline and export",
      body: "A fast app with an offline mode, a new API, and a commitment to always keep a full export.",
    },
  ],
  glance: {
    cowrite: yes(),
    manuscript: no("A wiki, not a manuscript"),
    bible: yes(),
    timeline: yes(),
    anyOs: yes(),
    free: part("14-day trial; free to join others' projects"),
    open: no(),
  },
  table: [
    {
      group: "The campaign",
      rows: [
        { feature: "Wiki pages for NPCs, places and factions", plotra: yes("Your own types and fields"), them: yes() },
        { feature: "Interactive maps", plotra: yes("Pins, regions, paths, layers, nested"), them: yes("Huge, nested, with pins and regions") },
        { feature: "Custom calendars and timelines", plotra: yes(), them: yes() },
        { feature: "Whiteboards", plotra: yes("Canvas with sticky notes, shapes, arrows and a pen"), them: yes() },
        { feature: "Links between pages", plotra: yes("With backlinks and a graph"), them: yes() },
      ],
    },
    {
      group: "Secrets and spoilers",
      rows: [
        { feature: "Hide GM-only content from players", plotra: yes("Per page or paragraph"), them: yes() },
        { feature: "See the world as of a past session", plotra: yes("The spoiler horizon"), them: no("Not on its feature list") },
        { feature: "Who knows which secret, and since when", plotra: yes(), them: no("Not on its feature list") },
        { feature: "Publish a player wiki", plotra: yes("Static HTML, as of any session"), them: part("Guests view in the app") },
      ],
    },
    {
      group: "Working together",
      rows: [
        { feature: "Live co-editing with cursors", plotra: yes(), them: yes() },
        { feature: "Guests", plotra: yes("5 per project free, 200 on Pro"), them: yes("Unlimited, free") },
        { feature: "If the subscription ends", plotra: say("Back to Free; nothing is deleted"), them: say("Guests can't view the project") },
      ],
    },
    {
      group: "Where and how",
      rows: [
        { feature: "Write the campaign up as a novel", plotra: yes("Manuscript, corkboard, plot grid"), them: no() },
        { feature: "Works offline", plotra: part("Installs as an app that opens offline; keep whole projects on the device"), them: yes("Offline mode") },
        { feature: "Export", plotra: say("Word, RTF, Markdown, plain text, PDF, EPUB, static wiki"), them: say("Whole wiki as HTML or JSON") },
        { feature: "Open source, self-hostable", plotra: yes("AGPL-3.0"), them: no() },
      ],
    },
  ],
  features: [asOfSession, gmNotes, whoKnows, playerWiki, liveCowriting],
  pricing: {
    rows: [
      ["To start", "Free, with every feature", "14-day trial, no card"],
      ["Monthly", "Pro: $10 a month for the workspace", "Pro: $9 a month"],
      ["Yearly", "Pro: $96 a year", "Pro: $90 a year"],
      ["Players", "5 guests per project free, 200 on Pro", "Unlimited guests, free"],
      ["Host it yourself", plotraPrice.selfHost, "–"],
    ],
    note: "LegendKeeper's prices are in US dollars and converted to local currency at checkout.",
  },
  switching: {
    title: "Moving a campaign, or using both",
    intro: "Some GMs keep their maps in LegendKeeper and run the secrets and session prep in Plotra. Either way, start from the sample campaign.",
    steps: [
      { title: "Open the sample campaign", body: "Ashes at Carrow Ford shows sessions as folders, NPCs, player characters and a GM-only secrets folder." },
      { title: "Set it up as a wiki", body: "In Customize, choose Work like… and Like World Anvil or LegendKeeper: the codex, graph, relationships, secrets and continuity come first." },
      { title: "Export your wiki", body: "LegendKeeper exports the whole wiki as HTML. Keep it as your backup and copy your main pages across." },
      { title: "One folder per session", body: "Prep each session in its own folder. After you play, record it as a release." },
      { title: "Tag the secrets", body: "Tag each secret with the session it's revealed in, and GM-only lines as never revealed." },
      { title: "Check what the table knows", body: "Set World as of to the last session: what the players haven't reached blurs and dims." },
      { title: "Publish the players' wiki", body: "Publish as of the last session, and host the zip anywhere, or invite players as viewers." },
    ],
  },
  faq: [
    {
      q: "Is Plotra a good LegendKeeper alternative?",
      a: "If secrets, reveals and who knows what are the hard part of your campaign, yes: Plotra shows the world as of any session and tracks which characters know each secret. If big interactive maps are the centre of your prep, LegendKeeper does more there today.",
    },
    {
      q: "How do I keep secrets from my players?",
      a: "Tag a page or a single paragraph with the session it's revealed in, or as never revealed. Set the project as of the last session you played, and later secrets blur in the text and drop out of the Codex, graph and timeline. Publish the world as of that session for a wiki that gives nothing away.",
    },
    {
      q: "Does Plotra have maps?",
      a: "Yes. Upload a picture of your world and pin places, characters and session notes to it, draw regions and paths, and sort them into layers. A pin can open another map, so maps nest, and the spoiler horizon hides pins for what the players don't know yet. LegendKeeper's maps are built for very large pictures, up to 14,000 pixels; Plotra's are as large as an upload on your plan.",
    },
    {
      q: "Can I keep my maps in LegendKeeper?",
      a: "Yes, and many GMs do: LegendKeeper is excellent for very large maps. Keep the maps there and the secrets, sessions and who knows what in Plotra, or bring a map's picture across and pin your places to it here.",
    },
    {
      q: "Is Plotra free for game masters?",
      a: "Yes. The Free plan has every feature, including releases and the player wiki, with 5 guests per project. Pro is $10 a month for the whole workspace, with 200 guests per project.",
    },
  ],
  sources: [
    { label: "LegendKeeper pricing", url: "https://www.legendkeeper.com/pricing/" },
    { label: "LegendKeeper features", url: "https://www.legendkeeper.com/features/" },
    { label: "LegendKeeper 0.7.4: full wiki export", url: "https://www.legendkeeper.com/changelog/legendkeeper-0-7-4-full-wiki-export/" },
  ],
  checked: "2026-10-18",
  audiences: ["game-masters", "worldbuilders"],
  guides: ["campaign-notes-your-players-cant-spoil", "how-to-make-a-story-timeline", "how-to-write-a-story-bible"],
};
