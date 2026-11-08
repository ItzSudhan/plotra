import { describe, expect, test } from "bun:test";
import type { Question, WorkflowStage } from "@plotra/db/schema";
import {
  allApproved,
  checkStageChange,
  cleanAnswers,
  cleanQuestions,
  compareNote,
  groupReactions,
  hasTag,
  MAX_CHOICES,
  MAX_QUESTIONS,
  nextApprovalStage,
  requiredReviewers,
  summarizeResponses,
  wordDelta,
  type ReviewRule,
} from "@/lib/editorial";
import { cleanStages, defaultStages, stageOf, stagePresets, stagesOf } from "@/lib/stages";

// The review and approval rules (lib/editorial.ts) and the workflow check
// (lib/stages.ts). All pure, so no database.

// Draft → In review → Approved (approval) → Locked (approval, locked).
const review = stagePresets.find((p) => p.id === "review")!.stages;

describe("hasTag", () => {
  test("matches the tag and tags nested under it, not longer names", () => {
    expect(hasTag(["canon"], "canon")).toBe(true);
    expect(hasTag(["canon/book-2"], "canon")).toBe(true);
    expect(hasTag(["canonical"], "canon")).toBe(false);
    expect(hasTag([], "canon")).toBe(false);
  });
});

describe("requiredReviewers", () => {
  const rule = (id: string, nodeId: string | null, tag: string | null, reviewerId: string): ReviewRule => ({ id, nodeId, tag, reviewerId });
  const note = { id: "n1", tags: ["canon/book-2"], contentTags: ["magic"] };

  test("a folder rule covers notes inside it", () => {
    expect(requiredReviewers(note, ["f1"], [rule("r1", "f1", null, "ana")])).toEqual(["ana"]);
    expect(requiredReviewers(note, ["f2"], [rule("r1", "f1", null, "ana")])).toEqual([]);
    expect(requiredReviewers(note, [], [rule("r1", "n1", null, "ana")])).toEqual(["ana"]);
  });

  test("a tag rule matches tags on the note or in its content", () => {
    expect(requiredReviewers(note, [], [rule("r1", null, "canon", "ana")])).toEqual(["ana"]);
    expect(requiredReviewers(note, [], [rule("r1", null, "magic", "ana")])).toEqual(["ana"]);
    expect(requiredReviewers(note, [], [rule("r1", null, "dragons", "ana")])).toEqual([]);
  });

  test("a rule with a folder and a tag needs both", () => {
    const rules = [rule("r1", "f1", "canon", "ana")];
    expect(requiredReviewers(note, ["f1"], rules)).toEqual(["ana"]);
    expect(requiredReviewers(note, ["f2"], rules)).toEqual([]);
    expect(requiredReviewers({ ...note, tags: [], contentTags: [] }, ["f1"], rules)).toEqual([]);
  });

  test("a rule with neither covers the whole project", () => {
    expect(requiredReviewers(note, [], [rule("r1", null, null, "ana")])).toEqual(["ana"]);
  });

  test("a reviewer named by two rules appears once", () => {
    const rules = [rule("r1", "f1", null, "ana"), rule("r2", null, "canon", "ana"), rule("r3", null, null, "ben")];
    expect(requiredReviewers(note, ["f1"], rules)).toEqual(["ana", "ben"]);
  });
});

describe("approvals", () => {
  test("allApproved waits for every required reviewer", () => {
    expect(allApproved([], [])).toBe(true);
    expect(allApproved(["ana", "ben"], [{ reviewerId: "ana", status: "approved" }])).toBe(false);
    expect(
      allApproved(
        ["ana", "ben"],
        [
          { reviewerId: "ana", status: "approved" },
          { reviewerId: "ben", status: "approved" },
        ],
      ),
    ).toBe(true);
  });

  test("nextApprovalStage is the first approval stage after the current one", () => {
    expect(nextApprovalStage(review, "draft")?.id).toBe("approved");
    expect(nextApprovalStage(review, "approved")?.id).toBe("locked");
    expect(nextApprovalStage(review, "locked")?.id).toBe("approved");
    expect(nextApprovalStage(defaultStages, "draft")).toBeUndefined();
  });
});

