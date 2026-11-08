import type { ProjectType, ScriptFormat } from "@plotra/db/schema";
import { typeFormat } from "../modules";
import { l, p, revealedIn, type SampleBlock, type SampleInline, type SampleNote, type Seed } from "../samples/types";
import { ACTION, CHARACTER, DIALOGUE, SCENE_HEADING } from "../script";
import { trackOf, type Answers, type TrackId } from "./tracks";

// Turns the Cold Open's answers (./tracks.ts) into a project: the same plain
// data a sample is written in, so `buildSample` (lib/samples/build.ts) makes
// the rows, the links and the documents. Pure. Expects answers that have been
// through `cleanAnswers`.
//
// Whatever was answered becomes a note, and the first document mentions each
// of them as a real link, so the graph already has edges when the project
// opens. Whatever was skipped is simply not there.

const FIRST = "first";
const WHO = "who";
const WHERE = "where";
const SECRET = "secret";
const POV = "pov";

/** A note title from a longer answer: its first clause, without the full stop. */
const short = (value: string, max = 60) => {
  const first = value.split(/(?<=[.!?])\s/)[0].replace(/[.!?]+$/, "");
  return first.length <= max ? first : `${first.slice(0, max - 1).trimEnd()}…`;
};

/** A new note is a draft like any other the writer makes, not established canon as a sample's are. */
const draft = (note: SampleNote): SampleNote => ({ ...note, canon: "draft", children: note.children?.map(draft) });

const folder = (key: string, title: string, children: SampleNote[], rest: Partial<SampleNote> = {}): SampleNote => ({ key, kind: "folder", title, children, ...rest });

/** An empty paragraph for the cursor to land in. */
const blank = (type: SampleBlock["type"] = "p"): SampleBlock => ({ type, parts: [""] });

const block = (type: SampleBlock["type"], ...parts: SampleInline[]): SampleBlock => ({ type, parts });

/** "Mira is in the Salt Docks.", with whichever of the two exists as a link. */
function opening({ who, where }: Answers): SampleBlock[] {
  if (who && where) return [p(l(WHO), " is in ", l(WHERE), ".")];
  if (who) return [p(l(WHO), ".")];
  if (where) return [p("In ", l(WHERE), ".")];
  return [];
}

export function projectTitle({ who, where }: Answers) {
  if (who && where) return `Untitled: ${who} in ${where}`;
  return who || where ? `Untitled: ${who ?? where}` : "Untitled";
}

/** The note the answers' secret becomes, and who knows it. A goal becomes a plot thread instead. */
function drive(answers: Answers) {
  const { drive: text, driveKind, who } = answers;
  const secret = text && driveKind !== "goal";
  return {
    secretNote: secret ? folder("secrets", "Secrets", [{ key: SECRET, kind: "note", title: short(text), body: [who ? p(l(WHO), ": ", text) : p(text)] }]) : null,
    knowledge: secret && who ? [{ character: WHO, secret: SECRET }] : [],
    threads: text && !secret ? [{ key: "want", name: short(text, 40), color: "#e2602a", cells: [{ scene: FIRST, note: text }] }] : [],
    arc: text && !secret ? text : undefined,
  };
}

/** The folder of characters: the one the story is about (the protagonist, unless it's a game master's NPC) and any others. */
function people(answers: Answers, title: string, arc: string | undefined, others: SampleNote[] = [], role: string | null = "Protagonist"): SampleNote | null {
  const who: SampleNote[] = answers.who
    ? [{ key: WHO, kind: "character", title: answers.who, properties: { ...(role && { role }), ...(arc && { arc }), "first-appearance": { note: FIRST } } }]
    : [];
  return who.length + others.length ? folder("characters", title, [...who, ...others]) : null;
}

const places = (answers: Answers): SampleNote | null => (answers.where ? folder("places", "Places", [{ key: WHERE, kind: "location", title: answers.where }]) : null);

/** The properties of the first scene that point at the notes made from the answers. */
const sceneProperties = (answers: Answers, pov: string | null) => ({
  ...(pov && { pov: { note: pov } }),
  ...(answers.where && { location: { note: WHERE } }),
});

type Built = Pick<Seed, "notes" | "releases" | "threads" | "knowledge">;

function novel(answers: Answers): Built {
  const extra = answers.extra ?? {};
  const d = drive(answers);
  const otherPov = extra.pov === "other" && extra.povText ? extra.povText : null;
  const pov = otherPov ? POV : answers.who ? WHO : null;
  const chapter: SampleNote = {
    key: "chapter1",
    kind: "chapter",
    title: "Chapter 1",
    children: [{ key: FIRST, kind: "scene", title: "Opening", properties: sceneProperties(answers, pov), body: [...opening(answers), blank()] }],
  };
  const series = extra.scope === "series";
  return {
    notes: [
      series ? folder("book1", "Book 1", [chapter]) : chapter,
      people(answers, "Characters", d.arc, otherPov ? [{ key: POV, kind: "character", title: otherPov }] : []),
      places(answers),
      d.secretNote,
    ].filter((n) => n !== null),
    releases: series ? [{ key: "book1", title: "Book 1", kind: "book", ships: "book1" }] : [],
    threads: d.threads,
    knowledge: d.knowledge,
  };
}

