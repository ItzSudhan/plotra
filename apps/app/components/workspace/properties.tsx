"use client";

import type { PropertyType, PropertyValue } from "@plotra/db/schema";
import { Icon, type IconName } from "@plotra/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@plotra/ui/components/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@plotra/ui/components/select";
import { cn } from "@plotra/ui/lib/utils";
import { generateKeyBetween } from "fractional-indexing";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { EntityField } from "@plotra/db/schema";
import { useWorld, WORLD_NOTICE } from "@/components/world/data";
import { NodeIcon, useEntityType, useKindLabel } from "@/components/world/entity-icon";
import { createPropertyDef, deletePropertyDef, updatePropertyDef, type PropertyDef } from "@/lib/knowledge-actions";
import { flatten, isTrashed, type BinderNode } from "@/lib/tree";
import { updateEntityType, type EntityTypeRow } from "@/lib/world-actions";
import { useStore } from "./stores";
import { useWorkspace } from "./workspace-provider";
import { errorText } from "@/lib/errors";
import { SuggestInput } from "@plotra/ui/components/suggest-input";
import { confirm, promptText } from "@plotra/ui/components/dialogs";
import { IconButton } from "@plotra/ui/components/icon-button";
import { kindPlural } from "@/lib/vocabulary";

// Typed properties (plan.md 2.4 "frontmatter"). The fields a node shows come
// from its kind's template (property_def rows); values live on the node.

export const propertyTypeMeta: Record<PropertyType, { label: string; icon: IconName }> = {
  text: { label: "Text", icon: "text-linear" },
  number: { label: "Number", icon: "sort-vertical-linear" },
  date: { label: "Date", icon: "calendar-linear" },
  select: { label: "One choice from a list", icon: "alt-arrow-down-linear" },
  multi_select: { label: "Several choices", icon: "list-check-linear" },
  node: { label: "Link to note", icon: "link-round-linear" },
  checkbox: { label: "Yes or no", icon: "check-circle-linear" },
  url: { label: "Web link", icon: "link-linear" },
};

const inputClass =
  "h-7 w-full min-w-0 rounded-md border border-transparent bg-transparent px-2 text-ui-sm outline-none hover:border-input focus-visible:border-input focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:hover:border-transparent";

const byPosition = (a: PropertyDef, b: PropertyDef) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0);

export function useKindDefs(kind: BinderNode["kind"]) {
  const { propertyDefs } = useWorkspace();
  const defs = useStore(propertyDefs);
  return useMemo(() => defs.filter((d) => d.nodeKind === kind).sort(byPosition), [defs, kind]);
}

/** A custom entity type's fields, in the shape of property definitions. */
export function entityDefs(type: Pick<EntityTypeRow, "id" | "schema">): PropertyDef[] {
  return type.schema.map((field, i) => ({
    id: `${type.id}:${field.key}`,
    nodeKind: "entity",
    key: field.key,
    label: field.label,
    type: field.type,
    options: field.options ?? {},
    position: String(i).padStart(4, "0"),
  }));
}

/** The properties a node shows: its custom type's fields for a world entry, else its kind's template. */
export function useNodeDefs(node: Pick<BinderNode, "kind" | "entityTypeId">) {
  const kindDefs = useKindDefs(node.kind);
  const type = useEntityType(node.entityTypeId);
  return useMemo(() => (node.kind === "entity" ? (type ? entityDefs(type) : []) : kindDefs), [kindDefs, node.kind, type]);
}

/**
 * Editing the template a node's properties come from: `property_def` rows for
 * a binder kind, or the schema of a custom entity type (plan.md 2.8).
 */
