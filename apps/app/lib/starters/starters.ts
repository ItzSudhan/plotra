import type { NodeSettings, ProjectType, ScriptFormat } from "@plotra/db/schema";
import { typeFormat } from "../modules";
import { h2, p, type SampleNote, type SampleRelease, type Seed } from "../samples/types";
import type { StarterId } from "./catalog";

// The structures of the starter templates (./catalog.ts), written in the same
// plain data as a sample (lib/samples/types.ts) so `buildSample` makes the
// rows. A starter has no story in it: its scenes are empty, with a synopsis
// saying what each is for, and its planning notes are headings with a
// question under each. Everything is a draft, since none of it is written yet.

/** A note before it has a key: the keys only matter to references, so most are made up. */
type Draft = Omit<SampleNote, "key" | "children"> & { key?: string; children?: Draft[] };

const scene = (title: string, synopsis: string, rest: Partial<Draft> = {}): Draft => ({ kind: "scene", title, ...(synopsis && { synopsis }), ...rest });
const chapter = (title: string, children: Draft[], rest: Partial<Draft> = {}): Draft => ({ kind: "chapter", title, children, ...rest });
const folder = (title: string, children: Draft[], rest: Partial<Draft> = {}): Draft => ({ kind: "folder", title, children, ...rest });
/** A chapter with a single scene in it: the beat is the chapter, the scene is where it gets written. */
const beat = (title: string, synopsis: string): Draft => chapter(title, [scene(title, synopsis)], synopsis ? { synopsis } : {});

/** A planning note: a heading per section, with the question it answers underneath. */
const page = (title: string, sections: Array<[string, string]>, rest: Partial<Draft> = {}): Draft => ({
  kind: "note",
  title,
  body: sections.flatMap(([heading, prompt]) => [h2(heading), p(prompt)]),
  ...rest,
});

/** A character with the default sheet (its body is filled in from the character template when it's opened). */
const person = (title: string, role?: "Protagonist" | "Antagonist" | "Supporting" | "Minor", synopsis?: string): Draft => ({
  kind: "character",
  title,
  ...(synopsis && { synopsis }),
  ...(role && { properties: { role } }),
});
const place = (title: string, synopsis?: string): Draft => ({ kind: "location", title, ...(synopsis && { synopsis }) });
const faction = (title: string, synopsis: string): Draft => ({ kind: "entity", entityType: "Faction", title, synopsis });

type StarterSeed = {
  title: string;
  type: ProjectType;
  logline?: string;
  notes: Draft[];
  releases?: SampleRelease[];
  threads?: Array<{ key: string; name: string; color: string }>;
};

/** Gives every note a key, a draft status and its type's script format, and opens on the first scene. */
function starter(id: StarterId, seed: StarterSeed): Seed {
  let n = 0;
  const format: ScriptFormat = typeFormat[seed.type];
  const finish = (draft: Draft): SampleNote => {
    const settings: NodeSettings | undefined = draft.kind === "scene" && format !== "prose" ? { format, ...draft.settings } : draft.settings;
    return {
      ...draft,
      key: draft.key ?? `n${++n}`,
      canon: "draft",
      ...(settings && { settings }),
      children: draft.children?.map(finish),
    };
  };
  const notes = seed.notes.map(finish);
  const first = (list: SampleNote[]): SampleNote | undefined => {
    for (const note of list) {
      if (note.kind === "scene") return note;
      const inside = first(note.children ?? []);
      if (inside) return inside;
    }
  };
  const open = first(notes);
  if (!open) throw new Error(`Starter “${id}” has no scene to open on.`);
  return {
    id: `starter:${id}`,
    title: seed.title,
    type: seed.type,
    logline: seed.logline ?? "",
    open: open.key,
    notes,
    releases: seed.releases ?? [],
    threads: (seed.threads ?? []).map((t) => ({ ...t, cells: [] })),
    relationships: [],
    knowledge: [],
    setups: [],
    events: [],
    continuity: [],
  };
}

const ember = "#e2602a";
const blue = "#3b82f6";
const green = "#16a34a";
const violet = "#8b5cf6";

// ---- Novelists ---------------------------------------------------------------------

const premise = page("Premise", [
  ["Logline", "One sentence: who wants what, what stands in the way, and what happens if they fail."],
  ["Theme", "What the story is about underneath the plot. A question it asks, more than an answer."],
  ["Stakes", "What the protagonist loses if they fail, and why the reader should care."],
  ["Ending", "Where it ends, even roughly. You can change it; it helps to aim at something."],
]);

