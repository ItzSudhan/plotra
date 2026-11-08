"use client";

import { Icon, type IconName } from "@plotra/icons";
import { cn } from "@plotra/ui/lib/utils";
import { BaseEdge, getBezierPath, Handle, Position, useNodesData, type Edge, type EdgeProps, type Node, type NodeProps } from "@xyflow/react";
import { createContext, use, useRef, useState } from "react";
import { toast } from "sonner";
import { Tooltip } from "@plotra/ui/components/tooltip";
import { useStore } from "@/components/workspace/stores";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { expressionProblem } from "@/lib/interactive/expr";
import type { DialogueNode, DialogueNodeType } from "@/lib/interactive/model";
import { isTrashed } from "@/lib/tree";

// The cards of the dialogue editor (plan.md 2.8): one per node type. Jumps
// leave a card on its right and arrive on its left, so a conversation reads
// left to right; a condition has two ways out, true and false. A Call card
// names the card it calls, picked in its panel, rather than drawing a jump.

export type DialogueFlowNode = Node<{ node: DialogueNode }>;
export type DialogueFlowEdge = Edge<{ outcome?: "true" | "false" }>;

export const SOURCE_HANDLE = "out";
export const TARGET_HANDLE = "in";

export const nodeTypeMeta: Record<DialogueNodeType, { label: string; icon: IconName; color: string; hint: string }> = {
  start: { label: "Start", icon: "play-linear", color: "var(--teal)", hint: "Where a play-through begins" },
  line: { label: "Line", icon: "user-speak-linear", color: "var(--ember)", hint: "Something a character says" },
  choice: { label: "Choice", icon: "list-check-linear", color: "var(--violet)", hint: "An option the player picks" },
  condition: { label: "Condition", icon: "question-circle-linear", color: "var(--gold)", hint: "Goes one way when it's true, another when it's false" },
  set: { label: "Set", icon: "code-linear", color: "var(--teal)", hint: "Changes a variable" },
  random: { label: "Random", icon: "routing-2-linear", color: "var(--gold)", hint: "Goes on along one of its jumps, picked at random" },
  call: { label: "Call", icon: "multiple-forward-right-linear", color: "var(--violet)", hint: "Plays a shared branch, then comes back and goes on" },
  return: { label: "Return", icon: "undo-left-round-linear", color: "var(--violet)", hint: "Goes back to the Call card that called this branch" },
  end: { label: "End", icon: "stop-linear", color: "var(--rose)", hint: "The dialogue stops here" },
};

/** Writes to the dialogue doc and what every card needs to draw itself. */
export const DialogueContext = createContext<{
  update: (id: string, patch: Partial<DialogueNode>) => void;
  editable: boolean;
  /** The node the play-through stands on. */
  playingAt: string | null;
  /** Selects a card and shows it on the canvas. */
  reveal: (id: string) => void;
} | null>(null);
const useDialogue = () => use(DialogueContext)!;

/** A speaker's name: the character note's title, or the name typed in. Never the title of a note the viewer can't see. */
export function useSpeakerName() {
  const { binder } = useWorkspace();
  const { index } = useStore(binder);
  return (node: Pick<DialogueNode, "speakerId" | "speaker">) => {
    if (node.speakerId) {
      const character = index.byId.get(node.speakerId);
      return character && !isTrashed(index, character.id) ? character.title : "Unknown speaker";
    }
    return node.speaker?.trim() ?? "";
  };
}

const handleClass = "!size-2.5 !border-2 !border-background !bg-muted-foreground";

function In() {
  return <Handle type="target" position={Position.Left} id={TARGET_HANDLE} className={handleClass} />;
}

function Out({ id = SOURCE_HANDLE, color }: { id?: string; color?: string }) {
  const { editable } = useDialogue();
  return (
    <Handle
      type="source"
      position={Position.Right}
      id={id}
      className={cn(handleClass, editable && "!cursor-crosshair")}
      style={color ? { backgroundColor: color } : undefined}
      title={editable ? "Drag to another card to jump to it, or to empty space to add one" : undefined}
    />
  );
}

function Shell({ id, type, selected, invalid, children }: { id: string; type: DialogueNodeType; selected: boolean; invalid?: boolean; children: React.ReactNode }) {
  const { playingAt } = useDialogue();
  return (
    <div
      className={cn(
        "relative w-60 rounded-lg border bg-card text-ui-sm shadow-sm",
        selected && "ring-2 ring-ember/60",
        playingAt === id && "ring-2 ring-teal",
        invalid && "border-destructive",
      )}
      style={{ borderLeft: `3px solid ${nodeTypeMeta[type].color}` }}
    >
      {children}
    </div>
  );
}