function useTemplate(node: BinderNode) {
  const { project, propertyDefs, notify } = useWorkspace();
  const { refresh } = useWorld();
  const type = useEntityType(node.entityTypeId);
  const defs = useNodeDefs(node);
  const replaceDef = (def: PropertyDef) => propertyDefs.set((all) => all.map((d) => (d.id === def.id ? def : d)));

  if (node.kind === "entity") {
    const save = async (schema: EntityField[]) => {
      if (!type) return;
      await updateEntityType(project.id, type.id, { schema });
      refresh();
      notify(WORLD_NOTICE);
    };
    const fields = type?.schema ?? [];
    return {
      defs,
      editable: Boolean(type),
      add: (label: string, fieldType: PropertyType) => save([...fields, { key: "", label, type: fieldType }]),
      rename: (def: PropertyDef, label: string) => save(fields.map((f) => (f.key === def.key ? { ...f, label } : f))),
      move: (def: PropertyDef, direction: -1 | 1) => {
        const i = fields.findIndex((f) => f.key === def.key);
        const j = i + direction;
        if (i < 0 || j < 0 || j >= fields.length) return Promise.resolve();
        const next = [...fields];
        [next[i], next[j]] = [next[j], next[i]];
        return save(next);
      },
      remove: (def: PropertyDef) => save(fields.filter((f) => f.key !== def.key)),
      addChoices: (def: PropertyDef, choices: string[]) => save(fields.map((f) => (f.key === def.key ? { ...f, options: { ...f.options, choices } } : f))),
    };
  }

  return {
    defs,
    editable: true,
    add: async (label: string, fieldType: PropertyType) => {
      const def = await createPropertyDef(project.id, { nodeKind: node.kind, label, type: fieldType });
      propertyDefs.set((all) => [...all, def]);
    },
    rename: async (def: PropertyDef, label: string) => replaceDef(await updatePropertyDef(project.id, def.id, { label })),
    move: async (def: PropertyDef, direction: -1 | 1) => {
      const i = defs.findIndex((d) => d.id === def.id);
      const neighbour = defs[i + direction];
      if (!neighbour) return;
      const after = direction === 1 ? defs[i + 2] : defs[i - 2];
      const position =
        direction === 1
          ? generateKeyBetween(neighbour.position, after?.position ?? null)
          : generateKeyBetween(after?.position ?? null, neighbour.position);
      replaceDef({ ...def, position });
      try {
        await updatePropertyDef(project.id, def.id, { position });
      } catch (error) {
        replaceDef(def);
        throw error;
      }
    },
    remove: async (def: PropertyDef) => {
      propertyDefs.set((all) => all.filter((d) => d.id !== def.id));
      try {
        await deletePropertyDef(project.id, def.id);
      } catch (error) {
        propertyDefs.set((all) => [...all, def]);
        throw error;
      }
    },
    addChoices: async (def: PropertyDef, choices: string[]) => {
      propertyDefs.set((all) => all.map((d) => (d.id === def.id ? { ...d, options: { ...d.options, choices } } : d)));
      await updatePropertyDef(project.id, def.id, { options: { ...def.options, choices } });
    },
  };
}

/** Chips with a text box to add more; used for tags, aliases and multi-selects. */
export function ChipInput({
  values,
  onChange,
  placeholder,
  suggestions = [],
  clean = (v: string) => v.trim(),
  disabled,
  prefix,
  label,
  id,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  /** Names the text box for screen readers, when no visible label points at it (`id`). */
  label?: string;
  id?: string;
  suggestions?: string[];
  clean?: (value: string) => string;
  disabled?: boolean;
  prefix?: string;
}) {
  const [draft, setDraft] = useState("");
  const offered = useMemo(() => suggestions.filter((s) => !values.includes(s)), [suggestions, values]);
  const add = () => {
    const next = clean(draft);
    setDraft("");
    if (next && !values.includes(next)) onChange([...values, next]);
  };
  return (
    <div className="flex min-h-7 flex-wrap items-center gap-1 rounded-md px-1 py-0.5">
      {values.map((value) => (
        <span key={value} className="flex h-6 items-center gap-0.5 rounded bg-muted pr-0.5 pl-1.5 text-xs">
          {prefix}
          {value}
          {!disabled && (
            <IconButton
              icon="close-linear"
              label={`Remove ${prefix ?? ""}${value}`}
              size="xs"
              onClick={() => onChange(values.filter((v) => v !== value))}
              className="size-5 rounded-sm hover:bg-foreground/10"
            />
          )}
        </span>
      ))}
      {!disabled && (
        <>
          <SuggestInput
            id={id}
            aria-label={id ? undefined : (label ?? placeholder)}
            value={draft}
            suggestions={offered}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                add();
              } else if (e.key === "Backspace" && !draft && values.length) {
                onChange(values.slice(0, -1));
              }
            }}
            onBlur={add}
            placeholder={values.length ? "" : placeholder}
            className="h-6 min-w-16 flex-1 rounded-sm bg-transparent px-1 text-ui-sm outline-none placeholder:text-faint focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        </>
      )}
    </div>
  );
}

