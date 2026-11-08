import { scriptFormats, type ScriptFormat } from "@plotra/db/schema";
import { quotedTextRules, quoteText } from "./untrusted";
import { inlineActions, inlineTones, type InlineAction, type InlineTone } from "./types";

// The inline editor actions (plan.md 2.11 "Inline in the editor"): continue
// from the cursor, and on a selection rewrite, shorten, expand or change tone.
// One short call on the person's "fast" model. Pure: what the request says and
// the prompt it becomes, so both can be tested without a model.

export const MAX_SELECTION = 12_000;
export const MAX_BEFORE = 6_000;
export const MAX_AFTER = 1_500;

export type InlineRequest = {
  projectId: string;
  nodeId: string;
  action: InlineAction;
  tone?: InlineTone;
  /** The selected text, for every action but `continue`. */
  selection: string;
  /** The text leading up to the cursor or the selection: the voice to match. */
  before: string;
  /** What comes right after, so a continuation can lead into it. */
  after: string;
  format: ScriptFormat;
};

const text = (value: unknown, max: number, keep: "start" | "end" = "start") => {
  const s = typeof value === "string" ? value : "";
  return s.length <= max ? s : keep === "end" ? s.slice(-max) : s.slice(0, max);
};

/** Reads and bounds what the browser sent. Throws a message for the user when it can't be used. */
export function parseInlineRequest(body: unknown): InlineRequest {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const action = b.action as InlineAction;
  if (!inlineActions.includes(action)) throw new Error("Unknown action.");
  if (typeof b.projectId !== "string" || typeof b.nodeId !== "string") throw new Error("Open a note first.");
  const selection = typeof b.selection === "string" ? b.selection : "";
  if (action !== "continue") {
    if (!selection.trim()) throw new Error("Select some text first.");
    if (selection.length > MAX_SELECTION) throw new Error("That's too much text at once. Select a shorter passage.");
  }
  const tone = b.tone as InlineTone;
  if (action === "tone" && !inlineTones.includes(tone)) throw new Error("Choose a tone.");
  return {
    projectId: b.projectId,
    nodeId: b.nodeId,
    action,
    tone: action === "tone" ? tone : undefined,
    selection: action === "continue" ? "" : selection,
    // The end of what came before is what matters for voice; the start of what follows, for where to land.
    before: text(b.before, MAX_BEFORE, "end"),
    after: text(b.after, MAX_AFTER),
    format: scriptFormats.includes(b.format as ScriptFormat) ? (b.format as ScriptFormat) : "prose",
  };
}

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

const formatNotes: Record<ScriptFormat, string> = {
  prose: "This is prose.",
  screenplay: "This is a screenplay: write action lines and dialogue as screenplay text, never prose narration.",
  stageplay: "This is a stage play: write stage directions and dialogue, never prose narration.",
  comic: "This is a comic script: write panel descriptions, captions and dialogue.",
  audio: "This is an audio script: everything must be heard, so write dialogue and sound, not description.",
};

/** What the model is asked to do, in one instruction. */
function task(request: InlineRequest): string {
  const n = words(request.selection);
  switch (request.action) {
    case "continue":
      return "Continue the text from exactly where it stops. Write what comes next: one to three paragraphs, about 80 to 200 words. Don't repeat or summarise what is already there, and don't wrap the scene up unless it is clearly ending.";
    case "rewrite":
      return `Rewrite the selected passage so it reads better: clearer, tighter, more alive. Keep what happens, who says what, the point of view and the tense. Stay close to the same length (about ${n} words).`;
    case "shorten":
      return `Shorten the selected passage to about half its length (around ${Math.max(5, Math.round(n / 2))} words). Keep what happens and what matters; cut what doesn't earn its place.`;
    case "expand":
      return `Expand the selected passage to about twice its length (around ${n * 2} words): more of what is already there (sensation, movement, what goes unsaid). Don't add new events, characters or facts.`;
    case "tone":
      return `Rewrite the selected passage in a ${request.tone} tone. Keep what happens, who says what, the point of view and the tense, and stay close to the same length (about ${n} words).`;
  }
}

/** A cap on the answer's length, so a confused model can't run on at the person's expense. */
export function inlineOutputTokens(request: InlineRequest): number {
  if (request.action === "continue") return 700;
  const factor = request.action === "expand" ? 4 : request.action === "shorten" ? 1.5 : 2.5;
  return Math.min(6000, Math.max(300, Math.round(words(request.selection) * factor) + 200));
}

export function inlinePrompt(request: InlineRequest, options: { title: string; brief: string | null; boundary: string }): { instructions: string; prompt: string } {
  const instructions = [
    "You are a writing assistant inside a manuscript editor. Your answer is inserted into the manuscript as it is.",
    "Answer with the text only. No preamble, no explanation, no quotation marks around it, no headings, no notes afterwards.",
    "Match the voice, tense, point of view and vocabulary of the surrounding text. Separate paragraphs with a blank line. Use *asterisks* for italics only where the manuscript itself would italicise.",
    formatNotes[request.format],
    quotedTextRules(options.boundary),
    options.brief ? `The writer's standing notes on this project (follow them):\n${quoteText(options.brief, "story brief", options.boundary)}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const parts = [
    `The note is called "${options.title}".`,
    request.before.trim() ? `What comes before:\n${quoteText(request.before, "before", options.boundary)}` : null,
    request.selection ? `The selected passage:\n${quoteText(request.selection, "selection", options.boundary)}` : null,
    request.after.trim() ? `What comes after (don't rewrite it; lead into it):\n${quoteText(request.after, "after", options.boundary)}` : null,
    task(request),
  ];
  return { instructions, prompt: parts.filter(Boolean).join("\n\n") };
}