const threeActNovel = starter("three-act-novel", {
  title: "Untitled novel",
  type: "novel",
  threads: [
    { key: "main", name: "Main plot", color: ember },
    { key: "sub", name: "Subplot", color: blue },
  ],
  notes: [
    folder("Act One", [
      beat("The ordinary world", "Who the protagonist is before the story starts, shown in something they do, not told."),
      beat("The inciting incident", "Something happens that the protagonist can't ignore. Their ordinary world is over."),
      beat("The point of no return", "They choose to act, and there's no going back. The end of Act One."),
    ]),
    folder("Act Two", [
      beat("New rules", "The world of the story proper: unfamiliar, with new allies, enemies and tests."),
      beat("Rising stakes", "Small wins and setbacks. Each problem solved makes a bigger one."),
      beat("The midpoint", "A false victory or a false defeat. What they want and what they need come apart."),
      beat("Closing in", "The opposition regroups and the plan starts to fail. Doubts and divisions."),
      beat("All is lost", "The lowest point. Something or someone is lost, and the old way can't win."),
    ]),
    folder("Act Three", [
      beat("The new plan", "What they learned at the lowest point becomes a way forward."),
      beat("The climax", "The final confrontation, won (or lost) by the person they have become."),
      beat("Resolution", "The new normal. Echo the opening, so the reader sees how far they came."),
    ]),
    folder("Characters", [person("Protagonist", "Protagonist"), person("Antagonist", "Antagonist")]),
    folder("Places", []),
    folder("Planning", [premise]),
  ],
});

const beatSheetNovel = starter("beat-sheet-novel", {
  title: "Untitled novel",
  type: "novel",
  threads: [
    { key: "a", name: "A story", color: ember },
    { key: "b", name: "B story", color: blue },
  ],
  notes: [
    folder("Act One", [
      beat("Opening image", "A snapshot of the protagonist's life and problem before anything changes."),
      beat("Theme stated", "Someone says, usually in passing, what the protagonist needs to learn."),
      beat("Set-up", "The protagonist's world, the people in it and what's missing from it."),
      beat("Catalyst", "The event that changes everything: news, a meeting, a death, an offer."),
      beat("Debate", "Should they go? The protagonist hesitates, and we see what it would cost."),
    ]),
    folder("Act Two", [
      beat("Break into Two", "They choose to enter the new world. It has to be their choice."),
      beat("B story", "A new relationship that carries the theme: a love interest, a mentor, a rival."),
      beat("Fun and games", "The promise of the premise: what the reader picked up the book for."),
      beat("Midpoint", "Stakes go up. A false victory or a false defeat, and a clock starts."),
      beat("Bad guys close in", "Outside pressure grows and the team falls apart from within."),
      beat("All is lost", "The opposite of the midpoint. Often a death, real or symbolic."),
      beat("Dark night of the soul", "They sit with the loss and finally face what they've been avoiding."),
    ]),
    folder("Act Three", [
      beat("Break into Three", "The A and B stories meet, and the answer appears."),
      beat("Finale", "They put the lesson into action, and the old world is changed by it."),
      beat("Final image", "The mirror of the opening image. Show the change."),
    ]),
    folder("Characters", [person("Protagonist", "Protagonist")]),
    folder("Planning", [premise]),
  ],
});

const mysteryNovel = starter("mystery-novel", {
  title: "Untitled mystery",
  type: "novel",
  threads: [
    { key: "case", name: "The case", color: ember },
    { key: "detective", name: "The detective's life", color: blue },
    { key: "clues", name: "Clues and red herrings", color: violet },
  ],
  notes: [
    beat("The crime", "The body, the theft, the disappearance. Open on it, or just after."),
    beat("Enter the detective", "Who takes the case, and why it matters to them in particular."),
    beat("The suspects", "Meet everyone with a motive. Plant the first clue in plain sight."),
    beat("The false trail", "A red herring the detective, and the reader, believes."),
    beat("The second blow", "A twist: another crime, a suspect cleared, an alibi broken."),
    beat("The detective in danger", "The culprit pushes back. The case gets personal."),
    beat("The reveal", "Every planted clue comes together. The culprit is named."),
    beat("Aftermath", "Justice, or not, and what the case cost the detective."),
    folder("Detective", [person("The detective", "Protagonist")]),
    folder("Suspects", [person("Suspect one", "Supporting"), person("Suspect two", "Supporting"), person("Suspect three", "Supporting")]),
    folder("Victim", [person("The victim", "Minor")]),
    folder("Places", [place("The scene of the crime")]),
    folder("The truth", [
      page("What really happened", [
        ["The crime, in order", "What happened, step by step, as the culprit did it. The reader learns this last."],
        ["Motive", "Why they did it."],
        ["Mistakes", "What the culprit got wrong: the clues the detective will find."],
      ]),
      page("Clues", [
        ["Real clues", "Each clue, the scene it's planted in and the scene it pays off in."],
        ["Red herrings", "What points at the wrong suspect, and how it's explained away."],
      ]),
    ]),
  ],
});

