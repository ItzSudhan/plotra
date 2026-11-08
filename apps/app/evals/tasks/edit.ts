import { briefChecks, must, noNewIssues, onlyChanged, ran, said, should, tried, words, writeAttempts, type EvalTask } from "../score";

// Suggest and Auto (plan.md 2.11 "Edit", "Create"): changes to the project,
// judged by what the project looks like afterwards and by the story brief of
// the eval project (past tense, close third person, no "suddenly", lengths in
// hands and fingers).

/** What Pell can't know in "Slack Water": the ninth bell is a secret from her, and her mother is revealed in Book 2. */
const PELL_CANT_KNOW = /bellows|brass horn|never (?:been )?cast|no (?:ninth )?bell|empty (?:belfry|frame)|false (?:bell|toll)|her mother (?:was|is) (?:the )?(?:Chancellor|Orre)|Chancellor['’]s daughter|Orre['’]s daughter/i;

const yes = () => true;

export const editTasks: EvalTask[] = [
  {
    id: "auto-rewrite-brief",
    group: "edit",
    mode: "auto",
    about: "Rewrites a paragraph and keeps the brief's tense, point of view and banned words",
    prompt: "In “The Key”, rewrite the paragraph where Iselle turns the crank handle so the moment feels more sudden and frightening. Keep to the story brief.",
    rubric: "The paragraph is rewritten in past tense, close third person on Iselle, plain and dry, without the word “suddenly”. The rest of the scene is untouched.",
    check: async (view) => {
      const id = view.project.id("s-key");
      const text = view.project.textOf(id);
      const original = "She turned the handle once. The note it gave was thin and oddly flat, like a bell heard through a wall.";
      return [
        must("changes that paragraph", !text.includes(original) && /crank|handle|horn|bellows/i.test(text)),
        must("leaves the rest of the scene", text.includes("She took [[the key]] while") && text.includes("Iselle sat down on the floor.")),
        ...briefChecks(text),
        onlyChanged(view, ["s-key"]),
        await noNewIssues(view),
        should("reads the scene first", ran(view, "readNote").length > 0),
        should("edits the block rather than rewriting the note", ran(view, "editNote").length > 0),
      ];
    },
  },
  {
    id: "suggest-line-edit",
    group: "edit",
    mode: "suggest",
    about: "In Suggest mode a text edit arrives as a tracked change, not as an edit",
    prompt: "In “What Odran Owes”, tighten Odran's speech about the founders' mould: it runs a line too long.",
    approve: yes,
    check: (view) => {
      const id = view.project.id("s-owes");
      const node = view.project.note("s-owes");
      const before = JSON.parse(view.before.get(`note:${id}`) ?? "{}") as { content?: unknown };
      const suggested = view.project.suggestedText(id);
      return [
        must("writes a suggestion", suggested.trim().length > 0, suggested ? undefined : "no suggested text in the note"),
        must("the writer's text is still there until they accept", JSON.stringify(before.content) !== JSON.stringify(node.content) && view.project.textOf(id).includes("Eight of bronze and one of breath")),
        ...briefChecks(suggested || "x", false),
        onlyChanged(view, ["s-owes"]),
        should("reads the scene first", ran(view, "readNote").length > 0),
        should("doesn't suggest the same change twice", ran(view, "editNote", "writeNote").length <= 1),
      ];
    },
  },
  {
    id: "auto-carry-change",
    group: "edit",
    mode: "auto",
    about: "Carries one changed fact through every note that states it",
    prompt: "Odran's key is brass, not iron. Fix every note that says otherwise, and tell me which notes you changed.",
    approve: yes,
    check: async (view) => {
      const text = (key: string) => view.project.textOf(view.project.id(key));
      const fixed = (key: string, was: RegExp) => !was.test(text(key)) && /brass/i.test(text(key));
      return [
        must("fixes “Morning Toll”", fixed("s-toll", /iron key/i)),
        must("fixes Odran's character page", fixed("odran", /iron key/i)),
        must("fixes the key's own entry", fixed("key", /\biron\b/i)),
        // "The Key" mentions iron straps on the bell frame: that isn't the key.
        must("leaves the iron that isn't the key", /iron straps/.test(text("s-key"))),
        onlyChanged(view, ["s-toll", "odran", "key"]),
        await noNewIssues(view),
        should("finds the places with search or links", ran(view, "searchProject", "getLinks").length > 0),
        should("says which notes it changed", said(view, /Morning Toll/) && said(view, /Odran/)),
      ];
    },
  },
  {
    id: "auto-draft-scene",
    group: "edit",
    mode: "auto",
    about: "Drafts a scene from its synopsis with only what its point-of-view character knows",
    prompt: "Draft the scene “Slack Water” from its synopsis: about 400 words, following the story brief.",
    drafts: "s-slack",
    rubric: "A scene of roughly 400 words from Pell's point of view, past tense, plain and dry, that covers the synopsis (slack water at the Reedgate, the tide a hand above the green line). Pell must not know the ninth bell is false, or who her mother is.",
    check: async (view) => {
      const text = view.project.textOf(view.project.id("s-slack"));
      const leaked = PELL_CANT_KNOW.exec(text);
      return [
        must("writes the scene (200 words or more)", words(text) >= 200, `${words(text)} words`),
        must("covers the synopsis", /Reedgate|green line|slack/i.test(text)),
        must("uses only what Pell knows", !leaked, leaked ? `the scene says “${leaked[0]}”` : undefined),
        ...briefChecks(text),
        onlyChanged(view, ["s-slack"]),
        await noNewIssues(view),
        should("asks what the point-of-view character knows (getKnowledge)", ran(view, "getKnowledge", "characterSheet").length > 0),
        should("checks its own work (reviewChanges)", ran(view, "reviewChanges").length > 0),
      ];
    },
  },
  {
    id: "auto-set-properties",
    group: "edit",
    mode: "auto",
    about: "Puts structure in the tools made for it: story date, duration, location",
    prompt: "“Slack Water” happens on 0412-03-15 at 05:00, lasts an hour, and is set at the Low Tide Market. Record that on the scene.",
    check: (view) => {
      const properties = view.project.note("s-slack").properties;
      return [
        must("sets the story date", /^0?412-0?3-15[ T]0?5:00/.test(String(properties["story-date"] ?? "")), `story-date is “${String(properties["story-date"] ?? "")}”`),
        must("sets the location to the note, by id", properties.location === view.project.id("market"), `location is “${String(properties.location ?? "")}”`),
        should("sets the duration", /^(?:1\s*h|60\s*m|1 hour)/i.test(String(properties.duration ?? "")), `duration is “${String(properties.duration ?? "")}”`),
        onlyChanged(view, ["s-slack"]),
        should("uses setProperties", ran(view, "setProperties").length > 0),
      ];
    },
  },
  {
    id: "auto-record-knowledge",
    group: "edit",
    mode: "auto",
    about: "Records who learns what, and where, as structure rather than prose",
    prompt: "Record that Iselle learns that Pell is the Chancellor's daughter in the scene “An Audience”.",
    check: (view) => {
      const p = view.project;
      const row = p.knowledge.find((k) => k.characterNodeId === p.id("iselle") && k.factNodeId === p.id("secret-pell"));
      return [
        must("records it with recordKnowledge", Boolean(row)),
        must("in the right scene", row?.learnedInNodeId === p.id("s-audience")),
        onlyChanged(view, [], ["knowledge"]),
      ];
    },
  },
  {
    id: "suggest-asks-first",
    group: "edit",
    mode: "suggest",
    about: "In Suggest mode a new note waits for the writer's yes, then is made",
    prompt: "Add a character note for Harl Venn, an eel-seller at the Low Tide Market who owes Pell money. Put it with the other characters.",
    approve: yes,
    check: (view) => {
      const made = view.project.live().find((n) => /harl venn/i.test(n.title));
      const asked = tried(view, "createNote").some((call) => call.asked);
      return [
        must("asks before creating the note", asked),
        must("creates it once the writer says yes", made?.kind === "character", made ? `made a ${made.kind}` : "no note called Harl Venn"),
        must("puts it with the characters", made?.parentId === view.project.id("characters")),
        should("says who he is in the note", Boolean(made && (made.synopsis || words(view.project.textOf(made.id)) > 3))),
      ];
    },
  },
  {
    id: "auto-trash-asks",
    group: "edit",
    mode: "auto",
    about: "Trashing asks first in every mode, and happens when the writer agrees",
    prompt: "Move the note “The ninth bell was lost in a storm” to the trash. I don't need it any more.",
    approve: ({ name }) => name === "trashNote",
    check: (view) => [
      must("asks before trashing", tried(view, "trashNote").some((call) => call.asked)),
      must("trashes it once the writer says yes", view.project.note("old-storm").deletedAt !== null),
      onlyChanged(view, ["old-storm"]),
    ],
  },
  {
    id: "auto-plan-long-job",
    group: "edit",
    mode: "auto",
    about: "Work too long for one answer is planned as a job, not attempted in one go",
    prompt: "Outline and draft all of Book Three: twelve chapters, three scenes each.",
    check: (view) => {
      const made = writeAttempts(view).filter((call) => call.name === "createNote" || call.name === "writeNote").length;
      return [
        must("plans it with planTask, or asks what Book Three is about first", view.project.tasks.length > 0 || (made === 0 && said(view, /\?/))),
        must("doesn't start writing it all at once", made <= 5, `${made} notes created or written`),
        should("the plan has a step per chapter or scene", (view.project.tasks[0]?.steps.length ?? 0) >= 6, `${view.project.tasks[0]?.steps.length ?? 0} steps`),
      ];
    },
  },
];

