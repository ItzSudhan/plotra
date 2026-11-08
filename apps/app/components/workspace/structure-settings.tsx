"use client";

import { moduleIds, type ProjectLabel } from "@plotra/db/schema";
import { Icon, type IconName } from "@plotra/icons";
import { IconButton } from "@plotra/ui/components/icon-button";
import { undoToast } from "@plotra/ui/components/sonner";
import { Tooltip } from "@plotra/ui/components/tooltip";
import { cn } from "@plotra/ui/lib/utils";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { offerModule } from "@/components/onboarding/module-prompt";
import { useWorld, WORLD_NOTICE } from "@/components/world/data";
import { EntityIcon } from "@/components/world/entity-icon";
import { EntityTypeDialog } from "@/components/world/entity-type-dialog";
import { errorText } from "@/lib/errors";
import { updateProjectSettings, type SettingsPatch } from "@/lib/project-actions";
import { nodeKindMeta } from "@/lib/tree";
import { moduleMeta } from "@/lib/modules";
import { labelColors, renameableKinds, renameableViews } from "@/lib/vocabulary";
import { kindsFile, readKindsFile } from "@/lib/kinds-file";
import { createEntityType, type EntityTypeRow } from "@/lib/world-actions";
import { NamedSwatches } from "./named-swatches";
import { useWorkspace } from "./workspace-provider";
import { plural } from "@/lib/plural";

// The parts of project settings that shape a project's structure
// (onboarding-plan.md 4.2): its own names for things, its colour labels, and
// its own note types. They belong to the project, so everyone in it
// sees the same ones, and only people who manage it can change them.

function useStructure() {
  const { project, projectChanged } = useWorkspace();
  const save = async (patch: SettingsPatch) => {
    try {
      await updateProjectSettings(project.id, patch);
      projectChanged();
    } catch (error) {
      toast.error(errorText(error));
    }
  };
  return { project, canManage: project.actions.includes("manage"), save };
}

const inputClass =
  "h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-ui-sm outline-none placeholder:text-faint focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60";

/** Shown in place of working controls to someone who can see these settings but not change them. */
export function ManagersOnly({ who = "manage" }: { who?: "manage" | "edit" }) {
  return (
    <p className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
      <Icon name="lock-linear" className="size-3.5 shrink-0" />
      Only people who {who} this project can change these.
    </p>
  );
}

/** One thing the project can call by its own word: the app's word, an icon, and the vocabulary key it's kept under. */
type Renameable = { key: string; word: string; icon: IconName };

function RenameList({ items, words, canManage, onSave }: { items: Renameable[]; words: Record<string, string>; canManage: boolean; onSave: (key: string, word: string) => void }) {
  return (
    <ul className="divide-y rounded-xl border bg-card">
      {items.map((item) => (
        <li key={item.key}>
          <label className="grid grid-cols-[minmax(0,8.5rem)_auto_minmax(0,1fr)] items-center gap-3 py-1.5 pr-1.5 pl-3.5 text-ui-sm">
            <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
              <Icon name={item.icon} className="size-4 shrink-0" />
              <span className="truncate">{item.word}</span>
            </span>
            <Icon name="arrow-right-linear" className={cn("size-3.5 text-faint", words[item.key] && "text-ember-ink")} />
            {/* Uncontrolled and keyed by the saved word, so it shows what was saved and a rename is one request, on leaving the field. */}
            <input
              key={words[item.key] ?? ""}
              defaultValue={words[item.key] ?? ""}
              aria-label={`New name for ${item.word}`}
              placeholder={item.word}
              maxLength={30}
              disabled={!canManage}
              onBlur={(event) => {
                const word = event.target.value.trim();
                if (word !== (words[item.key] ?? "")) onSave(item.key, word);
              }}
              onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
              className={cn(inputClass, "border-transparent hover:border-input focus-visible:border-input")}
            />
          </label>
        </li>
      ))}
    </ul>
  );
}

export function Words() {
  const { project, canManage, save } = useStructure();
  const { modules } = useWorkspace();
  const words = project.settings.vocabulary ?? {};
  const changed = Object.keys(words).length > 0;
  const onSave = (key: string, word: string) => void save({ vocabulary: { ...words, [key]: word } });
  const heading = "mt-2 text-ui-sm font-medium first:mt-0";
  return (
    <div className="grid gap-3">
      {!canManage && <ManagersOnly />}
      <h3 className={heading}>Types of note</h3>
      <RenameList items={renameableKinds.map((kind) => ({ key: kind, word: nodeKindMeta[kind].label, icon: nodeKindMeta[kind].icon }))} words={words} canManage={canManage} onSave={onSave} />
      <h3 className={heading}>Views</h3>
      <RenameList
        // The views this project has; a renamed one is called that in the ribbon, its tabs and the list of commands.
        items={renameableViews.filter((view) => !view.module || modules.has(view.module)).map((view) => ({ key: `view:${view.id}`, word: view.title, icon: view.icon }))}
        words={words}
        canManage={canManage}
        onSave={onSave}
      />
      <h3 className={heading}>Tools</h3>
      <RenameList items={moduleIds.map((id) => ({ key: `module:${id}`, word: moduleMeta[id].label, icon: moduleMeta[id].icon }))} words={words} canManage={canManage} onSave={onSave} />
      {changed && canManage && (
        <button
          type="button"
          onClick={() => void save({ vocabulary: {} })}
          className="-ml-2 flex h-8 w-fit items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Icon name="restart-linear" className="size-3.5" />
          Back to Plotra&apos;s own names
        </button>
      )}
    </div>
  );
}

