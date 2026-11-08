"use client";

import { Icon } from "@plotra/icons";
import { IconButton } from "@plotra/ui/components/icon-button";
import { Switch } from "@plotra/ui/components/switch";
import { useMemo, useState } from "react";
import { CommitInput, CommitTextarea, Field, fieldClass } from "@/components/views/view-ui";
import { useStore } from "@/components/workspace/stores";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { expressionProblem, VARIABLE_NAME } from "@/lib/interactive/expr";
import type { DialogueNode, DialogueValue, DialogueVariable } from "@/lib/interactive/model";
import { flatten } from "@/lib/tree";
import { MAX_EXPR, MAX_LINE, nodeTypeMeta, StringId, useSpeakerName } from "./dialogue-cards";
import { SelectField } from "@plotra/ui/components/select-field";
import { SuggestInput } from "@plotra/ui/components/suggest-input";

// The floating panels of the dialogue editor: the selected card's details and
// the dialogue's variables.

const panelClass = "absolute top-3 z-10 grid gap-2.5 rounded-lg border bg-popover p-3 text-ui-sm shadow-md";
const headingClass = "text-meta font-medium text-muted-foreground";

export function NodePanel({
  node,
  editable,
  cards,
  onChange,
  onRemove,
  onReveal,
}: {
  node: DialogueNode;
  editable: boolean;
  /** The cards a Call card may call, as they're named in the picker. */
  cards: Array<{ id: string; label: string }>;
  onChange: (patch: Partial<DialogueNode>) => void;
  onRemove: () => void;
  onReveal: (id: string) => void;
}) {
  const { binder, openNode } = useWorkspace();
  const { index } = useStore(binder);
  const characters = useMemo(() => flatten(index).filter((n) => n.kind === "character"), [index]);
  const speakerName = useSpeakerName();
  const characterNames = useMemo(() => characters.map((c) => c.title), [characters]);
  const meta = nodeTypeMeta[node.type];
  const problem =
    (node.type === "condition" || node.type === "set") && node.expr?.trim()
      ? expressionProblem(node.expr, node.type === "condition" ? "condition" : "assignments")
      : null;

  return (
    <div className={`${panelClass} right-3 w-72`}>
      <div className="flex items-center gap-2">
        <p className={`${headingClass} flex-1`}>{meta.label}</p>
        <StringId sid={node.sid} />
      </div>
      {(node.type === "start" || node.type === "end") && <p className="text-xs text-muted-foreground">{meta.hint}.</p>}
      {node.type === "random" && (
        <p className="text-xs leading-snug text-muted-foreground">{meta.hint}, each as likely as the others. Draw a jump for every way it can go.</p>
      )}
      {node.type === "return" && (
        <p className="text-xs leading-snug text-muted-foreground">
          {meta.hint}, and play goes on along the Call card&rsquo;s own jump. Reached without a call, it ends the dialogue.
        </p>
      )}

      {node.type === "call" && (
        <Field label="Calls">
          <div className="flex gap-1">
            <SelectField
              value={node.target && cards.some((c) => c.id === node.target) ? node.target : ""}
              disabled={!editable}
              aria-label="The card to call"
              onValueChange={(v) => onChange({ target: v || undefined })}
              className={`${fieldClass} min-w-0 flex-1 px-1`}
            >
              <option value="">{node.target && !cards.some((c) => c.id === node.target) ? "The card it called is gone" : "Pick a card…"}</option>
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </SelectField>
            {node.target && cards.some((c) => c.id === node.target) && (
              <IconButton icon="square-arrow-right-up-linear" label="Show the card this calls" onClick={() => onReveal(node.target!)} />
            )}
          </div>
          <span className="text-meta leading-snug text-muted-foreground">
            Play goes to this card. At a Return card it comes back and follows this card&rsquo;s own jump. An End card still ends the whole dialogue.
          </span>
        </Field>
      )}

      {node.type === "line" && (
        <Field label="Speaker">
          <div className="flex gap-1">
            <SpeakerInput
              value={speakerName(node)}
              disabled={!editable}
              suggestions={characterNames}
              onCommit={(value) => {
                // A name that matches a character note links to it, so renaming the character renames the speaker.
                const name = value.trim();
                const character = characters.find((c) => c.title.toLowerCase() === name.toLowerCase());
                onChange(character ? { speakerId: character.id, speaker: undefined } : { speakerId: undefined, speaker: name.slice(0, 80) || undefined });
              }}
            />
            {node.speakerId && index.byId.has(node.speakerId) && (
              <IconButton icon="square-arrow-right-up-linear" label="Open the character" onClick={() => openNode(node.speakerId!, "tab")} />
            )}
          </div>
        </Field>
      )}

      {(node.type === "line" || node.type === "choice") && (
        <>
          <Field label={node.type === "line" ? "Line" : "Option"}>
            <CommitTextarea
              value={node.text ?? ""}
              disabled={!editable}
              rows={4}
              placeholder={node.type === "line" ? "What's said" : "What the player picks"}
              onCommit={(text) => onChange({ text: text.slice(0, MAX_LINE) })}
            />
            <span className="text-meta leading-snug text-muted-foreground">Show a variable with {"{$name}"}.</span>
          </Field>
          {node.type === "choice" && (
            <label className="flex items-center justify-between gap-2 text-xs">
              <span>
                Offer only once
                <span className="block text-meta leading-snug text-muted-foreground">Not offered again after it&rsquo;s picked.</span>
              </span>
              <Switch checked={node.once === true} disabled={!editable} onCheckedChange={(once) => onChange({ once: once || undefined })} />
            </label>
          )}
          <Field label="Note for translators and actors">
            <CommitTextarea
              value={node.note ?? ""}
              disabled={!editable}
              rows={2}
              placeholder="Tone, who's listening, where it's shown…"
              onCommit={(note) => onChange({ note: note.trim().slice(0, 500) || undefined })}
            />
          </Field>
        </>
      )}

      {(node.type === "condition" || node.type === "set") && (
        <Field label={node.type === "condition" ? "Condition" : "Assignments"}>
          <CommitTextarea
            value={node.expr ?? ""}
            disabled={!editable}
            rows={node.type === "condition" ? 2 : 3}
            placeholder={node.type === "condition" ? 'gold >= 5 && !met_anna' : "gold += 5\nmet_anna = true"}
            onCommit={(expr) => onChange({ expr: expr.slice(0, MAX_EXPR) })}
            className="font-mono text-xs"
          />
          {problem ? (
            <span className="text-meta leading-snug text-destructive">{problem}</span>
          ) : (
            <span className="text-meta leading-snug text-muted-foreground">
              {node.type === "condition"
                ? "Compare with == != < <= > >=, combine with && || !. Text goes in quotes."
                : "One per line: = sets, += adds, -= takes away."}
            </span>
          )}
        </Field>
      )}

      {editable && node.type !== "start" && (
        <button type="button" onClick={onRemove} className="flex h-8 items-center justify-center gap-1.5 rounded-md text-destructive hover:bg-destructive/10">
          <Icon name="trash-bin-minimalistic-linear" className="size-3.5" />
          Delete this card
        </button>
      )}
    </div>
  );
}