function ttrpg(answers: Answers): Built {
  const extra = answers.extra ?? {};
  const d = drive(answers);
  const players = [...new Set((extra.players ?? "").split(",").map((name) => name.trim().slice(0, 80)).filter(Boolean))].slice(0, 8);
  // The table sees what a session has revealed; a block revealed "never" stays on the GM's side of the screen.
  const gm = answers.drive && answers.driveKind !== "goal" ? p("GM: ", answers.drive, " See ", l(SECRET), ".") : p("GM: only you see blocks like this one. Players never do.");
  const shown = { reveal: "session1" };
  return {
    notes: [
      folder("session1", "Session 1", [
        {
          key: FIRST,
          kind: "scene",
          title: "Session 1 prep",
          synopsis: extra.session,
          properties: sceneProperties(answers, null),
          body: [...(extra.session ? [p(extra.session)] : []), ...opening(answers), revealedIn("never", gm), blank()],
        },
      ]),
      players.length ? folder("pcs", "Player characters", players.map((name, i) => ({ key: `pc${i}`, kind: "character" as const, title: name, synopsis: "Player character." })), shown) : null,
      answers.who ? { ...people(answers, "NPCs", d.arc, [], null)!, ...shown } : null,
      answers.where ? { ...places(answers)!, ...shown } : null,
      d.secretNote,
    ].filter((n) => n !== null),
    releases: [{ key: "session1", title: "Session 1", kind: "session", ships: "session1" }],
    threads: d.threads,
    knowledge: d.knowledge,
  };
}

function screenplay(answers: Answers): Built {
  const extra = answers.extra ?? {};
  const d = drive(answers);
  const heading = `${extra.setting ?? "INT."} ${(answers.where ?? "LOCATION").toUpperCase()} - DAY`;
  const body: SampleBlock[] = [block(SCENE_HEADING, heading)];
  // The character walks on in the action line, then is cued, and the cursor waits in their first line.
  if (answers.who) body.push(block(ACTION, l(WHO), "."), block(CHARACTER, answers.who.toUpperCase()), blank(DIALOGUE));
  else body.push(blank(ACTION));
  const scene: SampleNote = { key: FIRST, kind: "scene", title: "Opening scene", settings: { format: "screenplay" }, properties: sceneProperties(answers, null), body };
  const container = extra.form === "series" ? "Episode 1" : extra.form === "pilot" ? "Pilot" : "Act One";
  return {
    notes: [folder("part1", container, [scene]), people(answers, "Characters", d.arc), places(answers), d.secretNote].filter((n) => n !== null),
    releases: extra.form === "series" ? [{ key: "episode1", title: "Episode 1", kind: "episode", ships: "part1" }] : [],
    threads: d.threads,
    knowledge: d.knowledge,
  };
}

/** Every other type: its first document in the type's own format, beside the notes from the answers. */
function other(answers: Answers, format: ScriptFormat): Built {
  const d = drive(answers);
  const scene: SampleNote = {
    key: FIRST,
    kind: "scene",
    title: answers.who || answers.where ? "First scene" : "Untitled scene",
    properties: sceneProperties(answers, answers.who ? WHO : null),
    // A script's elements differ by format, so its first page starts empty; prose opens on the links.
    ...(format === "prose" ? { body: [...opening(answers), blank()] } : { settings: { format } }),
  };
  return {
    notes: [scene, people(answers, "Characters", d.arc), places(answers), d.secretNote].filter((n) => n !== null),
    releases: [],
    threads: d.threads,
    knowledge: d.knowledge,
  };
}

const builders: Record<Exclude<TrackId, "other">, (answers: Answers) => Built> = { novel, ttrpg, screenplay };

/** The project a set of answers starts as. With nothing answered it is the track's first document, empty. */
export function seedFromAnswers(answers: Answers): Seed & { track: TrackId } {
  const type: ProjectType = answers.type ?? "novel";
  const track = trackOf(type);
  const built = track === "other" ? other(answers, typeFormat[type]) : builders[track](answers);
  return {
    id: `cold-open:${track}`,
    track,
    title: projectTitle(answers),
    type,
    logline: "",
    open: FIRST,
    ...built,
    notes: built.notes.map(draft),
    relationships: [],
    setups: [],
    events: [],
    continuity: [],
  };
}