const romanceNovel = starter("romance-novel", {
  title: "Untitled romance",
  type: "novel",
  threads: [
    { key: "romance", name: "The relationship", color: "#e11d48" },
    { key: "a", name: "Their lives", color: blue },
  ],
  notes: [
    folder("Act One", [
      beat("Two lives", "Each lead alone, and the wound or wall that keeps them from love."),
      beat("The meeting", "They meet, and it goes wrong in a way that tells us they're right for each other."),
      beat("Forced together", "A reason they have to keep seeing each other: work, a wedding, a bet, a snowstorm."),
    ]),
    folder("Act Two", [
      beat("Falling", "The walls come down a little at a time. Banter, firsts and almosts."),
      beat("The midpoint", "A kiss, a confession, a night together: the relationship becomes real."),
      beat("Doubts", "The old wounds come back. What each fears about the other is half true."),
      beat("The break-up", "The thing they fear happens, or seems to. They split."),
    ]),
    folder("Act Three", [
      beat("Apart", "Each has to change on their own, not just come back."),
      beat("The grand gesture", "One of them, or both, proves they've changed, and it costs them something."),
      beat("Happily ever after", "Together, and what together looks like now."),
    ]),
    folder("Characters", [person("Lead one", "Protagonist"), person("Lead two", "Protagonist"), person("Best friend", "Supporting")]),
    folder("Planning", [
      page("The couple", [
        ["Why them", "What each gives the other that no one else could."],
        ["What keeps them apart", "Inside (fears, wounds) and outside (jobs, families, distance)."],
        ["Heat level", "How much happens on the page."],
        ["Tropes", "Enemies to lovers, fake dating, second chance… which ones, and how you'll twist them."],
      ]),
    ]),
  ],
});

const novelSeries = starter("novel-series", {
  title: "Untitled series",
  type: "novel",
  releases: [
    { key: "r-book1", title: "Book 1", kind: "book", ships: "book1" },
    { key: "r-book2", title: "Book 2", kind: "book", ships: "book2" },
  ],
  threads: [
    { key: "series", name: "Series arc", color: ember },
    { key: "book", name: "Book 1 plot", color: blue },
  ],
  notes: [
    folder(
      "Book 1",
      [
        folder("Act One", [beat("Opening", "Who the protagonist is before the series starts."), beat("The call", "What pulls them into the story of the whole series.")]),
        folder("Act Two", [beat("The midpoint", "A turn that hints at the size of what's coming."), beat("The low point", "What this book takes from them.")]),
        folder("Act Three", [beat("The climax", "This book's story ends. The series' story doesn't."), beat("The hook", "One last page that makes them want Book 2.")]),
      ],
      { key: "book1" },
    ),
    folder("Book 2", [beat("Opening", "Where everyone is now, and what changed between books.")], { key: "book2" }),
    folder("Characters", [person("Protagonist", "Protagonist"), person("Antagonist", "Antagonist")]),
    folder("Places", []),
    folder("Series bible", [
      page("Series overview", [
        ["The series in a sentence", "What the whole series is about, start to finish."],
        ["Each book", "What each book's own story is, and how it moves the series arc."],
        ["The ending", "How the last book ends."],
      ]),
      page("Rules of the world", [
        ["How things work", "Magic, technology, politics: what's possible and what it costs."],
        ["Never", "What can never happen in this world, so you don't break it in book five."],
      ]),
    ]),
  ],
});

