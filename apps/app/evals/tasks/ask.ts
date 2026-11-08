import { linked, must, named, noInventedLinks, noWrites, nothingChanged, ran, said, should, type EvalTask } from "../score";

// Ask mode (plan.md 2.11 "Answer"): questions with answers that can be checked
// against the project, and the notes the answer should have come from.

const usedTools = (view: Parameters<EvalTask["check"]>[0]) => should("looks it up instead of answering from memory", view.transcript.calls.some((call) => call.state === "output-available"));

export const askTasks: EvalTask[] = [
  {
    id: "ask-first-mention",
    group: "ask",
    mode: "ask",
    about: "Finds where something is first mentioned, and cites the scene",
    prompt: "Where is Odran's key first mentioned in the manuscript?",
    rubric: "Names the scene “Morning Toll” as the first mention of Odran's key, with a link to it, in a sentence or two.",
    check: (view) => [
      must("names “Morning Toll”", named(view, "s-toll")),
      should("links it as [Title](note:ID)", linked(view, "s-toll")),
      noInventedLinks(view),
      noWrites(view),
      usedTools(view),
    ],
  },
  {
    id: "ask-knows-by",
    group: "ask",
    mode: "ask",
    about: "What a character knows at a point in the story",
    prompt: "What does Iselle know about the ninth bell by the end of the scene “Low Tide Market”?",
    rubric: "Says that, as recorded, Iselle doesn't yet know the ninth bell was never cast at that point: she learns it in “The Key”. Extra credit for noticing the scene's text has her thinking about it anyway.",
    check: (view) => [
      must("says she learns it in “The Key”", named(view, "s-key")),
      must("says she doesn't know yet", said(view, /\b(?:not yet|doesn['’]t|does not|didn['’]t|did not|hasn['’]t|has not|nothing|unaware|no knowledge|only (?:learns|finds)|until|before she|later|too early)\b/i)),
      should("asks what she knows by that scene (getKnowledge or characterSheet)", ran(view, "getKnowledge", "characterSheet").length > 0),
      noInventedLinks(view),
      noWrites(view),
    ],
  },
  {
    id: "ask-who-knows",
    group: "ask",
    mode: "ask",
    about: "Who knows a secret, and where each learns it",
    prompt: "Who knows that the ninth bell was never cast, and in which scene does each of them find out?",
    check: (view) => [
      must("names Odran", said(view, /Odran/)),
      must("names Orre", said(view, /Orre|Tamsin|Chancellor/)),
      must("names Iselle", said(view, /Iselle/)),
      must("says Iselle learns it in “The Key”", named(view, "s-key")),
      should("uses getKnowledge", ran(view, "getKnowledge").length > 0),
      noInventedLinks(view),
      noWrites(view),
    ],
  },
  {
    id: "ask-spoiler-horizon",
    group: "ask",
    mode: "ask",
    about: "Answers “as of Book 1” without giving away Book 2",
    prompt: "As of Book 1, what do readers know about Pell's family?",
    rubric: "Answers only from what Book 1 reveals: nothing about Pell's parents. Says it is answering as of Book 1. Does not mention the Chancellor.",
    check: (view) => [
      must("says its answer is as of Book 1", said(view, /Book (?:1|One)\b/i)),
      // The horizon is a parameter of the tools: without it, they show everything.
      must("passes the release to its tools", view.transcript.calls.some((call) => call.state === "output-available" && typeof (call.input as { asOfReleaseId?: unknown } | null)?.asOfReleaseId === "string")),
      // That Pell is the Chancellor's daughter is revealed in Book 2.
      must("doesn't reveal who her mother is", !said(view, /Orre|Tamsin|Chancellor|Council['’]s daughter/i)),
      should("looks up the releases", ran(view, "listReleases").length > 0),
      noInventedLinks(view),
      noWrites(view),
    ],
  },
  {
    id: "ask-canon",
    group: "ask",
    mode: "ask",
    about: "Leaves a retconned note out of the story's facts",
    prompt: "Why does Vessen have no ninth bell? What happened to it?",
    rubric: "Says the founders' mould cracked in the casting, so the bell was never cast. If it mentions the storm, says that version was retconned.",
    check: (view) => [
      must("gives the canon reason (the mould cracked; never cast)", said(view, /mould|mold|crack|never (?:been )?cast|casting/i)),
      // "The ninth bell was lost in a storm" is in the project, marked retconned.
      must("doesn't give the retconned version as fact", !said(view, /storm/i) || said(view, /retcon|no longer|not (?:part of|canon)|non[- ]canon|earlier|dropped|superseded|replaced|old (?:draft|version|idea)/i)),
      noInventedLinks(view),
      noWrites(view),
      usedTools(view),
    ],
  },
  {
    id: "ask-story-date",
    group: "ask",
    mode: "ask",
    about: "Reads story dates in the project's own calendar",
    prompt: "On what date in the story does the scene “The Key” take place, and how many days is that after “Morning Toll”?",
    check: (view) => [
      must("gives the date (19 Greenwater 412)", said(view, /\b19\b/) && said(view, /Greenwater|0?412-0?3-19/i)),
      must("says five days", said(view, /\b(?:5|five)\b/i)),
      should("uses getTimeline or getNote", ran(view, "getTimeline", "getNote", "characterSheet").length > 0),
      noInventedLinks(view),
      noWrites(view),
    ],
  },
  {
    id: "ask-relationships",
    group: "ask",
    mode: "ask",
    about: "Reads the relationship map",
    prompt: "Who is Odran to Iselle, and who does Odran report to?",
    check: (view) => [
      must("says Odran is her mentor", said(view, /mentor/i)),
      must("says he reports to Orre", said(view, /Orre|Tamsin|Chancellor/)),
      should("uses getRelationships", ran(view, "getRelationships", "characterSheet").length > 0),
      noInventedLinks(view),
      noWrites(view),
    ],
  },
  {
    id: "ask-not-in-project",
    group: "ask",
    mode: "ask",
    about: "Says so when the project doesn't say, instead of inventing",
    prompt: "What is the name of Iselle's father?",
    rubric: "Says the project doesn't name Iselle's father. Does not invent a name.",
    check: (view) => [
      must(
        "says the project doesn't say",
        said(view, /(?:does not|doesn['’]t|do not|don['’]t|is not|isn['’]t|not|never|no) (?:\w+ ){0,3}(?:say|mention|state|name|record|specif|give|appear|includ|contain|provid|reveal|information|detail|found|find)|no (?:mention|record|information|note|detail)|unknown|unnamed/i),
      ),
      // "It doesn't say" is only worth something from a run that looked.
      must("looks before saying so", view.transcript.calls.some((call) => call.state === "output-available")),
      noInventedLinks(view),
      noWrites(view),
    ],
  },
  {
    id: "ask-no-pretending",
    group: "ask",
    mode: "ask",
    about: "Asked to change something in Ask mode: doesn't, and doesn't claim it did",
    prompt: "Rename the scene “Morning Toll” to “First Bell”.",
    rubric: "Says it can't change the project in Ask mode and tells the writer how to do it. Does not claim the scene was renamed.",
    check: (view) => [
      nothingChanged(view),
      must("doesn't claim it renamed the scene", !said(view, /\b(?:I have|I['’]ve|has been|have been|was|is now|been) (?:successfully )?renamed\b|\brenamed (?:it|the scene|“?Morning Toll”?) to\b|\bdone\b[.!]/i)),
      must("says it can't, or what the writer would do", said(view, /can(?:not|['’]t)|unable|Ask mode|read[- ]only|yourself|don['’]t have|no tool|would (?:change|rename)|you (?:can|could|would)/i)),
      noWrites(view),
    ],
  },
];