/** A text-like input that commits on blur or Enter. */
function CommitInput({
  value,
  onCommit,
  type = "text",
  disabled,
  placeholder,
  label,
}: {
  value: string;
  onCommit: (value: string) => void;
  type?: string;
  disabled?: boolean;
  placeholder?: string;
  label: string;
}) {
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setDraft(value);
  }
  return (
    <input
      type={type}
      value={draft}
      aria-label={label}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setDraft(value);
      }}
      className={cn(inputClass, "placeholder:text-faint")}
    />
  );
}

function NodePicker({
  def,
  value,
  onChange,
  disabled,
  exclude,
}: {
  def: PropertyDef;
  value: PropertyValue;
  onChange: (value: string | string[] | null) => void;
  disabled?: boolean;
  exclude: string;
}) {
  const { binder, openNode } = useWorkspace();
  const { index } = useStore(binder);
  const kinds = def.options.nodeKinds ?? [];
  const candidates = useMemo(
    () => flatten(index).filter((n) => n.id !== exclude && n.kind !== "folder" && (!kinds.length || kinds.includes(n.kind))),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- kinds is derived from def
    [index, exclude, def],
  );
  const selected = (Array.isArray(value) ? value : value ? [String(value)] : []).filter(
    (id) => index.byId.has(id) && !isTrashed(index, id),
  );
  const multiple = Boolean(def.options.multiple);

  return (
    <div className="flex min-h-7 flex-wrap items-center gap-1 px-1">
      {selected.map((id) => {
        const target = index.byId.get(id)!;
        return (
          <span key={id} className="flex h-6 items-center gap-1 rounded bg-ember/10 pr-0.5 pl-1.5 text-xs text-ember-ink">
            <button type="button" onClick={(e) => openNode(id, e.metaKey || e.ctrlKey ? "tab" : "replace")} className="flex items-center gap-1 hover:underline">
              <NodeIcon node={target} className="size-3" />
              {target.title}
            </button>
            {!disabled && (
              <IconButton
                icon="close-linear"
                label={`Remove ${target.title} from ${def.label}`}
                size="xs"
                onClick={() => onChange(multiple ? selected.filter((s) => s !== id) : null)}
                className="size-5 rounded-sm text-ember-ink hover:bg-ember/15 hover:text-ember-ink"
              />
            )}
          </span>
        );
      })}
      {!disabled && (multiple || selected.length === 0) && (
        <Select value="" onValueChange={(id) => onChange(multiple ? [...selected, id] : id)}>
          <SelectTrigger
            size="sm"
            aria-label={`${selected.length ? "Add to" : "Choose"} ${def.label}`}
            className="h-6 border-none px-1.5 text-xs text-muted-foreground shadow-none hover:text-foreground"
          >
            <SelectValue placeholder={selected.length ? "Add…" : "Choose…"} />
          </SelectTrigger>
          <SelectContent>
            {candidates.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">No matching notes yet.</div>}
            {candidates
              .filter((n) => !selected.includes(n.id))
              .map((n) => (
                <SelectItem key={n.id} value={n.id}>
                  <NodeIcon node={n} className="size-4" />
                  {n.title}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

/** One property's value, editable in place. */
export function PropertyInput({
  def,
  node,
  disabled,
  "aria-label": ariaLabel,
}: {
  def: PropertyDef;
  node: BinderNode;
  disabled?: boolean;
  /** The control's name, where the field's own name isn't enough ("Age of Juliet" in an outline row). */
  "aria-label"?: string;
}) {
  const name = ariaLabel ?? def.label;
  const { actions } = useWorkspace();
  const template = useTemplate(node);
  const value = node.properties[def.key] ?? null;
  const set = (next: unknown) => void actions.setProperties(node.id, { [def.key]: next });

  switch (def.type) {
    case "checkbox":
      return (
        <label className="flex h-7 items-center px-2">
          <input
            type="checkbox"
            checked={Boolean(value)}
            disabled={disabled}
            aria-label={name}
            onChange={(e) => set(e.target.checked || null)}
            className="size-3.5 accent-[var(--ember)]"
          />
        </label>
      );
    case "select":
      return (
        <Select value={typeof value === "string" ? value : "__none"} disabled={disabled} onValueChange={(v) => set(v === "__none" ? null : v)}>
          <SelectTrigger size="sm" aria-label={name} className="h-7 w-full border-transparent px-2 text-ui-sm shadow-none hover:border-input">
            <SelectValue placeholder="Empty" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">
              <span className="text-muted-foreground">Empty</span>
            </SelectItem>
            {(def.options.choices ?? []).map((choice) => (
              <SelectItem key={choice} value={choice}>
                {choice}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "multi_select": {
      const values = Array.isArray(value) ? value : [];
      return (
        <ChipInput
          values={values}
          disabled={disabled}
          placeholder="Add…"
          label={name}
          suggestions={def.options.choices ?? []}
          onChange={(next) => {
            set(next);
            // New choices join the template so others can pick them too.
            const fresh = next.filter((v) => !(def.options.choices ?? []).includes(v));
            if (fresh.length) void template.addChoices(def, [...(def.options.choices ?? []), ...fresh]).catch(() => {});
          }}
        />
      );
    }
    case "node":
      return <NodePicker def={def} value={value} onChange={set} disabled={disabled} exclude={node.id} />;
    case "number":
      return <CommitInput type="number" label={name} value={value === null ? "" : String(value)} disabled={disabled} placeholder="Empty" onCommit={(v) => set(v === "" ? null : Number(v))} />;
    case "date":
      return <CommitInput type="date" label={name} value={typeof value === "string" ? value : ""} disabled={disabled} onCommit={set} />;
    case "url":
      return (
        <div className="flex items-center">
          <CommitInput type="url" label={name} value={typeof value === "string" ? value : ""} disabled={disabled} placeholder="https://…" onCommit={set} />
          {typeof value === "string" && /^https?:\/\//.test(value) && (
            <a href={value} target="_blank" rel="noreferrer noopener" aria-label={`Open ${name} in a new tab`}
              className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50">
              <Icon name="square-arrow-right-up-linear" className="size-3.5" />
            </a>
          )}
        </div>
      );
    default:
      return <CommitInput label={name} value={typeof value === "string" ? value : value === null ? "" : String(value)} disabled={disabled} placeholder="Empty" onCommit={set} />;
  }
}

/** Read-only rendering, for the codex. */
export function PropertyDisplay({ def, value }: { def: PropertyDef; value: PropertyValue | undefined }) {
  const { binder, openNode } = useWorkspace();
  const { index } = useStore(binder);
  if (value === undefined || value === null || value === "" || (Array.isArray(value) && !value.length)) {
    return <span className="text-faint">—</span>;
  }
  if (def.type === "checkbox") return <span>{value ? "Yes" : "No"}</span>;
  if (def.type === "node") {
    const ids = (Array.isArray(value) ? value : [String(value)]).filter((id) => index.byId.has(id));
    if (!ids.length) return <span className="text-faint">—</span>;
    return (
      <span className="flex flex-wrap gap-x-2">
        {ids.map((id) => (
          <button key={id} type="button" onClick={() => openNode(id)} className="text-ember-ink hover:underline">
            {index.byId.get(id)!.title}
          </button>
        ))}
      </span>
    );
  }
  if (def.type === "url" && typeof value === "string") {
    return (
      <a href={value} target="_blank" rel="noreferrer noopener" className="truncate text-ember-ink hover:underline">
        {value}
      </a>
    );
  }
  return <span>{Array.isArray(value) ? value.join(", ") : String(value)}</span>;
}

/** The property list for a node, plus template editing (add, rename, reorder, remove). */
export function PropertyList({ node }: { node: BinderNode }) {
  const { project, binder } = useWorkspace();
  const template = useTemplate(node);
  const { defs } = template;
  const kindLabel = useKindLabel(node).toLowerCase();
  // "characters", "researches": the project's own plural, or a plain one for a world entry's type.
  const kindLabels = (node.kind === "entity" ? plural(kindLabel) : kindPlural(node.kind, project.settings)).toLowerCase();
  const canEdit = node.actions.includes("edit");
  const canEditTemplate = project.actions.includes("edit") && template.editable;
  const [adding, setAdding] = useState(false);

  const attempt = (work: Promise<unknown>, failure: string) => void work.catch((error) => toast.error(errorText(error, failure)));

  const rename = async (def: PropertyDef) => {
    const label = (await promptText({ title: "Rename field", label: "Name", defaultValue: def.label, confirmLabel: "Rename" }))?.trim();
    if (label && label !== def.label) attempt(template.rename(def, label), "Couldn't rename it.");
  };

  const remove = async (def: PropertyDef) => {
    // How many notes would stop showing a value they have.
    const filled = flatten(binder.get().index).filter((n) => {
      if (n.kind !== node.kind || (node.kind === "entity" && n.entityTypeId !== node.entityTypeId)) return false;
      const value = n.properties[def.key];
      return value !== undefined && value !== null && value !== "" && !(Array.isArray(value) && !value.length);
    }).length;
    const lost = filled
      ? `What's filled in on ${filled === 1 ? "1 note" : `${filled} notes`} stops showing${def.type === "node" ? ", and the links made through it go" : ""}.`
      : "No note has filled it in yet, so nothing is lost.";
    const ok = await confirm({
      title: `Remove the ‘${def.label}’ field from every ${kindLabel}?`,
      description: lost,
      confirmLabel: "Remove field",
      destructive: filled > 0,
    });
    if (ok) attempt(template.remove(def), "Couldn't remove it.");
  };

  return (
    <div className="grid gap-0.5">
      {defs.length === 0 && !adding && (
        <p className="py-1 text-ui-sm text-muted-foreground">
          No fields for {kindLabels} yet{canEditTemplate ? ". Add one to keep track of things like age or mood." : "."}
        </p>
      )}
      {defs.map((def, i) => (
        <div key={def.id} className="group/prop grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-start gap-1">
          <div className="flex h-7 min-w-0 items-center gap-1.5 text-ui-sm text-muted-foreground">
            <Icon name={propertyTypeMeta[def.type].icon} className="size-3.5 shrink-0 opacity-70" />
            <span className="truncate">{def.label}</span>
            {canEditTemplate && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label={`${def.label} options`}
                  className="ml-auto grid size-6 shrink-0 place-items-center rounded opacity-0 outline-none group-focus-within/prop:opacity-100 group-hover/prop:opacity-100 hover:bg-sidebar-accent focus-visible:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/50 pointer-coarse:opacity-100 data-[state=open]:opacity-100"
                >
                  <Icon name="menu-dots-linear" className="size-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onSelect={() => void rename(def)}>Rename</DropdownMenuItem>
                  <DropdownMenuItem disabled={i === 0} onSelect={() => attempt(template.move(def, -1), "Couldn't move it.")}>
                    Move up
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={i === defs.length - 1} onSelect={() => attempt(template.move(def, 1), "Couldn't move it.")}>
                    Move down
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => void remove(def)}>
                    Remove field
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          <PropertyInput def={def} node={node} disabled={!canEdit} />
        </div>
      ))}
      {adding ? (
        <AddProperty onAdd={template.add} onDone={() => setAdding(false)} />
      ) : (
        canEditTemplate && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-1 flex h-8 items-center gap-1.5 rounded-md px-1 text-ui-sm text-muted-foreground outline-none hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Icon name="add-linear" className="size-3.5" />
            Add a field to {kindLabels}
          </button>
        )
      )}
    </div>
  );
}

/** A plain English plural, for a world entry's own type name. */
function plural(word: string) {
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  return /(s|x|z|ch|sh)$/i.test(word) ? `${word}es` : `${word}s`;
}

function AddProperty({ onAdd, onDone }: { onAdd: (label: string, type: PropertyType) => Promise<unknown>; onDone: () => void }) {
  const [label, setLabel] = useState("");
  const [type, setType] = useState<PropertyType>("text");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!label.trim()) return onDone();
    setBusy(true);
    try {
      await onAdd(label.trim(), type);
      onDone();
    } catch (error) {
      setBusy(false);
      toast.error(errorText(error, "Couldn't add it."));
    }
  };

  return (
    <form
      className="mt-1 grid gap-1.5 rounded-md border p-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <input
        autoFocus
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onDone()}
        aria-label="Field name"
        placeholder="Field name, like Age"
        className="h-7 rounded-md border border-input bg-transparent px-2 text-ui-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
      <div className="flex gap-1.5">
        <Select value={type} onValueChange={(v) => setType(v as PropertyType)}>
          <SelectTrigger size="sm" aria-label="What it holds" className="h-8 flex-1 text-ui-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(propertyTypeMeta) as PropertyType[]).map((t) => (
              <SelectItem key={t} value={t}>
                <Icon name={propertyTypeMeta[t].icon} />
                {propertyTypeMeta[t].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          type="submit"
          disabled={busy}
          className="h-8 rounded-md bg-primary px-3 text-ui-sm font-medium text-primary-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </form>
  );
}