const shortStory = starter("short-story", {
  title: "Untitled story",
  type: "short_story",
  notes: [
    scene("The hook", "Open as late as you can, on something that makes the reader ask a question."),
    scene("The complication", "What goes wrong, or what the character wants and can't have."),
    scene("The turn", "The moment things change direction. A discovery, a decision, a mistake."),
    scene("The climax", "The point the whole story has been heading to."),
    scene("The last line", "Leave the reader with an image or a feeling, not a summary."),
    folder("Characters", [person("Protagonist", "Protagonist")]),
    page("The story in one sentence", [
      ["One sentence", "Who, what they want, and what happens."],
      ["The feeling", "What the reader should feel when they finish."],
      ["Where to send it", "Magazines, contests or anthologies, with their word limits and deadlines."],
    ]),
  ],
});

const serialChapters = ["Chapter 1", "Chapter 2", "Chapter 3", "Chapter 4", "Chapter 5", "Chapter 6"];
const serialSynopses = [
  "Hook readers in the first lines. Introduce the protagonist and the premise fast.",
  "Deepen the world and give a reason to come back next week.",
  "A first complication. End on a question.",
  "Raise the stakes. Something readers didn't see coming.",
  "Things go wrong. The cliffhanger readers will talk about in the comments.",
  "The arc's climax and a hook into arc two.",
];
const webSerial = starter("web-serial", {
  title: "Untitled serial",
  type: "web_serial",
  releases: serialChapters.map((title, i) => ({ key: `r-ch${i + 1}`, title, kind: "chapter" as const, ships: `ch${i + 1}` })),
  threads: [{ key: "arc1", name: "Arc one", color: ember }],
  notes: [
    folder(
      "Arc 1",
      serialChapters.map((title, i) => chapter(title, [scene(title, serialSynopses[i])], { key: `ch${i + 1}`, synopsis: serialSynopses[i] })),
    ),
    folder("Characters", [person("Protagonist", "Protagonist")]),
    folder("Serial notes", [
      page("Posting schedule", [
        ["How often", "Days you post, and the time. Readers come back for a rhythm."],
        ["Buffer", "How many chapters ahead you want to be before you start posting."],
        ["Where", "The sites you post on, and any early-access chapters for supporters."],
      ]),
      page("Hooks", [
        ["Chapter endings", "A list of cliffhangers and questions to end chapters on."],
        ["Long mysteries", "Questions readers will wait many chapters for the answers to."],
      ]),
    ]),
  ],
});

// ---- Screen & stage ---------------------------------------------------------------------

const featureFilm = starter("feature-film", {
  title: "Untitled film",
  type: "screenplay",
  threads: [
    { key: "a", name: "A story", color: ember },
    { key: "b", name: "B story", color: blue },
  ],
  notes: [
    folder("Act One", [
      beat("Set-up", "The hero's world and what's missing from it. About the first ten pages."),
      beat("Inciting incident", "What disrupts it, and the decision that locks the hero in. End of Act One."),
    ]),
    folder("Act Two", [
      beat("First obstacle", "The first attempt at the goal, and the new world's rules."),
      beat("Midpoint", "A reversal around page 55. The stakes rise and the clock starts."),
      beat("Complications", "The plan goes wrong. Allies fail, the opposition gains."),
      beat("Lowest point", "All seems lost. End of Act Two."),
    ]),
    folder("Act Three", [
      beat("Climax", "The final battle, in whatever form your story takes."),
      beat("Resolution", "The new world, briefly. Get out fast."),
    ]),
    folder("Characters", [person("Hero", "Protagonist"), person("Opponent", "Antagonist")]),
    folder("Locations", []),
    folder("Development", [
      page("Treatment", [
        ["Logline", "One sentence that sells the film."],
        ["Synopsis", "The story in a page, in present tense."],
        ["Comparable films", "Two or three films it sits between, and how it's different."],
      ]),
    ]),
  ],
});

const tvPilot = starter("tv-pilot", {
  title: "Untitled series",
  type: "screenplay",
  releases: [{ key: "r-pilot", title: "Pilot", kind: "episode", ships: "pilot" }],
  threads: [
    { key: "a", name: "A story", color: ember },
    { key: "b", name: "B story", color: blue },
    { key: "c", name: "Series arc", color: green },
  ],
  notes: [
    folder(
      "Pilot",
      [
        folder("Teaser", [scene("Cold open", "Grab the audience before the titles. Show the show's tone in two minutes.")]),
        folder("Act One", [scene("The world", "Meet the lead and the world they'll live in all season.")]),
        folder("Act Two", [scene("The problem", "The episode's case, challenge or event gets going.")]),
        folder("Act Three", [scene("The turn", "A complication that shows what the series is really about.")]),
        folder("Act Four", [scene("The ending", "The episode's story ends; the season's story begins.")]),
        folder("Tag", [scene("Tag", "One last beat: a joke, a reveal, a hook for episode two.")]),
      ],
      { key: "pilot" },
    ),
    folder("Characters", [person("Lead", "Protagonist"), person("Series regular", "Supporting")]),
    folder("Locations", []),
    folder("Series bible", [
      page("The show", [
        ["Logline", "What the show is, in one sentence."],
        ["Format", "Length, comedy or drama, procedural or serial, single or multi-camera."],
        ["Tone", "Shows it sits beside."],
      ]),
      page("Season one", [
        ["The arc", "Where the season starts and ends for the lead."],
        ["Episodes", "A line each for the episodes after the pilot."],
        ["Later seasons", "Where the show goes if it runs."],
      ]),
    ]),
  ],
});

