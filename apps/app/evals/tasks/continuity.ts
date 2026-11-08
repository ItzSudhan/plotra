import { briefChecks, changed, continuityIssues, hasIssue, must, named, noWrites, onlyChanged, ran, said, should, words, type EvalTask } from "../score";

// Continuity (plan.md 2.11 "Check"): the sample has one slip left in on
// purpose (Iselle thinks about the secret in "Low Tide Market", five days
// before she learns it). These tasks ask the agent to report it, to fix it,
// and to notice when what it was asked to do creates a new one. The result is
// scored with the rule-based checks themselves (lib/continuity.ts).

export const continuityTasks: EvalTask[] = [
  {
    id: "continuity-report",
    group: "continuity",
    mode: "ask",
    about: "Runs the continuity checks and reports what they found",
    prompt: "Run the continuity checks and tell me what they find.",
    check: (view) => [
      must("runs checkContinuity", ran(view, "checkContinuity").length > 0),
      must("names “Low Tide Market”", named(view, "s-market")),
      must("says what is wrong (she knows before she learns it)", said(view, /The Key|too early|before (?:she |they )?(?:learn|find)|knows|learn/i)),
      noWrites(view),
    ],
  },
  {
    id: "continuity-fix",
    group: "continuity",
    mode: "auto",
    about: "Fixes a contradiction; scored by running the continuity checks on the result",
    prompt: "The continuity check says Iselle knows about the silent bell too early in “Low Tide Market”. Fix that scene so she doesn't know yet. Change as little as you can.",
    check: async (view) => {
      const issues = await continuityIssues(view.project);
      const scene = view.project.textOf(view.project.id("s-market"));
      return [
        must("the continuity checks no longer report it", !hasIssue(issues, "knows-too-early")),
        must("the scene is still there", words(scene) >= 80, `${words(scene)} words`),
        onlyChanged(view, ["s-market"]),
        ...briefChecks(scene, false),
        should("reads the scene before editing it", ran(view, "readNote").length > 0),
        should("checks its own work (reviewChanges or checkContinuity)", ran(view, "reviewChanges", "checkContinuity").length > 0),
      ];
    },
  },
  {
    id: "continuity-two-places",
    group: "continuity",
    mode: "auto",
    about: "Asked for a change that puts someone in two places at once: makes it, and says so",
    prompt: "Move “What Odran Owes” earlier: set its story date to 0412-03-19 22:30.",
    check: async (view) => {
      const issues = await continuityIssues(view.project);
      const date = String(view.project.note("s-owes").properties["story-date"] ?? "");
      return [
        must("sets the date it was asked to", /^0?412-0?3-19 22:30/.test(date), `story-date is “${date}”`),
        // Iselle is in the Ninth Belfry from 22:00 to midnight that night ("The Key").
        must("tells the writer about the clash", !hasIssue(issues, "two-places") || said(view, /two places|same time|at once|overlap|clash|conflict|continuity|The Key/i)),
        onlyChanged(view, ["s-owes"]),
        should("checks its own work (reviewChanges or checkContinuity)", ran(view, "reviewChanges", "checkContinuity").length > 0),
      ];
    },
  },
  {
    id: "continuity-introduce",
    group: "continuity",
    mode: "auto",
    about: "Asked to write something the point-of-view character can't know yet: flags it",
    prompt: "At the end of “Morning Toll”, add one line in which Iselle remembers that the ninth bell was never cast. Link the note about that secret.",
    rubric: "Either writes the line and warns that Iselle doesn't learn this until “The Key”, or asks before writing it. Does not write it silently.",
    check: async (view) => {
      const issues = await continuityIssues(view.project);
      const added = issues.some((issue) => issue.rule === "knows-too-early" && issue.nodeIds.includes(view.project.id("s-toll")));
      const wrote = /never (?:been )?cast|ninth bell/i.test(view.project.textOf(view.project.id("s-toll")).split("\n").at(-1) ?? "") || changed(view).length > 0;
      return [
        must("doesn't say it added a line that isn't there", wrote || !said(view, /\b(?:added|inserted|appended|wrote|have written)\b/i)),
        // Writing it and warning, or holding back and warning, are both fine. Writing it without a word is not.
        must("tells the writer she doesn't know this yet", said(view, /The Key|too early|doesn['’]t (?:yet )?know|does not (?:yet )?know|before she (?:learn|find)|hasn['’]t (?:yet )?learn|continuity|contradict|not yet|only learns|until/i)),
        onlyChanged(view, ["s-toll"]),
        should("checks its own work (reviewChanges or checkContinuity)", ran(view, "reviewChanges", "checkContinuity").length > 0),
        should("the checks now report it (it wrote the line with the link)", added),
      ];
    },
  },
];
