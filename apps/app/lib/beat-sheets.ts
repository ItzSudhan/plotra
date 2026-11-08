// Beat-sheet templates (plan.md 2.4 / Phase 5, beat-the-competitors.md step
// 4): story structures from Save the Cat to a five-room dungeon. Applying one
// builds a folder of acts (chapters) and beats (scenes) whose synopses say what
// each beat does, so the corkboard, outline and plot grid show the structure
// straight away. People can save their own from any folder (`sheetFrom`).

export type Beat = { title: string; synopsis: string; /** Where it falls, as a share of the story (0–100). */ at: number };
export type Act = { title: string; beats: Beat[] };
export const beatSheetGroups = {
  novel: "Novels and film",
  genre: "Romance and mystery",
  tv: "Television",
  short: "Short fiction and scenes",
  tabletop: "Tabletop",
  yours: "Yours",
} as const;
export type BeatSheetGroup = keyof typeof beatSheetGroups;
export type BeatSheet = { id: string; title: string; description: string; group?: BeatSheetGroup; acts: Act[] };

const beat = (title: string, at: number, synopsis: string): Beat => ({ title, at, synopsis });

export const beatSheets: BeatSheet[] = [
  {
    id: "save-the-cat",
    group: "novel",
    title: "Save the Cat",
    description: "Blake Snyder's 15 beats, from opening image to final image.",
    acts: [
      {
        title: "Act One",
        beats: [
          { title: "Opening Image", at: 0, synopsis: "A snapshot of the hero's world and problem before the story changes it." },
          { title: "Theme Stated", at: 5, synopsis: "Someone states the lesson the hero will learn, though they don't see it yet." },
          { title: "Set-Up", at: 6, synopsis: "The hero's life, flaws and what's missing; the people who matter." },
          { title: "Catalyst", at: 10, synopsis: "The inciting incident that knocks the hero's world off course." },
          { title: "Debate", at: 12, synopsis: "The hero hesitates: should they go? What will it cost?" },
        ],
      },
      {
        title: "Act Two",
        beats: [
          { title: "Break into Two", at: 20, synopsis: "The hero chooses to act and enters an upside-down new world." },
          { title: "B Story", at: 22, synopsis: "A new relationship that carries the theme." },
          { title: "Fun and Games", at: 25, synopsis: "The promise of the premise: the hero explores the new world." },
          { title: "Midpoint", at: 50, synopsis: "A false victory or false defeat; the stakes rise." },
          { title: "Bad Guys Close In", at: 55, synopsis: "Doubt, jealousy and enemies tighten their grip." },
          { title: "All Is Lost", at: 75, synopsis: "The lowest point; something or someone is lost." },
          { title: "Dark Night of the Soul", at: 78, synopsis: "The hero wallows, then finds the lesson." },
        ],
      },
      {
        title: "Act Three",
        beats: [
          { title: "Break into Three", at: 80, synopsis: "Armed with the lesson, the hero has a plan." },
          { title: "Finale", at: 85, synopsis: "The hero proves they've changed and wins (or loses) for real." },
          { title: "Final Image", at: 100, synopsis: "A mirror of the opening image that shows how far the hero has come." },
        ],
      },
    ],
  },
  {
    id: "heros-journey",
    group: "novel",
    title: "Hero's Journey",
    description: "Vogler's 12 stages of the monomyth.",
    acts: [
      {
        title: "Departure",
        beats: [
          { title: "Ordinary World", at: 0, synopsis: "The hero at home, limited and unaware of what's coming." },
          { title: "Call to Adventure", at: 10, synopsis: "A problem or challenge appears." },
          { title: "Refusal of the Call", at: 15, synopsis: "Fear or duty holds the hero back." },
          { title: "Meeting the Mentor", at: 20, synopsis: "Someone gives advice, training or a gift." },
          { title: "Crossing the Threshold", at: 25, synopsis: "The hero commits and leaves the ordinary world." },
        ],
      },
      {
        title: "Initiation",
        beats: [
          { title: "Tests, Allies, Enemies", at: 35, synopsis: "The hero learns the rules of the special world." },
          { title: "Approach to the Inmost Cave", at: 45, synopsis: "Preparation for the central ordeal." },
          { title: "The Ordeal", at: 55, synopsis: "A life-or-death crisis; the hero faces their greatest fear." },
          { title: "Reward", at: 65, synopsis: "The hero seizes the sword, the treasure, the knowledge." },
        ],
      },
      {
        title: "Return",
        beats: [
          { title: "The Road Back", at: 75, synopsis: "The hero heads home, often pursued." },
          { title: "Resurrection", at: 90, synopsis: "A final test where everything is at stake; the hero is reborn." },
          { title: "Return with the Elixir", at: 100, synopsis: "The hero comes home changed, with something to share." },
        ],
      },
    ],
  },
  {
    id: "three-act",
    group: "novel",
    title: "Three-act structure",
    description: "Setup, confrontation and resolution with the classic turning points.",
    acts: [
      {
        title: "Act One: Setup",
        beats: [
          { title: "Hook", at: 0, synopsis: "Grab the reader with the world, the voice and a question." },
          { title: "Inciting Incident", at: 12, synopsis: "The event that starts the story's main conflict." },
          { title: "First Plot Point", at: 25, synopsis: "The protagonist commits; there's no going back." },
        ],
      },
      {
        title: "Act Two: Confrontation",
        beats: [
          { title: "Rising Action", at: 35, synopsis: "Obstacles grow; allies and enemies take shape." },
          { title: "Midpoint", at: 50, synopsis: "A reversal that changes the protagonist from reacting to acting." },
          { title: "Second Plot Point", at: 75, synopsis: "A crisis that forces the final confrontation." },
        ],
      },
      {
        title: "Act Three: Resolution",
        beats: [
          { title: "Climax", at: 88, synopsis: "The protagonist faces the main conflict head-on." },
          { title: "Resolution", at: 100, synopsis: "Loose ends tie up; the new normal." },
        ],
      },
    ],
  },

  {
    id: "story-circle",
    title: "Story Circle",
    group: "novel",
    description: "Dan Harmon's eight steps: out into the unknown and back, changed.",
    acts: [
      {
        title: "Order",
        beats: [
          beat("You", 0, "A character in a zone of comfort."),
          beat("Need", 12, "But they want something."),
          beat("Go", 25, "They enter an unfamiliar situation."),
          beat("Search", 37, "They adapt to it."),
        ],
      },
      {
        title: "Chaos",
        beats: [
          beat("Find", 50, "They get what they wanted."),
          beat("Take", 62, "They pay a heavy price for it."),
          beat("Return", 75, "They go back to their familiar situation."),
          beat("Change", 100, "Having changed."),
        ],
      },
    ],
  },
  {
    id: "seven-point",
    title: "Seven-point structure",
    group: "novel",
    description: "Dan Wells's plan: work out the resolution, then the hook that mirrors it, then what turns one into the other.",
    acts: [
      {
        title: "Beginning",
        beats: [
          beat("Hook", 0, "The starting state: the opposite of where the story will end."),
          beat("Plot Turn 1", 15, "Something new enters and sets the story moving."),
          beat("Pinch 1", 30, "Pressure: the antagonist forces the protagonist to act."),
        ],
      },
      {
        title: "Middle",
        beats: [beat("Midpoint", 50, "The protagonist stops reacting and starts acting.")],
      },
      {
        title: "End",
        beats: [
          beat("Pinch 2", 65, "Everything goes wrong; the plan fails and all seems lost."),
          beat("Plot Turn 2", 80, "The final piece: the protagonist finds what they need to win."),
          beat("Resolution", 100, "The ending state, the mirror of the hook."),
        ],
      },
    ],
  },
  {
    id: "freytag",
    title: "Freytag's pyramid",
    group: "novel",
    description: "Five parts rising to a climax and falling to a close, from classical drama and tragedy.",
    acts: [
      { title: "Exposition", beats: [beat("Exposition", 0, "The world, the people and what they want, before the trouble starts.")] },
      {
        title: "Rising action",
        beats: [beat("Inciting moment", 10, "The force that sets the conflict going."), beat("Rising action", 25, "Complications build; the stakes climb.")],
      },
      { title: "Climax", beats: [beat("Climax", 50, "The turning point: the protagonist's fortunes change for good or ill.")] },
      { title: "Falling action", beats: [beat("Falling action", 70, "The consequences of the climax play out; a last moment of doubt.")] },
      { title: "Dénouement", beats: [beat("Dénouement", 100, "Release: loose ends are tied, and the new order (or the catastrophe) is complete.")] },
    ],
  },
  {
    id: "kishotenketsu",
    title: "Kishōtenketsu",
    group: "novel",
    description: "Four parts from Chinese and Japanese storytelling, built on a twist rather than a conflict.",
    acts: [
      {
        title: "Kishōtenketsu",
        beats: [
          beat("Ki: introduction", 0, "Introduce the characters and their world."),
          beat("Shō: development", 25, "Follow them; deepen what we know, with no great change."),
          beat("Ten: twist", 50, "Something unexpected, often unrelated, that casts the rest in a new light."),
          beat("Ketsu: reconciliation", 75, "Bring the parts together; the twist and the story make a whole."),
        ],
      },
    ],
  },
  {
    id: "fichtean",
    title: "Fichtean curve",
    group: "novel",
    description: "Straight into trouble, then a rising run of crises to the climax. Good for thrillers.",
    acts: [
      {
        title: "Rising action",
        beats: [
          beat("Inciting incident", 0, "Open on the problem: backstory comes later, through the crises."),
          beat("First crisis", 15, "An obstacle the protagonist barely gets past."),
          beat("Second crisis", 30, "A worse one; the cost rises."),
          beat("Third crisis", 45, "Worse again: the protagonist is pushed to the edge."),
          beat("Fourth crisis", 60, "The last and hardest before everything comes to a head."),
        ],
      },
      {
        title: "Climax and after",
        beats: [beat("Climax", 80, "The decisive confrontation."), beat("Falling action", 100, "A short release: what's left after the climax.")],
      },
    ],
  },
  {
    id: "heroines-journey",
    title: "Heroine's Journey",
    group: "novel",
    description: "Maureen Murdock's ten stages: a journey inward, to wholeness, rather than out and back.",
    acts: [
      {
        title: "Separation",
        beats: [
          beat("Separation from the feminine", 0, "She rejects what she's been told she is, or must be."),
          beat("Identification with the masculine", 10, "She takes up the world's idea of success and gathers allies."),
          beat("Road of trials", 20, "She meets the tests and the ogres of that world."),
          beat("The illusory boon of success", 30, "She wins, by its measure."),
        ],
      },
      {
        title: "Descent",
        beats: [
          beat("Spiritual aridity", 40, "Success feels empty: a kind of death."),
          beat("Initiation and descent", 50, "She goes down into the dark, losing what she was."),
          beat("Yearning to reconnect", 60, "She longs for what she gave up."),
        ],
      },
      {
        title: "Return",
        beats: [
          beat("Healing the mother–daughter split", 70, "She makes peace with where she came from."),
          beat("Healing the wounded masculine", 85, "She makes peace with what she became."),
          beat("Integration", 100, "Both are hers: she is whole."),
        ],
      },
    ],
  },
  {
    id: "romancing-the-beat",
    title: "Romance beats",
    group: "genre",
    description: "Gwen Hayes's Romancing the Beat: two people, four phases, from meeting to a whole-hearted ending.",
    acts: [
      {
        title: "Setup",
        beats: [
          beat("Introduce the first lead", 0, "Their life, their wound, what's missing."),
          beat("Introduce the second lead", 3, "The same for the other, or as the first sees them."),
          beat("Meet", 5, "They meet: the inciting incident of the romance."),
          beat("No way, part one", 10, "Why this can never work."),
          beat("Adhesion", 20, "Something forces them to stay together."),
        ],
      },
      {
        title: "Falling in love",
        beats: [
          beat("No way, part two", 25, "They resist, harder."),
          beat("Inkling of desire", 30, "A first crack: one of them wants more."),
          beat("Deepening desire", 35, "They see past the surface."),
          beat("Maybe this could work", 40, "A glimpse of what they could be."),
          beat("Midpoint of love", 50, "A big moment of intimacy, and a false high."),
        ],
      },
      {
        title: "Retreating from love",
        beats: [
          beat("Inkling of doubt", 55, "The old wound stirs."),
          beat("Deepening doubt", 60, "Fear wins ground."),
          beat("Retreat", 65, "One or both pull back."),
          beat("Shields up", 70, "They protect themselves at the cost of the other."),
          beat("Break up", 75, "It falls apart."),
        ],
      },
      {
        title: "Fighting for love",
        beats: [
          beat("Dark night of the soul", 80, "Alone, they face what's really wrong."),
          beat("Wake up", 85, "They see what they must change."),
          beat("Grand gesture", 92, "They risk everything to prove it."),
          beat("Whole-hearted", 100, "Together, and changed: the happy ending."),
        ],
      },
    ],
  },
  {
    id: "mystery",
    title: "Mystery (whodunit)",
    group: "genre",
    description: "A crime, an investigation of clues and suspects, a false solution and the reveal.",
    acts: [
      {
        title: "The crime",
        beats: [
          beat("The crime", 0, "A body, a theft, a disappearance: the question the book will answer."),
          beat("The detective takes the case", 8, "Why this person, and why they can't walk away."),
          beat("First clues and suspects", 15, "The circle of suspects, each with a motive; the first clues, true and false."),
        ],
      },
      {
        title: "The investigation",
        beats: [
          beat("Complications", 30, "Interviews, lies and dead ends; a second crime raises the stakes."),
          beat("Midpoint revelation", 50, "A discovery that changes what the case is about."),
          beat("The false solution", 65, "The obvious answer, which turns out wrong."),
          beat("Dark moment", 75, "The detective is stuck, discredited or in danger."),
        ],
      },
      {
        title: "The solution",
        beats: [
          beat("The breakthrough", 85, "The clue that was there all along falls into place."),
          beat("The reveal", 92, "The culprit is named and the clues are explained, fairly."),
          beat("Resolution", 100, "Justice, or what passes for it; the world after the case."),
        ],
      },
    ],
  },
  {
    id: "pulp",
    title: "Pulp master plot",
    group: "short",
    description: "Lester Dent's formula for a 6,000-word adventure, in four quarters of rising trouble.",
    acts: [
      {
        title: "First quarter",
        beats: [beat("Trouble", 0, "Introduce the hero and swat them with a fistful of trouble; hint at a mystery or menace."), beat("Physical conflict", 20, "The hero pitches in to cope and ends in a fight, with a twist.")],
      },
      { title: "Second quarter", beats: [beat("More grief", 25, "Shovel more trouble onto the hero; another fight, another twist.")] },
      { title: "Third quarter", beats: [beat("Still more grief", 50, "The hero makes headway, then is pushed back; worse trouble and a surprise.")] },
      {
        title: "Fourth quarter",
        beats: [
          beat("Deepest trouble", 75, "The difficulties pile up until the hero seems beaten."),
          beat("The way out", 90, "The hero gets clear by their own skill or nerve."),
          beat("Final twist", 100, "The mysteries are cleared up, with a last surprise."),
        ],
      },
    ],
  },
  {
    id: "five-commandments",
    title: "Five commandments",
    group: "short",
    description: "Shawn Coyne's Story Grid unit of story: works for a scene, a sequence or a whole book.",
    acts: [
      {
        title: "Unit of story",
        beats: [
          beat("Inciting incident", 0, "An event that upsets the balance of the character's life."),
          beat("Progressive complications", 25, "Things get harder, to a turning point that changes everything."),
          beat("Crisis", 50, "A dilemma: a choice between two goods or two evils."),
          beat("Climax", 75, "The choice, and the action it takes."),
          beat("Resolution", 100, "What the choice leads to: the new balance."),
        ],
      },
    ],
  },
  {
    id: "tv-drama",
    title: "One-hour drama episode",
    group: "tv",
    description: "A teaser, four acts each ending on a break, and a tag, with A, B and C stories.",
    acts: [
      { title: "Teaser", beats: [beat("Teaser", 0, "A cold open that hooks the audience and sets up the episode's question.")] },
      { title: "Act One", beats: [beat("A story set up", 5, "The episode's main problem."), beat("B story set up", 12, "The second line, often personal."), beat("Act One out", 25, "A turn that makes the problem bigger.")] },
      { title: "Act Two", beats: [beat("Complications", 35, "The plan meets resistance; the C story touches in."), beat("Act Two out", 50, "A reversal at the midpoint.")] },
      { title: "Act Three", beats: [beat("Things fall apart", 60, "The A and B stories collide."), beat("Act Three out", 75, "The lowest point: the cliffhanger before the last break.")] },
      { title: "Act Four", beats: [beat("Climax", 85, "The A story is resolved, at a cost."), beat("B story resolved", 92, "The personal line pays off.")] },
      { title: "Tag", beats: [beat("Tag", 100, "A last beat that closes the episode or opens the next.")] },
    ],
  },
  {
    id: "sitcom",
    title: "Half-hour comedy episode",
    group: "tv",
    description: "A cold open, two acts with an A and a B story, and a tag.",
    acts: [
      { title: "Cold open", beats: [beat("Cold open", 0, "A self-contained bit that sets the tone, or the premise.")] },
      {
        title: "Act One",
        beats: [beat("A story starts", 8, "The main character wants something."), beat("B story starts", 15, "Someone else's smaller problem."), beat("Act break", 45, "The plan goes sideways.")],
      },
      {
        title: "Act Two",
        beats: [beat("Escalation", 60, "Things get worse; the A and B stories tangle."), beat("Climax", 85, "Everything comes out at once."), beat("Back to normal", 95, "Lesson learned, or not.")],
      },
      { title: "Tag", beats: [beat("Tag", 100, "One last joke.")] },
    ],
  },
  {
    id: "lazy-dm",
    title: "Session prep",
    group: "tabletop",
    description: "Mike Shea's eight steps from Return of the Lazy Dungeon Master: just enough to run a great session.",
    acts: [
      {
        title: "Session prep",
        beats: [
          beat("Review the characters", 0, "What do the players' characters want, and how can this session touch it?"),
          beat("Create a strong start", 14, "Open in the middle of something: a fight, a mystery, a choice."),
          beat("Outline potential scenes", 28, "A handful of scenes that might happen. They will change."),
          beat("Define secrets and clues", 42, "Ten things the players could learn, not tied to any one scene."),
          beat("Develop fantastic locations", 57, "Three or so places with one striking detail each."),
          beat("Outline important NPCs", 71, "Who they'll meet: a name, a look, what they want."),
          beat("Choose relevant monsters", 85, "What they might fight, ready to run."),
          beat("Select magic item rewards", 100, "What they might find, and why it matters."),
        ],
      },
    ],
  },
  {
    id: "five-room-dungeon",
    title: "Five-room dungeon",
    group: "tabletop",
    description: "Johnn Four's compact adventure: five rooms or encounters, each with a job to do.",
    acts: [
      {
        title: "The dungeon",
        beats: [
          beat("Entrance and guardian", 0, "Why it hasn't been looted already: a guard, a trap, a riddle at the door."),
          beat("Puzzle or roleplaying challenge", 25, "A test that brute force won't pass."),
          beat("Trick or setback", 50, "A twist that raises tension: the treasure is a fake, the floor gives way."),
          beat("Climax", 75, "The big fight or the big confrontation."),
          beat("Reward, revelation, plot twist", 100, "What they win, and what it means for the next adventure."),
        ],
      },
    ],
  },
];