describe("checkStageChange", () => {
  const base = { stages: review, required: ["ana"], approvals: [], userId: "cleo", canManage: false };

  test("staying put is fine", () => {
    expect(checkStageChange({ ...base, from: "locked", to: "locked" })).toEqual({ ok: true, clearApprovals: false });
  });

  test("moving out of a locked stage needs an approver", () => {
    const out = checkStageChange({ ...base, from: "locked", to: "draft" });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("“Locked” is locked");
    expect(checkStageChange({ ...base, from: "locked", to: "draft", userId: "ana" }).ok).toBe(true);
    expect(checkStageChange({ ...base, from: "locked", to: "draft", canManage: true }).ok).toBe(true);
  });

  test("moving into an approval stage needs every required reviewer, and counts who's waiting", () => {
    const one = checkStageChange({ ...base, from: "in-review", to: "approved" });
    expect(one).toEqual({ ok: false, reason: "“Approved” needs approval: 1 required reviewer hasn't approved yet. Request a review first." });
    const two = checkStageChange({ ...base, required: ["ana", "ben", "dev"], approvals: [{ reviewerId: "ana", status: "approved" }], from: "in-review", to: "approved" });
    expect(two.ok).toBe(false);
    if (!two.ok) expect(two.reason).toContain("2 required reviewers haven't approved yet");
    expect(checkStageChange({ ...base, approvals: [{ reviewerId: "ana", status: "approved" }], from: "in-review", to: "approved" })).toEqual({ ok: true, clearApprovals: false });
  });

  test("someone who can manage the note may move it in without approvals", () => {
    expect(checkStageChange({ ...base, canManage: true, from: "in-review", to: "approved" })).toEqual({ ok: true, clearApprovals: false });
  });

  test("going back to an earlier stage clears approvals", () => {
    expect(checkStageChange({ ...base, from: "approved", to: "draft" })).toEqual({ ok: true, clearApprovals: true });
    expect(checkStageChange({ ...base, from: "draft", to: "in-review" })).toEqual({ ok: true, clearApprovals: false });
  });
});

describe("groupReactions", () => {
  test("groups by passage and counts each person once", () => {
    const anchor = { start: "a", end: "b" };
    const groups = groupReactions([
      { id: "t1", anchor, quote: "Hello", reaction: "❤️", createdById: "ana" },
      { id: "t2", anchor, quote: "Hello", reaction: "❤️", createdById: "ben" },
      { id: "t3", anchor, quote: "Hello", reaction: "😂", createdById: "ana" },
      { id: "t4", anchor: null, quote: "Elsewhere", reaction: "🤔", createdById: "ana" },
      { id: "t5", anchor, quote: "Hello", reaction: null, createdById: "ana" },
    ]);
    expect(groups.map((g) => g.key)).toEqual(["a:b", "quote:Elsewhere"]);
    expect(groups[0].threadId).toBe("t1");
    expect(groups[0].counts).toEqual([
      { emoji: "❤️", userIds: ["ana", "ben"], threadIds: ["t1", "t2"] },
      { emoji: "😂", userIds: ["ana"], threadIds: ["t3"] },
    ]);
  });
});