/** The project's colour labels: free marks a note can carry, apart from its status. */
export function Labels() {
  const { project, canManage, save } = useStructure();
  const { binder } = useWorkspace();
  const labels = project.settings.labels ?? [];
  const [name, setName] = useState("");
  const set = (next: Array<Partial<ProjectLabel> & { name: string; color: string }>) => save({ labels: next });
  // Notes keep a deleted label's id, so putting the label back (same id) gives it back to them.
  const remove = (label: ProjectLabel) => {
    const before = labels;
    const count = binder.get().nodes.filter((n) => !n.deletedAt && n.settings.label === label.id).length;
    void set(labels.filter((l) => l.id !== label.id));
    undoToast(`Deleted the label ‘${label.name}’`, () => set(before), {
      description: count ? `${count === 1 ? "1 note loses it" : `${count} notes lose it`}. Undo gives it back.` : undefined,
    });
  };

  return (
    <div className="grid gap-4">
      {!canManage && <ManagersOnly />}
      <div className="rounded-xl border bg-card">
        <ul className="divide-y">
          {labels.map((label) => (
            <li key={label.id} className="flex flex-wrap items-center gap-2 py-1.5 pr-1.5 pl-3.5">
              <span className="shrink-0" style={{ color: label.color }}>
                <Icon name="tag-linear" className="size-4" />
              </span>
              <input
                key={label.name}
                defaultValue={label.name}
                aria-label="Label name"
                maxLength={40}
                disabled={!canManage}
                onBlur={(event) => {
                  const next = event.target.value.trim();
                  if (next && next !== label.name) void set(labels.map((l) => (l.id === label.id ? { ...l, name: next } : l)));
                }}
                onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
                className={cn(inputClass, "min-w-32 flex-1 basis-32 border-transparent hover:border-input focus-visible:border-input")}
              />
              <NamedSwatches
                colours={labelColors}
                value={label.color}
                label={`Colour of ${label.name}`}
                disabled={!canManage}
                onChange={(color) => void set(labels.map((l) => (l.id === label.id ? { ...l, color } : l)))}
                className="shrink-0 gap-0.5"
              />
              {canManage && <IconButton icon="trash-bin-minimalistic-linear" label={`Delete the label ${label.name}`} onClick={() => remove(label)} />}
            </li>
          ))}
        </ul>
        {labels.length === 0 && (
          <p className="flex items-center justify-center gap-2 px-4 py-8 text-xs text-muted-foreground">
            <Icon name="tag-linear" className="size-4" />
            No labels yet.{canManage ? " Add one below." : ""}
          </p>
        )}
        {canManage && (
          <form
            className="flex gap-2 border-t bg-muted/40 p-2 first:border-t-0"
            onSubmit={(event) => {
              event.preventDefault();
              const next = name.trim();
              if (!next) return;
              void set([...labels, { name: next, color: labelColors[labels.length % labelColors.length] }]);
              setName("");
            }}
          >
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="A new label"
              maxLength={40}
              aria-label="New label"
              className={cn(inputClass, "bg-background")}
            />
            <button type="submit" disabled={!name.trim()} className="h-8 shrink-0 rounded-md bg-foreground px-3 text-ui-sm text-background disabled:opacity-50">
              Add
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

/** Saves kinds to a `.json` file, as `kindsFile` writes them. */
function downloadKinds(name: string, types: EntityTypeRow[]) {
  const url = URL.createObjectURL(new Blob([kindsFile(types)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "kinds"}.plotra-kinds.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * The project's own note types (called kinds in the code): a Faction, a Spell,
 * a Case, each with its own icon, colour and fields. They are the world
 * bible's types, so they come with that tool.
 */
export function Kinds() {
  const { project, canManage } = useStructure();
  const { modules, setUi, notify } = useWorkspace();
  const world = useWorld();
  const types = world.data?.entityTypes ?? [];
  const [editing, setEditing] = useState<{ type: EntityTypeRow | null } | null>(null);
  const canEdit = project.actions.includes("edit");
  const fileInput = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  /** Makes each kind in a file this project doesn't have yet, by name. */
  const load = async (file: File | undefined) => {
    if (!file) return;
    setLoading(true);
    try {
      const kinds = readKindsFile(await file.text());
      const have = new Set(types.map((t) => t.name.toLowerCase()));
      const fresh = kinds.filter((k) => !have.has(k.name.toLowerCase()));
      let added = 0;
      for (const kind of fresh) {
        const input = kind as Parameters<typeof createEntityType>[1];
        // An icon or colour this Plotra doesn't know falls back to the plain ones rather than lose the kind.
        const made = await createEntityType(project.id, input).catch(() => createEntityType(project.id, { ...input, icon: "box-linear", color: "#868e96" }).catch(() => null));
        if (made) added++;
      }
      notify(WORLD_NOTICE);
      world.refresh();
      const skipped = kinds.length - fresh.length;
      const failed = fresh.length - added;
      toast.success(
        `Added ${added} ${plural(added, "note type")}${skipped ? `; ${skipped} this project already has ${skipped === 1 ? "was" : "were"} left as ${skipped === 1 ? "it is" : "they are"}` : ""}${failed ? `; ${failed} couldn't be read` : ""}.`,
      );
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setLoading(false);
    }
  };

  if (!modules.has("world")) {
    return (
      <div className="grid justify-items-center rounded-xl border bg-card px-6 py-12 text-center dot-grid">
        <span className="grid size-12 place-items-center rounded-2xl bg-ember/15 text-ember-ink">
          <Icon name="earth-linear" className="size-6" />
        </span>
        <p className="mt-4 font-display text-2xl">They come with the World bible</p>
        <p className="mt-1 max-w-sm text-ui-sm text-muted-foreground">Switch it on, and each note type you make gets its own section in the world bible and a place in the New menu.</p>
        {canManage ? (
          <button
            type="button"
            onClick={() => {
              // One dialog at a time: the offer replaces these settings.
              setUi({ projectSettings: false });
              offerModule("world");
            }}
            className="mt-5 flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-ui-sm text-background hover:bg-foreground/90"
          >
            <Icon name="earth-linear" className="size-4" />
            Turn on World bible
          </button>
        ) : (
          <div className="mt-5">
            <ManagersOnly />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <ul className="divide-y rounded-xl border bg-card">
        {types.map((type) => (
          <li key={type.id} className="flex items-center gap-3 px-3.5 py-2.5 text-ui-sm">
            <EntityIcon type={type} />
            <span className="min-w-0 flex-1 truncate font-medium">{type.name}</span>
            <span className="shrink-0 text-xs text-faint tabular-nums">
              {type.schema.length} {plural(type.schema.length, "field")}
            </span>
            <Tooltip content="Save it to a file, to load into another project">
              <button
                type="button"
                aria-label={`Save ${type.name} to a file`}
                onClick={() => downloadKinds(type.name, [type])}
                className="h-8 shrink-0 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Save
              </button>
            </Tooltip>
            {canEdit && (
              <button
                type="button"
                aria-label={`Edit ${type.name}`}
                onClick={() => setEditing({ type })}
                className="h-8 shrink-0 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Edit
              </button>
            )}
          </li>
        ))}
        {types.length === 0 && <li className="px-4 py-8 text-center text-xs text-muted-foreground">No note types of your own yet.</li>}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        {canEdit && (
          <button type="button" onClick={() => setEditing({ type: null })} className="flex h-8 w-fit items-center gap-1.5 rounded-md border bg-card px-3 text-ui-sm hover:bg-accent">
            <Icon name="add-linear" className="size-4" />
            New note type…
          </button>
        )}
        {canEdit && (
          <button type="button" disabled={loading} onClick={() => fileInput.current?.click()} className="flex h-8 w-fit items-center gap-1.5 rounded-md px-3 text-ui-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50">
            <Icon name="import-linear" className="size-4" />
            {loading ? "Loading…" : "Load note types from a file…"}
          </button>
        )}
        {types.length > 1 && (
          <button type="button" onClick={() => downloadKinds(`${project.title} note types`, types)} className="flex h-8 w-fit items-center gap-1.5 rounded-md px-3 text-ui-sm text-muted-foreground hover:bg-accent hover:text-foreground">
            <Icon name="export-linear" className="size-4" />
            Save them all to a file
          </button>
        )}
        <input ref={fileInput} type="file" accept=".json,application/json" className="hidden" onChange={(e) => (void load(e.target.files?.[0]), (e.target.value = ""))} />
      </div>
      {editing && (
        <EntityTypeDialog
          type={editing.type}
          // The dialog refetches the world data and tells everyone else itself.
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