const stagePlay = starter("stage-play", {
  title: "Untitled play",
  type: "stage_play",
  notes: [
    folder("Act One", [
      scene("Scene 1", "The world of the play and who's in it. What the audience needs to know."),
      scene("Scene 2", "The conflict starts."),
      scene("Scene 3", "Things build toward the interval: end the act on a question."),
    ]),
    folder("Act Two", [
      scene("Scene 1", "After the interval. The consequences of Act One."),
      scene("Scene 2", "The climax."),
      scene("Scene 3", "The ending."),
    ]),
    folder("Characters", [person("Lead", "Protagonist")]),
    page("Production notes", [
      ["Cast", "Who's in it, and any doubling of parts."],
      ["Set", "One set or several, and how scene changes work."],
      ["Running time", "Rough length of each act."],
    ]),
  ],
});

// ---- Game writers ---------------------------------------------------------------------

const designDoc = (extra: Array<[string, string]> = []) =>
  page("Narrative design", [
    ["Player fantasy", "Who the player gets to be, and what they get to do."],
    ["Tone", "Games, books or films it sits beside."],
    ["Choices that matter", "Which decisions change the story, and how far."],
    ["Story and play", "How the story is told through play: dialogue, environment, items, cutscenes."],
    ...extra,
  ]);

const branchingGame = starter("branching-game", {
  title: "Untitled game",
  type: "game",
  threads: [
    { key: "main", name: "Main story", color: ember },
    { key: "a", name: "Branch A", color: blue },
    { key: "b", name: "Branch B", color: green },
  ],
  notes: [
    folder("Prologue", [
      scene("Opening", "Teach the controls through story. Make the player want something in the first minutes."),
      scene("The first choice", "A small decision that tells the player their choices matter."),
    ]),
    folder("Hub", [scene("The hub", "Where the player returns between missions. Who's here, what's changed.")]),
    folder("Branch A", [scene("A: the path", "What happens if the player sides with one way."), scene("A: the cost", "What this path takes from them.")]),
    folder("Branch B", [scene("B: the path", "The other way, with its own people and places."), scene("B: the cost", "What this path takes from them.")]),
    folder("Endings", [
      scene("Ending one", "The ending most players will see."),
      scene("Ending two", "The bittersweet one."),
      scene("Secret ending", "For the players who found everything."),
    ]),
    folder("Characters", [person("Player character", "Protagonist"), person("Companion", "Supporting"), person("Antagonist", "Antagonist")]),
    folder("Locations", []),
    folder("Design", [
      designDoc(),
      { kind: "canvas", title: "Branch map" },
      page("Barks and UI text", [
        ["Combat barks", "Short lines characters shout in combat, by situation."],
        ["Ambient", "What people say as the player walks by."],
        ["Interface", "Item names, tooltips, menus."],
      ]),
    ]),
  ],
});

const questPage = (title: string) =>
  page(title, [
    ["Giver", "Who hands the quest out, and why they can't do it themselves."],
    ["Objective", "What the player has to do."],
    ["The twist", "What turns out to be different from how it looked."],
    ["Reward", "What the player gets: loot, a companion, a piece of lore."],
  ]);