export const getBeatSheet = (id: string) => beatSheets.find((s) => s.id === id);

// ---- Your own -----------------------------------------------------------------------------------

// What one person may keep: their sheets travel with every page load of the shell (ShellPrefs.beatSheets).
export const MAX_OWN_SHEETS = 12;
const MAX_ACTS = 30;
const MAX_BEATS = 120;
const MAX_TITLE = 200;
const MAX_SYNOPSIS = 500;

const text = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");
// What applying a sheet adds to each synopsis, taken off again when a folder is saved as one.
const placeNote = / ?\(≈\d{1,3}% in\)$/;

/** A sheet as it arrives from the browser, made safe to keep and to build from; null if there's nothing to it. */
export function cleanSheet(input: unknown): BeatSheet | null {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  let budget = MAX_BEATS;
  const acts: Act[] = [];
  for (const act of (Array.isArray(raw.acts) ? raw.acts : []).slice(0, MAX_ACTS)) {
    const a = (act && typeof act === "object" ? act : {}) as Record<string, unknown>;
    const beats: Beat[] = [];
    for (const b of Array.isArray(a.beats) ? a.beats : []) {
      if (budget <= 0) break;
      const r = (b && typeof b === "object" ? b : {}) as Record<string, unknown>;
      const title = text(r.title, MAX_TITLE);
      if (!title) continue;
      const at = typeof r.at === "number" && Number.isFinite(r.at) ? Math.min(100, Math.max(0, Math.round(r.at))) : 0;
      beats.push({ title, synopsis: text(r.synopsis, MAX_SYNOPSIS), at });
      budget--;
    }
    if (beats.length) acts.push({ title: text(a.title, MAX_TITLE) || "Act", beats });
  }
  if (!acts.length) return null;
  const id = typeof raw.id === "string" && /^own-[a-z0-9-]{1,40}$/.test(raw.id) ? raw.id : `own-${crypto.randomUUID().slice(0, 8)}`;
  return { id, title: text(raw.title, 80) || "Untitled structure", description: text(raw.description, 300), group: "yours", acts };
}

