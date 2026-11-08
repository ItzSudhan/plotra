import type { Answer, ApprovalStatus, Question, WorkflowStage } from "@plotra/db/schema";
import { countWords } from "./doc-index";
import { stageOf } from "./stages";
import { count } from "./plural";

// Review, editorial and approval (plan.md 2.8): the rules, with no I/O, so the
// server guard (lib/editorial-guard.ts), the server actions and the client all
// decide the same way and the rules can be tested on their own.

// ---- Required reviewers --------------------------------------------------------------

/**
 * A required reviewer. `nodeId` covers a note and everything inside it, `tag`
 * everything tagged with it (or a tag nested under it); with both, a note has
 * to match both; with neither, the rule covers the whole project.
 */
export type ReviewRule = { id: string; nodeId: string | null; tag: string | null; reviewerId: string };

/** Whether `tags` has `tag` or a tag nested under it (`canon` matches `canon/book-2`). */
export const hasTag = (tags: readonly string[], tag: string) => tags.some((t) => t === tag || t.startsWith(`${tag}/`));

type Tagged = { id: string; tags: readonly string[]; contentTags: readonly string[] };

/**
 * Everyone who must approve a note before it enters an approval stage.
 * `ancestorIds` are the folders above it, in any order.
 */
export function requiredReviewers(node: Tagged, ancestorIds: Iterable<string>, rules: readonly ReviewRule[]): string[] {
  const inside = new Set(ancestorIds).add(node.id);
  const reviewers = new Set<string>();
  for (const rule of rules) {
    if (rule.nodeId && !inside.has(rule.nodeId)) continue;
    if (rule.tag && !hasTag(node.tags, rule.tag) && !hasTag(node.contentTags, rule.tag)) continue;
    reviewers.add(rule.reviewerId);
  }
  return [...reviewers];
}

// ---- Locks and approval gates ---------------------------------------------------------

export type ApprovalState = { reviewerId: string; status: ApprovalStatus };

/** Whether any stage of the workflow locks content or needs approval. Most don't, and then nothing is checked. */
export const hasGates = (stages: readonly WorkflowStage[]) => stages.some((s) => s.locked || s.approval);

export const isLocked = (stages: WorkflowStage[], status: string) => stageOf(stages, status).locked === true;

/** Approvers of a note: its required reviewers, and anyone who can manage it. */
export const isApprover = (required: readonly string[], userId: string, canManage: boolean) => canManage || required.includes(userId);

/** Whether every required reviewer has approved. With no required reviewers there's nothing to wait for. */
export const allApproved = (required: readonly string[], approvals: readonly ApprovalState[]) =>
  required.every((id) => approvals.some((a) => a.reviewerId === id && a.status === "approved"));

/** The first stage after `status` that needs approval: where "Request review" aims by default. */
export function nextApprovalStage(stages: WorkflowStage[], status: string): WorkflowStage | undefined {
  const at = stages.findIndex((s) => s.id === status);
  return stages.slice(at + 1).find((s) => s.approval) ?? stages.find((s) => s.approval && s.id !== status);
}

export type StageChange = { ok: true; clearApprovals: boolean } | { ok: false; reason: string };

/**
 * Whether someone may move a note from one stage to another.
 *
 * - Out of a locked stage: approvers only.
 * - Into an approval stage: every required reviewer has approved, or the
 *   person moving it can manage the note (the approver of last resort).
 * - Leaving the approval stages for an earlier one drops the approvals, so a
 *   note that goes back to draft has to be approved again.
 */
