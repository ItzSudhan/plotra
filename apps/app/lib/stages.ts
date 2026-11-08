import type { ProjectSettings, WorkflowStage } from "@plotra/db/schema";

// The editorial workflow (plan.md 2.8 "Configurable status workflow"). A
// node's `status` is the id of one of the project's stages. Projects that
// haven't set their own use Draft → Revised → Final.

export const defaultStages: WorkflowStage[] = [
  { id: "draft", label: "Draft", color: "#9a938a" },
  { id: "revised", label: "Revised", color: "#b98021" },
  { id: "final", label: "Final", color: "#109a82" },
];

/** Ready-made workflows offered in project settings. */
export const stagePresets: Array<{ id: string; label: string; stages: WorkflowStage[] }> = [
  { id: "simple", label: "Draft → Revised → Final", stages: defaultStages },
  {
    id: "review",
    label: "Draft → In review → Approved → Locked",
    stages: [
      { id: "draft", label: "Draft", color: "#9a938a" },
      { id: "in-review", label: "In review", color: "#b98021" },
      { id: "approved", label: "Approved", color: "#109a82", approval: true },
      { id: "locked", label: "Locked", color: "#5f3dc4", approval: true, locked: true },
    ],
  },
  {
    id: "novel",
    label: "Draft → Beta read → Edit → Copy-edit → Proof",
    stages: [
      { id: "draft", label: "Draft", color: "#9a938a" },
      { id: "beta-read", label: "Beta read", color: "#1971c2" },
      { id: "edit", label: "Edit", color: "#b98021" },
      { id: "copy-edit", label: "Copy-edit", color: "#e2602a" },
      { id: "proof", label: "Proof", color: "#109a82", approval: true, locked: true },
    ],
  },
];

export const stagesOf = (settings: ProjectSettings | null | undefined): WorkflowStage[] =>
  settings?.stages?.length ? settings.stages : defaultStages;

/** The stage for a status id. Unknown ids (a stage since removed) show under their own name. */
export function stageOf(stages: WorkflowStage[], id: string): WorkflowStage {
  return stages.find((s) => s.id === id) ?? { id, label: id, color: "#9a938a" };
}

/** Whether a status id is the first stage, which is shown without a marker. */
export const isFirstStage = (stages: WorkflowStage[], id: string) => stages[0]?.id === id;

const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const COLOR = /^#[0-9a-f]{6}$/i;

/** Validates stages coming from the client. Throws on anything malformed. */
export function cleanStages(input: unknown): WorkflowStage[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > 12) throw new Error("A workflow needs between 1 and 12 stages.");
  const seen = new Set<string>();
  return input.map((raw) => {
    const s = raw as Partial<WorkflowStage>;
    const id = String(s.id ?? "");
    const label = String(s.label ?? "").trim().slice(0, 40);
    if (!ID.test(id) || seen.has(id)) throw new Error("Stage ids must be unique, lowercase and without spaces.");
    if (!label) throw new Error("Name every stage.");
    seen.add(id);
    return {
      id,
      label,
      color: COLOR.test(String(s.color)) ? String(s.color) : "#9a938a",
      ...(s.locked ? { locked: true } : {}),
      ...(s.approval ? { approval: true } : {}),
    };
  });
}