export const cleanOwnSheets = (input: unknown): BeatSheet[] =>
  (Array.isArray(input) ? input : [])
    .map(cleanSheet)
    .filter((sheet): sheet is BeatSheet => sheet !== null)
    .slice(0, MAX_OWN_SHEETS);

type TreeNode = { id: string; kind: string; title: string; synopsis: string | null; deletedAt: Date | string | null };
type Tree = { byId: Map<string, TreeNode>; children: Map<string | null, TreeNode[]> };
const isContainer = (node: TreeNode) => node.kind === "folder" || node.kind === "chapter";

/**
 * A folder or chapter as a beat sheet of your own: each chapter (or folder)
 * inside it is an act, and the notes in it are beats, with their synopses.
 * Notes sitting straight inside the folder make an act named after it. Beats
 * are spaced evenly through the story. Null when there are no notes to keep.
 */
export function sheetFrom(index: Tree, rootId: string): BeatSheet | null {
  const root = index.byId.get(rootId);
  if (!root || !isContainer(root)) return null;
  const live = (id: string) => (index.children.get(id) ?? []).filter((n) => !n.deletedAt);
  /** Every note under a container, nested folders flattened, in binder order. */
  const leaves = (id: string): TreeNode[] => live(id).flatMap((n) => (isContainer(n) ? leaves(n.id) : [n]));
  const acts: Array<{ title: string; notes: TreeNode[] }> = [];
  if (root.kind === "chapter") acts.push({ title: root.title, notes: leaves(root.id) });
  else {
    let loose: TreeNode[] = [];
    for (const child of live(root.id)) {
      if (isContainer(child)) {
        if (loose.length) acts.push({ title: root.title, notes: loose });
        loose = [];
        acts.push({ title: child.title, notes: leaves(child.id) });
      } else loose.push(child);
    }
    if (loose.length) acts.push({ title: root.title, notes: loose });
  }
  const total = acts.reduce((sum, act) => sum + act.notes.length, 0);
  let k = 0;
  return cleanSheet({
    title: root.title,
    description: root.synopsis ?? "",
    acts: acts.map((act) => ({
      title: act.title,
      beats: act.notes.map((note) => ({ title: note.title, synopsis: (note.synopsis ?? "").replace(placeNote, ""), at: total > 1 ? Math.round((k++ / (total - 1)) * 100) : 0 })),
    })),
  });
}
