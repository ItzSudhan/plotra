// How the panel describes a tool step (plan.md 2.11 "a visible log of every
// step"): one compact line per call, "Searched for …", "Read Chapter 3".
// Shared with the browser, so nothing here imports server code.
//
// Every tool registered in lib/agent/tools needs a line here. A tool without
// one still shows, under its own name.

type Input = Record<string, unknown>;

export type StepLabel = {
  /** While the tool is running: "Reading". */
  doing: string;
  /** Once it's done: "Read". */
  done: string;
  /** What it acted on, taken from the input: a search query, or the note whose id is given. */
  subject?: (input: Input) => { text?: string; nodeId?: string } | null;
};

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined);
const note = (key: string) => (input: Input) => (text(input[key]) ? { nodeId: text(input[key]) } : null);

export const toolLabels: Record<string, StepLabel> = {
  binderOutline: { doing: "Looking at the binder", done: "Looked at the binder", subject: note("under") },
  searchProject: { doing: "Searching for", done: "Searched for", subject: (input) => (text(input.query) ? { text: `“${text(input.query)}”` } : null) },
  readNote: { doing: "Reading", done: "Read", subject: note("nodeId") },
  readComments: { doing: "Reading the comments on", done: "Read the comments on", subject: note("nodeId") },
  getNote: { doing: "Looking up", done: "Looked up", subject: note("nodeId") },
  listEntities: {
    doing: "Listing",
    done: "Listed",
    subject: (input) => ({ text: text(input.typeName) ?? (text(input.kind) ? `${text(input.kind)} notes` : "the kinds of notes") }),
  },
  getLinks: { doing: "Following links of", done: "Followed links of", subject: note("nodeId") },
  getTimeline: { doing: "Reading the timeline", done: "Read the timeline", subject: note("timelineId") },
  getRelationships: { doing: "Reading relationships", done: "Read relationships", subject: note("nodeId") },
  listReleases: { doing: "Listing releases", done: "Listed releases" },
  getKnowledge: { doing: "Checking who knows what", done: "Checked who knows what", subject: (input) => note("characterId")(input) ?? note("factId")(input) },
  getSetups: { doing: "Listing setups and payoffs", done: "Listed setups and payoffs" },
  readLinkedWorld: { doing: "Reading the shared world", done: "Read the shared world", subject: (input) => (text(input.query) ? { text: `“${text(input.query)}”` } : null) },
  checkContinuity: { doing: "Running the continuity checks", done: "Ran the continuity checks", subject: note("nodeId") },
  listPlotThreads: { doing: "Listing plot threads", done: "Listed plot threads" },
  editNote: { doing: "Editing", done: "Edited", subject: note("nodeId") },
  writeNote: { doing: "Writing", done: "Wrote", subject: note("nodeId") },
  createNote: { doing: "Creating", done: "Created", subject: (input) => (text(input.title) ? { text: `“${text(input.title)}”` } : null) },
  commentOnNote: { doing: "Commenting on", done: "Commented on", subject: note("nodeId") },
  updateNote: { doing: "Updating", done: "Updated", subject: note("nodeId") },
  setProperties: { doing: "Setting properties of", done: "Set properties of", subject: note("nodeId") },
  moveNote: { doing: "Moving", done: "Moved", subject: note("nodeId") },
  trashNote: { doing: "Moving to the trash:", done: "Moved to the trash:", subject: note("nodeId") },
  setCanon: {
    doing: "Changing the canon status of",
    done: "Changed the canon status of",
    subject: note("nodeId"),
  },
  createPlotThread: { doing: "Adding the plot thread", done: "Added the plot thread", subject: (input) => (text(input.name) ? { text: `“${text(input.name)}”` } : null) },
  setPlotGridCell: { doing: "Filling the plot grid for", done: "Filled the plot grid for", subject: note("sceneId") },
  setRelationship: { doing: "Setting a relationship of", done: "Set a relationship of", subject: note("fromId") },
  removeRelationship: { doing: "Removing a relationship", done: "Removed a relationship" },
  setTimelineEvent: { doing: "Changing the timeline", done: "Changed the timeline", subject: note("timelineId") },
  addCanvasCards: { doing: "Adding cards to", done: "Added cards to", subject: note("canvasId") },
  recordKnowledge: { doing: "Recording what is known by", done: "Recorded what is known by", subject: note("characterId") },
  recordSetup: { doing: "Recording the setup", done: "Recorded the setup", subject: (input) => (text(input.title) ? { text: `“${text(input.title)}”` } : null) },
  reviewChanges: { doing: "Checking what it changed", done: "Checked what it changed" },
  planTask: { doing: "Planning the job", done: "Planned the job", subject: (input) => (text(input.title) ? { text: `“${text(input.title)}”` } : null) },
  characterSheet: { doing: "Building the continuity sheet of", done: "Built the continuity sheet of", subject: note("characterId") },
};

/**
 * What a write tool is about to do, in the words of a question: shown when the
 * agent has to ask first (lib/agent/approval.ts). The step label covers most;
 * these read better as "Allow … ?".
 */
export const approvalVerb: Record<string, string> = {
  createNote: "Create",
  updateNote: "Update",
  setProperties: "Set properties of",
  moveNote: "Move",
  trashNote: "Move to the trash:",
  setCanon: "Change the canon status of",
  createPlotThread: "Add the plot thread",
  setPlotGridCell: "Fill the plot grid for",
  setRelationship: "Set a relationship of",
  removeRelationship: "Remove a relationship",
  setTimelineEvent: "Change the timeline",
  addCanvasCards: "Add cards to",
  recordKnowledge: "Record what is known by",
  recordSetup: "Record the setup",
  editNote: "Edit",
  writeNote: "Write",
  commentOnNote: "Comment on",
};

/** The label for a tool, falling back to its name for one that has none. */
export function stepLabel(toolName: string): StepLabel {
  return toolLabels[toolName] ?? { doing: `Running ${toolName}`, done: `Ran ${toolName}` };
}