/** A name field that suggests the project's characters. Commits on blur or Enter. */
function SpeakerInput({ value, onCommit, disabled, suggestions }: { value: string; onCommit: (value: string) => void; disabled: boolean; suggestions: string[] }) {
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setDraft(value);
  }
  return (
    <SuggestInput
      value={draft}
      suggestions={suggestions}
      disabled={disabled}
      placeholder="A character, or any name"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setDraft(value);
      }}
      className={`${fieldClass} flex-1`}
    />
  );
}

const RESERVED = ["true", "false", "and", "or", "not"];

type VariableType = "number" | "text" | "flag";
const typeOf = (value: DialogueValue): VariableType => (typeof value === "number" ? "number" : typeof value === "string" ? "text" : "flag");
const startingValue: Record<VariableType, DialogueValue> = { number: 0, text: "", flag: false };

export function VariablesPanel({
  variables,
  editable,
  onChange,
  onRemove,
  onAdd,
  onClose,
}: {
  /** In order. */
  variables: Array<[string, DialogueVariable]>;
  editable: boolean;
  onChange: (id: string, patch: Partial<DialogueVariable>) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
  onClose: () => void;
}) {
  return (
    <div className={`${panelClass} left-3 w-80`}>
      <div className="flex items-center gap-2">
        <p className={`${headingClass} flex-1`}>Variables</p>
        <IconButton icon="close-linear" label="Close" size="xs" onClick={onClose} />
      </div>
      {variables.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Variables remember things during a play-through: gold, whether you&apos;ve met someone. Condition cards test them and Set cards change them.
        </p>
      ) : (
        <ul className="grid max-h-72 gap-1.5 overflow-y-auto">
          {variables.map(([id, variable]) => {
            const type = typeOf(variable.value);
            const clash = variables.some(([other, v]) => other !== id && v.name === variable.name);
            return (
              <li key={id} className="grid grid-cols-[minmax(0,1fr)_4.75rem_minmax(0,0.8fr)_auto] items-center gap-1">
                <label className="contents">
                  <span className="sr-only">Name</span>
                  <CommitInput
                    value={variable.name}
                    disabled={!editable}
                    placeholder="name"
                    invalid={clash || !VARIABLE_NAME.test(variable.name)}
                    onCommit={(value) => {
                      // Spaces become underscores; anything else that isn't allowed is dropped.
                      const name = value.trim().replace(/\s+/g, "_").replace(/[^A-Za-z0-9_]/g, "").replace(/^[0-9]+/, "").slice(0, 40);
                      if (name && !RESERVED.includes(name)) onChange(id, { name });
                    }}
                    className="font-mono text-xs"
                  />
                </label>
                <SelectField
                  value={type}
                  disabled={!editable}
                  aria-label="Type"
                  onValueChange={(v) => onChange(id, { value: startingValue[v as VariableType] })}
                  className={`${fieldClass} px-1`}
                >
                  <option value="number">Number</option>
                  <option value="text">Text</option>
                  <option value="flag">Yes/no</option>
                </SelectField>
                {type === "flag" ? (
                  <SelectField
                    value={String(variable.value)}
                    disabled={!editable}
                    aria-label="Starting value"
                    onValueChange={(v) => onChange(id, { value: v === "true" })}
                    className={`${fieldClass} px-1 font-mono text-xs`}
                  >
                    <option value="false">false</option>
                    <option value="true">true</option>
                  </SelectField>
                ) : (
                  <label className="contents">
                    <span className="sr-only">Starting value</span>
                    <CommitInput
                      value={String(variable.value)}
                      type={type === "number" ? "number" : "text"}
                      disabled={!editable}
                      placeholder="starts as"
                      onCommit={(value) =>
                        onChange(id, { value: type === "number" ? (Number.isFinite(Number(value)) ? Number(value) : 0) : value.slice(0, 200) })
                      }
                      className="font-mono text-xs"
                    />
                  </label>
                )}
                <IconButton
                  icon="trash-bin-minimalistic-linear"
                  label={`Delete ${variable.name}`}
                  variant="destructive"
                  disabled={!editable}
                  onClick={() => onRemove(id)}
                />
              </li>
            );
          })}
        </ul>
      )}
      {editable && (
        <button type="button" onClick={onAdd} className="flex h-8 items-center justify-center gap-1.5 rounded-md border border-dashed text-muted-foreground hover:bg-accent hover:text-foreground">
          <Icon name="add-linear" className="size-3.5" />
          Add a variable
        </button>
      )}
    </div>
  );
}