/** The String ID on a card: the label game code uses to find this line. Click to copy it. */
export function StringId({ sid, className }: { sid?: string; className?: string }) {
  if (!sid) return null;
  return (
    <Tooltip content="This line's ID, which the game's code uses to find it. Click to copy.">
      <button
        type="button"
        aria-label={`Copy the line's ID, ${sid}`}
        onClick={(e) => {
          e.stopPropagation();
          navigator.clipboard.writeText(sid).then(
            () => toast.success(`Copied ${sid}`),
            () => toast.error("Couldn't copy."),
          );
        }}
        className={cn("nodrag shrink-0 rounded px-1 font-mono text-meta text-faint hover:bg-accent hover:text-foreground", className)}
      >
        {sid}
      </button>
    </Tooltip>
  );
}

/** Text on a card, edited in place on double-click, or Enter or F2 when focused. */
function InlineText({
  value,
  onCommit,
  placeholder,
  mono,
  max,
}: {
  value: string;
  onCommit: (value: string) => void;
  placeholder: string;
  mono?: boolean;
  max: number;
}) {
  const { editable } = useDialogue();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  // Escape leaves without saving; the blur that follows must not commit what was typed.
  const cancelled = useRef(false);
  if (!editing && draft !== value) setDraft(value);
  if (editing) {
    return (
      <textarea
        autoFocus
        value={draft}
        rows={Math.min(8, Math.max(2, draft.split("\n").length))}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => {
          setEditing(false);
          if (!cancelled.current && draft !== value) onCommit(draft.slice(0, max));
          cancelled.current = false;
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            cancelled.current = true;
            e.currentTarget.blur();
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.blur();
        }}
        className={cn("nodrag nowheel block w-full resize-none bg-transparent px-3 pb-2.5 leading-snug outline-none", mono && "font-mono text-xs")}
      />
    );
  }
  return (
    <p
      role={editable ? "button" : undefined}
      tabIndex={editable ? 0 : undefined}
      aria-label={editable ? `${value || "Empty"}. Press Enter to edit` : undefined}
      onDoubleClick={() => editable && setEditing(true)}
      onKeyDown={(e) => {
        if (editable && (e.key === "Enter" || e.key === "F2")) {
          e.preventDefault();
          e.stopPropagation();
          setEditing(true);
        }
      }}
      className={cn(
        "rounded-sm px-3 pb-2.5 leading-snug break-words whitespace-pre-wrap outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        mono && "font-mono text-xs",
        !value && "text-faint",
      )}
    >
      {value || (editable ? placeholder : "Empty")}
    </p>
  );
}

export const MAX_LINE = 2000;
export const MAX_EXPR = 500;

function Header({ type, children }: { type: DialogueNodeType; children?: React.ReactNode }) {
  const meta = nodeTypeMeta[type];
  return (
    <p className="flex items-center gap-1.5 px-3 pt-2 pb-1 text-meta text-muted-foreground">
      <span className="shrink-0" style={{ color: meta.color }}>
        <Icon name={meta.icon} className="size-3.5" />
      </span>
      {children ?? meta.label}
    </p>
  );
}

function LineCard({ id, data, selected }: NodeProps<DialogueFlowNode>) {
  const { update } = useDialogue();
  const speaker = useSpeakerName()(data.node);
  return (
    <Shell id={id} type="line" selected={selected}>
      <In />
      <Header type="line">
        <span className={cn("min-w-0 flex-1 truncate font-medium", speaker ? "text-foreground" : "text-faint")}>{speaker || "No speaker"}</span>
        <StringId sid={data.node.sid} />
      </Header>
      <InlineText value={data.node.text ?? ""} placeholder="Double-click (or press Enter) to write the line" max={MAX_LINE} onCommit={(text) => update(id, { text })} />
      <Out />
    </Shell>
  );
}

function ChoiceCard({ id, data, selected }: NodeProps<DialogueFlowNode>) {
  const { update } = useDialogue();
  return (
    <Shell id={id} type="choice" selected={selected}>
      <In />
      <Header type="choice">
        <span className="flex-1">{data.node.once ? "Choice · once" : "Choice"}</span>
        <StringId sid={data.node.sid} />
      </Header>
      <InlineText value={data.node.text ?? ""} placeholder="Double-click (or press Enter) to write the option" max={MAX_LINE} onCommit={(text) => update(id, { text })} />
      <Out />
    </Shell>
  );
}

function ConditionCard({ id, data, selected }: NodeProps<DialogueFlowNode>) {
  const { update } = useDialogue();
  const expr = data.node.expr ?? "";
  const problem = expr.trim() ? expressionProblem(expr, "condition") : null;
  return (
    <Shell id={id} type="condition" selected={selected} invalid={!!problem}>
      <In />
      <Header type="condition">If</Header>
      <InlineText value={expr} placeholder="gold >= 5" mono max={MAX_EXPR} onCommit={(value) => update(id, { expr: value })} />
      {problem && <p className="px-3 pb-2 text-meta leading-snug text-destructive">{problem}</p>}
      <div className="border-t text-meta text-muted-foreground">
        <div className="relative px-3 py-1 text-right">
          If true
          <Out id="true" color="var(--teal)" />
        </div>
        <div className="relative px-3 py-1 text-right">
          If false
          <Out id="false" color="var(--rose)" />
        </div>
      </div>
    </Shell>
  );
}