export function checkStageChange(input: {
  stages: WorkflowStage[];
  from: string;
  to: string;
  required: readonly string[];
  approvals: readonly ApprovalState[];
  userId: string;
  canManage: boolean;
}): StageChange {
  const { stages, required, approvals, userId, canManage } = input;
  if (input.from === input.to) return { ok: true, clearApprovals: false };
  const from = stageOf(stages, input.from);
  const to = stageOf(stages, input.to);
  if (from.locked && !isApprover(required, userId, canManage)) {
    return { ok: false, reason: `“${from.label}” is locked. Only an approver can move this out of it.` };
  }
  if (to.approval && !canManage && !allApproved(required, approvals)) {
    const waiting = required.filter((id) => !approvals.some((a) => a.reviewerId === id && a.status === "approved")).length;
    return {
      ok: false,
      reason: `“${to.label}” needs approval: ${waiting} required reviewer${waiting === 1 ? " hasn't" : "s haven't"} approved yet. Request a review first.`,
    };
  }
  return { ok: true, clearApprovals: from.approval === true && !to.approval };
}

// ---- Reactions --------------------------------------------------------------------------

/** The one-click reactions a reader can leave on a passage. */
export const reactionEmojis = ["❤️", "😂", "😮", "😢", "🤔", "😴"] as const;

export const reactionLabels: Record<string, string> = {
  "❤️": "Loved it",
  "😂": "Funny",
  "😮": "Surprised",
  "😢": "Sad",
  "🤔": "Confused",
  "😴": "Bored",
};

export const isReaction = (value: unknown): value is (typeof reactionEmojis)[number] =>
  typeof value === "string" && (reactionEmojis as readonly string[]).includes(value);

type ReactionThread = {
  id: string;
  anchor: { start: string; end: string } | null;
  quote: string | null;
  reaction: string | null;
  createdById: string | null;
};

export type ReactionGroup = {
  /** The passage: its anchor, or the quote when there's no anchor. */
  key: string;
  quote: string | null;
  /** Any thread of the group, to scroll the editor to the passage. */
  threadId: string;
  counts: Array<{ emoji: string; userIds: string[]; threadIds: string[] }>;
};

/** Reactions grouped by passage, with a count and the people behind each emoji. */
export function groupReactions(threads: readonly ReactionThread[]): ReactionGroup[] {
  const groups = new Map<string, ReactionGroup>();
  for (const t of threads) {
    if (!t.reaction) continue;
    const key = t.anchor ? `${t.anchor.start}:${t.anchor.end}` : `quote:${t.quote ?? ""}`;
    let group = groups.get(key);
    if (!group) groups.set(key, (group = { key, quote: t.quote, threadId: t.id, counts: [] }));
    let count = group.counts.find((c) => c.emoji === t.reaction);
    if (!count) group.counts.push((count = { emoji: t.reaction, userIds: [], threadIds: [] }));
    count.threadIds.push(t.id);
    if (t.createdById && !count.userIds.includes(t.createdById)) count.userIds.push(t.createdById);
  }
  return [...groups.values()];
}

// ---- Questionnaires ----------------------------------------------------------------------

export const MAX_QUESTIONS = 30;
export const MAX_CHOICES = 12;
const MAX_PROMPT = 300;
const MAX_ANSWER = 4000;

export const questionTypeMeta: Record<Question["type"], { label: string }> = {
  text: { label: "Written answer" },
  rating: { label: "Rating (1–5)" },
  choice: { label: "Multiple choice" },
};

/** Validates questions coming from the client. Throws on anything malformed. */
export function cleanQuestions(input: unknown): Question[] {
  if (!Array.isArray(input) || input.length === 0) throw new Error("Add at least one question.");
  if (input.length > MAX_QUESTIONS) throw new Error(`A questionnaire can have up to ${MAX_QUESTIONS} questions.`);
  const seen = new Set<string>();
  return input.map((raw) => {
    const q = (raw ?? {}) as Partial<Question>;
    const id = String(q.id ?? "").slice(0, 64);
    const prompt = String(q.prompt ?? "").trim().slice(0, MAX_PROMPT);
    if (!id || seen.has(id)) throw new Error("Every question needs its own id.");
    if (!prompt) throw new Error("Write every question, or remove the empty ones.");
    seen.add(id);
    if (q.type === "choice") {
      const choices = [...new Set((Array.isArray(q.choices) ? q.choices : []).map((c) => String(c).trim().slice(0, 120)).filter(Boolean))].slice(0, MAX_CHOICES);
      if (choices.length < 2) throw new Error(`“${prompt}” needs at least two choices.`);
      return { id, prompt, type: "choice", choices };
    }
    if (q.type !== "text" && q.type !== "rating") throw new Error("Unknown kind of question.");
    return { id, prompt, type: q.type };
  });
}