const questRpg = starter("quest-rpg", {
  title: "Untitled RPG",
  type: "game",
  threads: [
    { key: "main", name: "Main quest", color: ember },
    { key: "side", name: "Side quests", color: blue },
  ],
  notes: [
    folder("Main quest", [
      chapter("Act 1", [scene("The call", "What starts the player's journey."), scene("The first dungeon", "A test, and a hint at the real enemy.")]),
      chapter("Act 2", [scene("Allies", "Gather the factions. The player's choices decide who joins."), scene("The betrayal", "Someone the player trusted turns.")]),
      chapter("Act 3", [scene("The final quest", "Everything the player built pays off."), scene("Epilogue", "What happened to everyone, by the player's choices.")]),
    ]),
    folder("Side quests", [questPage("Side quest one"), questPage("Side quest two"), questPage("Side quest three")]),
    folder("Factions", [faction("The crown", "Who holds power at the start."), faction("The rebels", "Who wants it."), faction("The guild", "Who profits either way.")]),
    folder("Characters", [person("Player character", "Protagonist"), person("Mentor", "Supporting"), person("Villain", "Antagonist")]),
    folder("Locations", [place("Starting town"), place("Capital")]),
    folder("Codex", [
      page("History", [["Ages", "The eras of the world, briefly."], ["The event", "The thing in the past that the story is still about."]]),
      page("Magic and technology", [["How it works", "Rules, costs and limits."]]),
    ]),
    folder("Design", [designDoc([["Levelling and story", "How the player's power fits the story: why they get stronger."]])]),
  ],
});

const visualNovel = starter("visual-novel", {
  title: "Untitled visual novel",
  type: "game",
  threads: [
    { key: "common", name: "Common route", color: ember },
    { key: "a", name: "Route A", color: "#e11d48" },
    { key: "b", name: "Route B", color: blue },
  ],
  notes: [
    folder("Common route", [
      scene("Prologue", "The protagonist's situation and the people they're about to meet."),
      scene("Day one", "Meet each route character. Give each one a choice the player can lean toward."),
      scene("The split", "The choice, or the points total, that decides which route the player takes."),
    ]),
    folder("Route A", [scene("A: getting closer", "Their story: who they are under the first impression."), scene("A: the crisis", "What threatens them, or the two of them."), scene("A: good ending", "If the player earned it."), scene("A: bad ending", "If they didn't.")]),
    folder("Route B", [scene("B: getting closer", "A different person, a different story."), scene("B: the crisis", "Their crisis."), scene("B: good ending", "If the player earned it."), scene("B: bad ending", "If they didn't.")]),
    folder("Characters", [person("Protagonist", "Protagonist"), person("Route A character", "Supporting"), person("Route B character", "Supporting")]),
    folder("Design", [
      page("Flags and variables", [
        ["Affection", "The points each character tracks, and what raises or lowers them."],
        ["Flags", "Choices the game remembers, and the scenes that check them."],
        ["Route locks", "What has to happen to reach each route and each ending."],
      ]),
      { kind: "canvas", title: "Route map" },
    ]),
  ],
});

// ---- Game masters -------------------------------------------------------------------

const sessionPrep = (title: string, synopsis: string) =>
  scene(title, synopsis, {
    body: [
      h2("Strong start"),
      p("Open on action, not the tavern. What's happening when the session starts?"),
      h2("Scenes"),
      p("Three or four things that might happen. Don't plan the order."),
      h2("Secrets and clues"),
      p("Ten things the players could learn, in any scene."),
      h2("NPCs"),
      p("Who they might meet, and one thing each wants."),
      h2("Treasure"),
      p("What they could find or earn."),
    ],
  });

const campaign = starter("ttrpg-campaign-starter", {
  title: "Untitled campaign",
  type: "ttrpg",
  releases: [1, 2, 3].map((n) => ({ key: `r-s${n}`, title: `Session ${n}`, kind: "session" as const, ships: `s${n}` })),
  threads: [{ key: "main", name: "Campaign arc", color: ember }],
  notes: [
    folder("Session 1", [sessionPrep("Session 1 prep", "The first session. Get the party together and give them a reason to stay.")], { key: "s1" }),
    folder("Session 2", [sessionPrep("Session 2 prep", "Fill in after session one, from what the players did.")], { key: "s2" }),
    folder("Session 3", [sessionPrep("Session 3 prep", "Fill in after session two.")], { key: "s3" }),
    folder("Player characters", []),
    folder("NPCs", [person("Villain"), person("Patron")]),
    folder("Places", [place("Home base")]),
    folder("Factions", [faction("Faction one", "What they want, and what they'll do to get it."), faction("Faction two", "Who they're against.")]),
    folder("Before we play", [
      page("Campaign pitch", [
        ["The pitch", "What the campaign is, in a paragraph you could read to the table."],
        ["System and tone", "The game, the level range, and how dark or silly."],
        ["The big threat", "What happens if the players do nothing."],
      ]),
      page("Session zero", [
        ["Lines and veils", "What's off the table entirely, and what happens off screen."],
        ["Safety tools", "How anyone can pause or skip a scene."],
        ["Character ties", "How the characters know each other, and why they stay together."],
        ["Schedule", "When you play, how long, and what happens when someone can't come."],
      ]),
    ]),
  ],
});