describe("cleanQuestions", () => {
  test("throws for no questions", () => {
    expect(() => cleanQuestions([])).toThrow("Add at least one question.");
    expect(() => cleanQuestions(null)).toThrow("Add at least one question.");
  });

  test("throws for duplicate ids and empty prompts", () => {
    expect(() =>
      cleanQuestions([
        { id: "q1", prompt: "One", type: "text" },
        { id: "q1", prompt: "Two", type: "text" },
      ]),
    ).toThrow("Every question needs its own id.");
    expect(() => cleanQuestions([{ id: "q1", prompt: "   ", type: "text" }])).toThrow("Write every question");
  });

  test("throws for a choice question with fewer than two distinct choices", () => {
    expect(() => cleanQuestions([{ id: "q1", prompt: "Pick", type: "choice", choices: ["Yes", " Yes ", ""] }])).toThrow("“Pick” needs at least two choices.");
  });

  test("throws for too many questions or an unknown type", () => {
    const many = Array.from({ length: MAX_QUESTIONS + 1 }, (_, i) => ({ id: `q${i}`, prompt: "Q", type: "text" }));
    expect(() => cleanQuestions(many)).toThrow(`up to ${MAX_QUESTIONS} questions`);
    expect(() => cleanQuestions([{ id: "q1", prompt: "Q", type: "essay" }])).toThrow("Unknown kind of question.");
  });

  test("trims and caps", () => {
    const choices = Array.from({ length: MAX_CHOICES + 3 }, (_, i) => ` Choice ${i} `);
    const [q, r] = cleanQuestions([
      { id: "q1", prompt: `  ${"x".repeat(400)}  `, type: "choice", choices, extra: "dropped" },
      { id: "q2", prompt: " Rate it ", type: "rating" },
    ]);
    expect(q.prompt).toHaveLength(300);
    expect(q.choices).toHaveLength(MAX_CHOICES);
    expect(q.choices?.[0]).toBe("Choice 0");
    expect(q).not.toHaveProperty("extra");
    expect(r).toEqual({ id: "q2", prompt: "Rate it", type: "rating" });
  });
});

describe("cleanAnswers", () => {
  const questions: Question[] = [
    { id: "r", prompt: "Rate", type: "rating" },
    { id: "c", prompt: "Pick", type: "choice", choices: ["Yes", "No"] },
    { id: "t", prompt: "Say", type: "text" },
  ];

  test("keeps answers that fit their question", () => {
    expect(cleanAnswers(questions, { r: 4, c: "No", t: "  Loved it  ", other: "x" })).toEqual({ r: 4, c: "No", t: "Loved it" });
  });

  test("drops ratings out of range or not whole, and unknown choices", () => {
    expect(cleanAnswers(questions, { r: 0, c: "Maybe" })).toEqual({});
    expect(cleanAnswers(questions, { r: 6 })).toEqual({});
    expect(cleanAnswers(questions, { r: 2.5 })).toEqual({});
  });

  test("accepts ratings only as numbers", () => {
    expect(cleanAnswers(questions, { r: true })).toEqual({});
    expect(cleanAnswers(questions, { r: "3" })).toEqual({});
  });

  test("accepts written answers only as strings", () => {
    expect(cleanAnswers(questions, { t: { a: 1 } })).toEqual({});
    expect(cleanAnswers(questions, { t: 42 })).toEqual({});
    expect(cleanAnswers(questions, { t: "   " })).toEqual({});
  });

  test("anything that isn't an object gives no answers", () => {
    expect(cleanAnswers(questions, "nope")).toEqual({});
    expect(cleanAnswers(questions, null)).toEqual({});
  });
});

describe("summarizeResponses", () => {
  test("averages ratings and tallies choices in the question's order", () => {
    const questions: Question[] = [
      { id: "r", prompt: "Rate", type: "rating" },
      { id: "c", prompt: "Pick", type: "choice", choices: ["Yes", "No", "Maybe"] },
    ];
    const [rating, choice] = summarizeResponses(questions, [
      { userId: "ana", answers: { r: 4, c: "No" } },
      { userId: "ben", answers: { r: 5, c: "Yes" } },
      { userId: "cleo", answers: { c: "No" } },
    ]);
    expect(rating.average).toBe(4.5);
    expect(rating.answers.map((a) => a.userId)).toEqual(["ana", "ben"]);
    expect(rating.tally).toEqual([]);
    expect(choice.average).toBeNull();
    expect(choice.tally).toEqual([
      { choice: "Yes", count: 1 },
      { choice: "No", count: 2 },
      { choice: "Maybe", count: 0 },
    ]);
  });

  test("no ratings means no average", () => {
    const [q] = summarizeResponses([{ id: "r", prompt: "Rate", type: "rating" }], []);
    expect(q.average).toBeNull();
  });
});

