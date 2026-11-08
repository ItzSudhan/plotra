// The story brief's title and starting body (plan.md 2.11 "What it knows").
// No server code here: the panel uses the title to see whether a project has a
// brief yet.

export const BRIEF_TITLE = "Story brief";

const h2 = (text: string) => ({ type: "h2", children: [{ text }] });
const p = (text: string) => ({ type: "p", children: [{ text }] });

/**
 * Headings to fill in, each with a line saying what goes there. The whole note
 * is sent with every run, so the prompts are written to be replaced, and a
 * heading left as it is costs a line.
 */
export const briefTemplate = [
  p("This note is sent to the AI with everything you ask it. Replace each line with your own; delete what you don't need."),
  h2("What this is"),
  p("Genre, length, audience, and the story in two sentences."),
  h2("Voice"),
  p("How the prose sounds: plain or lyrical, dry or warm, long sentences or short. A writer or a book it should sit beside."),
  h2("Tense and point of view"),
  p("Past or present tense. First person, close third, omniscient. Whose head each chapter is in."),
  h2("Rules of the world"),
  p("What is true here that isn't true elsewhere: how the magic or technology works and what it costs, what can't happen."),
  h2("Things to avoid"),
  p("Words, tropes and habits you don't want. Content that is off limits."),
  h2("How to work with me"),
  p("What you want from the AI: line edits only, full drafts to rewrite, questions before big changes."),
];