const oneShot = starter("one-shot", {
  title: "Untitled one-shot",
  type: "ttrpg",
  releases: [{ key: "r-night", title: "Game night", kind: "session", ships: "night" }],
  notes: [
    folder(
      "The adventure",
      [
        scene("The hook", "Why the characters are here, in a minute or two. Start at the door."),
        scene("Room 1: the guardian", "Something keeps people out. A fight, a guard, a riddle."),
        scene("Room 2: the puzzle", "A challenge that can't be solved by fighting."),
        scene("Room 3: the setback", "A trick or a trap. Something goes wrong."),
        scene("Room 4: the climax", "The big fight or confrontation."),
        scene("Room 5: the reward", "The treasure, or a revelation that changes what it was all for."),
      ],
      { key: "night" },
    ),
    folder("Pre-made characters", [person("Character one"), person("Character two"), person("Character three"), person("Character four")]),
    folder("NPCs", [person("The villain")]),
    page("Running it", [
      ["Length", "How long you have, and which rooms to cut if you're running late."],
      ["Table", "How many players, and the system."],
    ]),
  ],
});

// ---- Comics -----------------------------------------------------------------------

const comicIssue = starter("comic-issue", {
  title: "Untitled comic",
  type: "comic",
  releases: [{ key: "r-issue1", title: "Issue 1", kind: "issue", ships: "issue1" }],
  notes: [
    folder(
      "Issue 1",
      [
        scene("Pages 1–2: the hook", "A splash or a strong first page. Why the reader turns the page."),
        scene("Pages 3–8: the set-up", "The lead, their world and their problem."),
        scene("Pages 9–14: the turn", "Things change. Put a reveal on an even page, so it's seen on the turn."),
        scene("Pages 15–20: the fight", "The action, or the confrontation."),
        scene("Pages 21–22: the cliffhanger", "End the issue so they buy the next one."),
      ],
      { key: "issue1" },
    ),
    folder("Characters", [person("Lead", "Protagonist"), person("Villain", "Antagonist")]),
    folder("Places", []),
    page("Series pitch", [
      ["Logline", "The series in one sentence."],
      ["The first arc", "What issues one to five, or six, are about."],
      ["Look", "Art style, and artists you'd like to work with."],
    ]),
  ],
});

// ---- Audio ------------------------------------------------------------------------

const episodes = ["Episode 1", "Episode 2", "Episode 3", "Episode 4"];
const episodeSynopses = [
  "Hook the listener in the first minute. Sound tells them where they are.",
  "Deepen the mystery. A new voice.",
  "The midpoint of the season. Something they didn't expect.",
  "The finale, and a hook for season two.",
];
const audioDrama = starter("audio-drama", {
  title: "Untitled audio drama",
  type: "podcast",
  releases: episodes.map((title, i) => ({ key: `r-ep${i + 1}`, title, kind: "episode" as const, ships: `ep${i + 1}` })),
  threads: [{ key: "season", name: "Season arc", color: ember }],
  notes: [
    ...episodes.map((title, i) => folder(title, [scene(`${title}: script`, episodeSynopses[i])], { key: `ep${i + 1}`, synopsis: episodeSynopses[i] })),
    folder("Cast", [person("Lead", "Protagonist"), person("Narrator")]),
    folder("Places", []),
    page("Season bible", [
      ["Premise", "The show in a sentence."],
      ["Format", "Episode length, narrator or not, found footage, radio play…"],
      ["Sound world", "What it sounds like: music, recurring effects, the sound of each place."],
    ]),
  ],
});

const interviewPodcast = starter("interview-podcast", {
  title: "Untitled podcast",
  type: "podcast",
  releases: [{ key: "r-ep1", title: "Episode 1", kind: "episode", ships: "ep1" }],
  notes: [
    folder(
      "Episode 1",
      [
        scene("Cold open", "The best thirty seconds of the interview, before anything else."),
        scene("Intro", "The show, the host and today's guest."),
        scene("Segment one", "Who the guest is and how they got here."),
        scene("Segment two", "The main conversation. Questions to ask, and follow-ups."),
        scene("Outro", "Where to find the guest, a thank you, and what's next week."),
      ],
      { key: "ep1" },
    ),
    folder("Guests", [person("Guest")]),
    page("Show format", [
      ["The show", "What it's about, and who it's for."],
      ["Length and schedule", "How long, and how often."],
      ["Recurring segments", "Anything that happens every episode."],
      ["Guest wishlist", "Who you'd like on, and why."],
    ]),
  ],
});