describe("compareNote", () => {
  test("added, removed, changed and unchanged", () => {
    expect(compareNote(null, { text: "one two" })).toEqual({ kind: "added", wordsBefore: 0, wordsAfter: 2 });
    expect(compareNote({ text: "one two" }, null)).toEqual({ kind: "removed", wordsBefore: 2, wordsAfter: 0 });
    expect(compareNote({ text: "one two" }, { text: "one two", trashed: true })).toEqual({ kind: "removed", wordsBefore: 2, wordsAfter: 0 });
    expect(compareNote({ text: "one two" }, { text: "one three" })).toEqual({ kind: "changed", wordsBefore: 2, wordsAfter: 2 });
    expect(compareNote({ text: "one two" }, { text: "one two" }).kind).toBe("unchanged");
  });

  test("whitespace-only differences are unchanged", () => {
    expect(compareNote({ text: "one two" }, { text: "  one\n\n  two " }).kind).toBe("unchanged");
  });

  test("a note added then trashed counts as unchanged", () => {
    expect(compareNote(null, { text: "draft", trashed: true })).toEqual({ kind: "unchanged", wordsBefore: 0, wordsAfter: 0 });
    expect(compareNote(null, null).kind).toBe("unchanged");
  });
});

describe("wordDelta", () => {
  test("says how many words moved", () => {
    expect(wordDelta({ wordsBefore: 10, wordsAfter: 11 })).toBe("+1 word");
    expect(wordDelta({ wordsBefore: 1000, wordsAfter: 0 })).toBe("−1,000 words");
    expect(wordDelta({ wordsBefore: 5, wordsAfter: 5 })).toBe("reworded");
  });
});

describe("stages", () => {
  test("stagesOf falls back to the default workflow", () => {
    expect(stagesOf(null)).toBe(defaultStages);
    expect(stagesOf({ stages: [] })).toBe(defaultStages);
    expect(stagesOf({ stages: review })).toBe(review);
  });

  test("stageOf shows an unknown id under its own name", () => {
    expect(stageOf(review, "locked").locked).toBe(true);
    expect(stageOf(review, "gone")).toEqual({ id: "gone", label: "gone", color: "#9a938a" });
  });
});

describe("cleanStages", () => {
  const stage = (id: string, label = id): Partial<WorkflowStage> => ({ id, label, color: "#123456" });

  test("throws for 0 or 13 stages", () => {
    expect(() => cleanStages([])).toThrow("between 1 and 12 stages");
    expect(() => cleanStages(Array.from({ length: 13 }, (_, i) => stage(`s${i}`)))).toThrow("between 1 and 12 stages");
    expect(cleanStages(Array.from({ length: 12 }, (_, i) => stage(`s${i}`)))).toHaveLength(12);
  });

  test("throws for a duplicate or upper-case id", () => {
    expect(() => cleanStages([stage("draft"), stage("draft")])).toThrow("Stage ids must be unique");
    expect(() => cleanStages([stage("Draft")])).toThrow("Stage ids must be unique");
  });

  test("throws for an empty label", () => {
    expect(() => cleanStages([stage("draft", "  ")])).toThrow("Name every stage.");
  });

  test("a bad colour falls back to grey", () => {
    expect(cleanStages([{ id: "draft", label: "Draft", color: "red" }])[0].color).toBe("#9a938a");
  });

  test("keeps the review preset as it is", () => {
    expect(cleanStages(review)).toEqual(review);
  });
});