function SetCard({ id, data, selected }: NodeProps<DialogueFlowNode>) {
  const { update } = useDialogue();
  const expr = data.node.expr ?? "";
  const problem = expr.trim() ? expressionProblem(expr, "assignments") : null;
  return (
    <Shell id={id} type="set" selected={selected} invalid={!!problem}>
      <In />
      <Header type="set" />
      <InlineText value={expr} placeholder="gold += 5" mono max={MAX_EXPR} onCommit={(value) => update(id, { expr: value })} />
      {problem && <p className="px-3 pb-2 text-meta leading-snug text-destructive">{problem}</p>}
      <Out />
    </Shell>
  );
}

function RandomCard({ id, selected }: NodeProps<DialogueFlowNode>) {
  return (
    <Shell id={id} type="random" selected={selected}>
      <In />
      <Header type="random" />
      <p className="px-3 pb-2.5 text-xs leading-snug text-muted-foreground">One of its jumps, picked at random</p>
      <Out />
    </Shell>
  );
}

/** A card as it's named elsewhere (the Check menu, a Call card): its type and the start of its text. */
export function cardLabel(node: DialogueNode) {
  const body = (node.type === "line" || node.type === "choice" ? node.text : node.type === "condition" || node.type === "set" ? node.expr : "")?.replace(/\s+/g, " ").trim();
  const label = nodeTypeMeta[node.type].label;
  return body ? `${label} · ${body.length > 40 ? `${body.slice(0, 39)}…` : body}` : label;
}

function CallCard({ id, data, selected }: NodeProps<DialogueFlowNode>) {
  const { reveal } = useDialogue();
  const targetId = data.node.target;
  const target = useNodesData<DialogueFlowNode>(targetId ?? "");
  return (
    <Shell id={id} type="call" selected={selected} invalid={!target}>
      <In />
      <Header type="call" />
      {target ? (
        <button
          type="button"
          aria-label={`Show the card this calls: ${cardLabel(target.data.node)}`}
          onClick={(e) => {
            e.stopPropagation();
            reveal(target.id);
          }}
          className="nodrag mx-3 mb-2.5 block max-w-[calc(100%-1.5rem)] truncate rounded text-left text-xs hover:underline"
        >
          → {cardLabel(target.data.node)}
        </button>
      ) : (
        <p className="px-3 pb-2.5 text-xs leading-snug text-destructive">{targetId ? "The card it called is gone" : "Pick the card to call in its panel"}</p>
      )}
      <Out />
    </Shell>
  );
}

function Pill({ id, type, selected, children }: { id: string; type: "start" | "end" | "return"; selected: boolean; children: React.ReactNode }) {
  const { playingAt } = useDialogue();
  const meta = nodeTypeMeta[type];
  return (
    <div
      className={cn(
        "relative flex items-center gap-1.5 rounded-full border bg-card py-1.5 pr-4 pl-3 text-ui-sm font-medium shadow-sm",
        selected && "ring-2 ring-ember/60",
        playingAt === id && "ring-2 ring-teal",
      )}
    >
      <span style={{ color: meta.color }}>
        <Icon name={meta.icon} className="size-4" />
      </span>
      {meta.label}
      {children}
    </div>
  );
}

function StartCard({ id, selected }: NodeProps<DialogueFlowNode>) {
  return (
    <Pill id={id} type="start" selected={selected}>
      <Out />
    </Pill>
  );
}

function EndCard({ id, selected }: NodeProps<DialogueFlowNode>) {
  return (
    <Pill id={id} type="end" selected={selected}>
      <In />
    </Pill>
  );
}

function ReturnCard({ id, selected }: NodeProps<DialogueFlowNode>) {
  return (
    <Pill id={id} type="return" selected={selected}>
      <In />
    </Pill>
  );
}

export const dialogueNodeComponents = {
  start: StartCard,
  line: LineCard,
  choice: ChoiceCard,
  condition: ConditionCard,
  set: SetCard,
  random: RandomCard,
  call: CallCard,
  return: ReturnCard,
  end: EndCard,
};

function JumpEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd, selected }: EdgeProps<DialogueFlowEdge>) {
  const [path] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const stroke = selected ? "var(--ember)" : data?.outcome === "true" ? "var(--teal)" : data?.outcome === "false" ? "var(--rose)" : "var(--muted-foreground)";
  return <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ stroke, strokeWidth: selected ? 2.5 : 1.5 }} />;
}

export const dialogueEdgeComponents = { jump: JumpEdge };