// ---- Non-fiction ----------------------------------------------------------------------

const nonfictionBook = starter("nonfiction-book", {
  title: "Untitled book",
  type: "nonfiction",
  notes: [
    beat("Introduction", "The promise: the problem the reader has and what they'll have by the end."),
    folder("Part One", [beat("Chapter 1", "The first idea, with a story that shows it."), beat("Chapter 2", "")]),
    folder("Part Two", [beat("Chapter 3", ""), beat("Chapter 4", "")]),
    folder("Part Three", [beat("Chapter 5", ""), beat("Chapter 6", "")]),
    beat("Conclusion", "Bring it together, and tell the reader what to do next."),
    folder("Research", []),
    folder("Proposal", [
      page("Book proposal", [
        ["Overview", "What the book is and why now, in a page."],
        ["Audience", "Who will buy it, and where they are."],
        ["Comparable titles", "Three to five recent books it sits beside, and how it's different."],
        ["About the author", "Why you, and the platform you'll sell it from."],
        ["Chapter outline", "A paragraph on each chapter."],
      ]),
    ]),
  ],
});

const memoir = starter("memoir", {
  title: "Untitled memoir",
  type: "nonfiction",
  threads: [{ key: "theme", name: "What it's really about", color: ember }],
  notes: [
    beat("Prologue", "A moment from the middle of the story that shows what's at stake."),
    folder("Before", [beat("Where I came from", "The people and places that made you."), beat("The way things were", "Your life before it changed.")]),
    folder("The change", [beat("What happened", "The event, or years, the book is about."), beat("The hardest part", "Where you were at your lowest.")]),
    folder("After", [beat("Who I became", "What changed, and what didn't."), beat("Now", "Where you are today, looking back.")]),
    folder("People", [person("Me", "Protagonist")]),
    folder("Places", []),
    page("What the book is about", [
      ["The question", "What your life story asks. The reader comes for the events and stays for this."],
      ["What's left out", "Years or people you won't write about, and why."],
      ["Permissions", "People you need to talk to before it's published."],
    ]),
  ],
});

// ---- Worldbuilders ---------------------------------------------------------------------

const storyBible = starter("story-bible", {
  title: "Untitled world",
  type: "franchise",
  notes: [
    folder("Stories", [folder("Story one", [scene("Opening", "The first story set in this world. Start here, or start with the world.")])]),
    folder("World", [
      page("World overview", [
        ["The world in a paragraph", "What makes it different from ours, and from every other."],
        ["Geography", "The lands, seas and cities that matter."],
        ["Power", "Who rules, and who wants to."],
      ]),
      page("Canon rules", [
        ["Laws of the world", "Magic, technology, faster-than-light travel: what's possible and what it costs."],
        ["Never", "What can never happen, so no story breaks it."],
        ["Who decides", "Who has the final word on canon, and how changes are agreed."],
      ]),
      { kind: "timeline", title: "Canon timeline" },
    ]),
    folder("Factions", [faction("Faction one", "What they want."), faction("Faction two", "Who they're against.")]),
    folder("Characters", [person("Main character", "Protagonist")]),
    folder("Places", [place("Capital"), place("The frontier")]),
  ],
});

/** The starter templates, by catalog id. Server-side in practice: the browser imports ./catalog. */
export const starters: Record<StarterId, Seed> = {
  "three-act-novel": threeActNovel,
  "beat-sheet-novel": beatSheetNovel,
  "mystery-novel": mysteryNovel,
  "romance-novel": romanceNovel,
  "novel-series": novelSeries,
  "short-story": shortStory,
  "web-serial": webSerial,
  "feature-film": featureFilm,
  "tv-pilot": tvPilot,
  "stage-play": stagePlay,
  "branching-game": branchingGame,
  "quest-rpg": questRpg,
  "visual-novel": visualNovel,
  "ttrpg-campaign-starter": campaign,
  "one-shot": oneShot,
  "comic-issue": comicIssue,
  "audio-drama": audioDrama,
  "interview-podcast": interviewPodcast,
  "nonfiction-book": nonfictionBook,
  memoir,
  "story-bible": storyBible,
};
