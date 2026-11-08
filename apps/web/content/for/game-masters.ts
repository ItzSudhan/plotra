import type { Audience } from "@/lib/audiences";
import asOf from "../blog/shots/campaign-as-of-session-1.webp";
import gmNote from "../blog/shots/campaign-gm-note.webp";
import publish from "../blog/shots/campaign-publish.webp";
import knows from "../blog/shots/holes-who-knows.webp";
import sample from "./shots/sample-campaign.webp";

export const gameMasters: Audience = {
  slug: "game-masters",
  name: "Game masters",
  icon: "map-bold-duotone",
  title: "Campaign manager for GMs, with a player-safe wiki",
  description:
    "Prep tabletop RPG sessions, track what your players know, and give the table a campaign wiki that never spoils what they haven't found yet. Free to start.",
  headline: ["Your campaign notes, and a wiki", "your players can't spoil."],
  intro:
    "A campaign is a world where you know everything and the table knows part of it. Plotra keeps both in one project: each session is a release, lines meant only for you are tagged so the table never sees them, and the players' wiki holds only what has been revealed.",
  summary: "Sessions as releases, GM-only notes, who knows what, and a wiki that shows players only what they've found.",
  hero: {
    src: sample,
    alt: "The tabletop sample campaign, Ashes at Carrow Ford, with three session folders, player characters, NPCs and a GM-only secrets folder in the binder",
  },
  pains: [
    {
      title: "The wiki gives it away",
      body: "A shared campaign wiki is one click from the twist, and your players know where to click.",
    },
    {
      title: "Who told them that?",
      body: "Three sessions later, nobody remembers which NPC let the secret slip, or whether one did.",
    },
    {
      title: "The dead NPC at dinner",
      body: "Prep in one doc, lore in another, and the villain killed in session 2 is on the guest list in session 5.",
    },
  ],
  features: [
    {
      title: "Each session is a release",
      body: "After you play, record the session as a release and everything in its folder counts as revealed. Choose World as of Session 3 and the binder, the codex, the graph and the timeline show only what your players know.",
      points: [
        "Notes the players haven't reached dim in the binder",
        "Passages for a later session blur in the text",
        "Each GM sets their own horizon",
      ],
      shot: {
        src: asOf,
        alt: "An NPC's page with World as of Session 1 switched on. Both tagged passages are blurred, and later sessions and the secrets folder are dimmed in the binder",
        caption: "The world as the players knew it after session 1.",
      },
    },
    {
      title: "Lines for your eyes only",
      body: "Put the cursor in a paragraph and tag it as never revealed. It is hidden under every horizon and left out of the players' wiki. Or tag it with the session where the players will find it out.",
      points: [
        "Tag a whole page, or one paragraph",
        "A reveal for each session, planned on a roadmap",
        "The sample campaign shows the habit in use",
      ],
      shot: {
        src: gmNote,
        alt: "Session prep from the sample campaign. One paragraph beginning GM: has a bar down its side and the tag Never revealed",
      },
    },
    {
      title: "Who knows what",
      body: "Track each secret, which characters know it, the scene where they learned it, and whether they hold the truth or a lie. Plant clues as setups, and see which ones have paid off.",
      points: [
        "True but untold, told to the table, and believed",
        "A clue kind for what you have planted",
        "Continuity checks that catch the dead NPC who comes back",
      ],
      shot: {
        src: knows,
        alt: "The Who knows what tab: two secrets, each listing the characters who know, where they learned it, and whether they hold the truth or a false version",
      },
    },
    {
      title: "A wiki for the table",
      body: "Choose the last session played and download a small website: a page for every revealed NPC, place and faction, linked to each other. Put it on any host that serves plain files, or send the folder, which opens straight from a computer.",
      points: [
        "Only what has been revealed, by the session you choose",
        "Pages that work on a phone at the table",
        "Download it again after each session",
      ],
      shot: {
        src: publish,
        alt: "The Publish view with As of set to Session 2: Fire, and a Public wiki card with a Download .zip button",
      },
    },
  ],
  steps: [
    {
      title: "Start a tabletop campaign",
      body: "Answer a few questions, choose A tabletop campaign, and name the player characters. Plotra makes a folder for session 1 with its prep, and folders for player characters, NPCs and places.",
    },
    {
      title: "Prep and link",
      body: "Write the prep in the session's folder and type [[ for every NPC and place, so each page lists the sessions it appears in.",
    },
    {
      title: "Mark what only you may read",
      body: "Tag GM-only paragraphs as never revealed, and twists with the session they land in.",
    },
    {
      title: "Play, then release the session",
      body: "Record it as a release. Everything in its folder now counts as known to the table.",
    },
    {
      title: "Check before the next one",
      body: "Run the continuity checks, and look at the world as of the last session to see what the players can know.",
    },
    {
      title: "Hand over the wiki",
      body: "Download it as of the last session and replace last week's copy.",
    },
  ],
  tools: [
    {
      name: "LegendKeeper or Kanka",
      good: "Campaign wikis, built for GMs.",
      adds: "The spoiler horizon by session, who knows what, and a manuscript in the same project if you write the campaign up.",
    },
    {
      name: "World Anvil",
      good: "Deep worldbuilding and public wikis.",
      adds: "Reveals planned session by session, a wiki made as of any session, and every feature on the Free plan.",
    },
    {
      name: "Obsidian",
      good: "Local notes, plugins and a big TTRPG community.",
      adds: "Your vault imports with its links, a co-GM can edit with you live, and the players' wiki leaves your secrets behind.",
    },
  ],
  faq: [
    {
      q: "Can my players see my GM notes?",
      a: "Not in the wiki: it leaves out every passage tagged as never revealed or for a later session. But sharing the project itself with a player shows them everything, GM notes included, so give players the wiki, not access to the project.",
    },
    {
      q: "Does Plotra host the players' wiki?",
      a: "No. The wiki is a zip of plain web pages, a copy of the moment you downloaded it. Unzip it and upload it to any host that serves static files, or send the folder as it is. After the next session, download it again and replace the files.",
    },
    {
      q: "Can I run the campaign with a co-GM?",
      a: "Yes. Share the project with them as an editor, or invite them to your workspace. You can both write in the same note at the same time and see each other's cursors.",
    },
    {
      q: "Which game systems does it work with?",
      a: "Any. Plotra keeps your prep, NPCs, places, factions, secrets and clues as linked pages and prose. It has no dice roller and no stat blocks for a particular system.",
    },
    {
      q: "Can I give my world its own calendar?",
      a: "Yes. Make a calendar with its own months, day length and eras, and put the campaign's history and sessions on a timeline in it.",
    },
    {
      q: "Can I import my campaign from Obsidian?",
      a: "Yes. Choose the vault folder in the import dialog. Markdown notes come in with their [[links]], aliases and tags. Pictures, canvases and PDFs in the vault are left out, and the dialog counts them.",
    },
  ],
  guides: ["campaign-notes-your-players-cant-spoil", "how-to-make-a-story-timeline", "how-to-avoid-plot-holes"],
  docs: { label: "The game master's route through the docs", path: "/docs/for/game-masters" },
};