/** Keeps the answers that fit their question; anything else is dropped. */
export function cleanAnswers(questions: readonly Question[], input: unknown): Record<string, Answer> {
  const given = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const answers: Record<string, Answer> = {};
  for (const q of questions) {
    const value = given[q.id];
    if (value === null || value === undefined || value === "") continue;
    if (q.type === "rating") {
      // The form sends numbers; anything else (true, "3") is dropped.
      if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5) answers[q.id] = value;
    } else if (q.type === "choice") {
      if (typeof value === "string" && q.choices?.includes(value)) answers[q.id] = value;
    } else if (typeof value === "string") {
      const text = value.trim().slice(0, MAX_ANSWER);
      if (text) answers[q.id] = text;
    }
  }
  return answers;
}

export type QuestionSummary = {
  question: Question;
  /** Everyone who answered this question, in the order they responded. */
  answers: Array<{ userId: string; value: string | number }>;
  /** Ratings only. */
  average: number | null;
  /** Choices only, in the question's order. */
  tally: Array<{ choice: string; count: number }>;
};

/** Per question: the answers, the average rating and the tally of choices. */
export function summarizeResponses(
  questions: readonly Question[],
  responses: ReadonlyArray<{ userId: string; answers: Record<string, Answer> }>,
): QuestionSummary[] {
  return questions.map((question) => {
    const answers = responses.flatMap((r) => {
      const value = r.answers[question.id];
      return value === null || value === undefined || value === "" ? [] : [{ userId: r.userId, value }];
    });
    const ratings = question.type === "rating" ? answers.map((a) => Number(a.value)).filter(Number.isFinite) : [];
    return {
      question,
      answers,
      average: ratings.length ? ratings.reduce((sum, n) => sum + n, 0) / ratings.length : null,
      tally: question.type === "choice" ? (question.choices ?? []).map((choice) => ({ choice, count: answers.filter((a) => a.value === choice).length })) : [],
    };
  });
}

// ---- Changelog per release ------------------------------------------------------------------

export type ChangeKind = "added" | "changed" | "removed" | "unchanged";

/** A note's text at one point: when a release was cut, at a later release, or now. */
export type NoteState = { text: string; trashed?: boolean };

export type NoteChange = { kind: ChangeKind; wordsBefore: number; wordsAfter: number };

const squash = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * What happened to one note since a release was cut. `before` is null when the
 * release has no snapshot of it (it was written since); `after` is null when
 * it no longer exists. A note written and thrown away in between never
 * mattered, so it counts as unchanged.
 */
export function compareNote(before: NoteState | null, after: NoteState | null): NoteChange {
  const gone = !after || after.trashed === true;
  const wordsBefore = before ? countWords(before.text) : 0;
  const wordsAfter = gone ? 0 : countWords(after.text);
  let kind: ChangeKind;
  if (!before) kind = gone ? "unchanged" : "added";
  else if (gone) kind = "removed";
  else kind = squash(before.text) !== squash(after.text) ? "changed" : "unchanged";
  return { kind, wordsBefore, wordsAfter };
}

/** "+120 words", "−40 words", or "reworded" when the count didn't move. */
export function wordDelta(change: Pick<NoteChange, "wordsBefore" | "wordsAfter">): string {
  const delta = change.wordsAfter - change.wordsBefore;
  if (delta === 0) return "reworded";
  return `${delta > 0 ? "+" : "−"}${count(Math.abs(delta), "word")}`;
}
