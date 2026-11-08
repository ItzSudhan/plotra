import type { NodeKind } from "@plotra/db/schema";

// What an empty note says before anything is typed (onboarding-plan.md 3): a
// way in, in place of a bare cursor, and the two keys worth knowing. A note
// keeps the same prompt each time it is opened, so it doesn't shift under the
// writer; different notes get different ones.

const scene = [
  "Start in the middle: someone is already doing something.",
  "Open on a line of dialogue.",
  "What does your character notice first?",
  "Something has just gone wrong. What?",
  "Who walks in, and what do they want?",
  "Begin with a sound, a smell or the weather.",
];

const prompts: Partial<Record<NodeKind, string[]>> = {
  scene,
  chapter: ["What changes by the end of this chapter?", ...scene.slice(0, 3)],
  character: ["Who are they, and what do they want?", "What would they never say out loud?", "How do they enter a room?"],
  location: ["What does someone notice first when they arrive?", "Who is here, and who is not welcome?", "What happened here that people still talk about?"],
  research: ["What does this source say, and where will you use it?"],
  entity: ["What is it, and why does it matter to the story?"],
};

const keys = "Type [[ to link a note, or / for blocks.";

/** The placeholder of an empty note of this kind. */
export function starterPrompt(kind: NodeKind, nodeId: string): string {
  const options = prompts[kind];
  if (!options) return `Start writing. ${keys}`;
  let hash = 0;
  for (const char of nodeId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `${options[hash % options.length]} ${keys}`;
}
