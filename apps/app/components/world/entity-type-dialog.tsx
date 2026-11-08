"use client";

import { propertyTypes, type EntityField, type PropertyType } from "@plotra/db/schema";
import { Icon } from "@plotra/icons";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@plotra/ui/components/dialog";
import { cn } from "@plotra/ui/lib/utils";
import { useState } from "react";
import { toast } from "sonner";
import { errorText, Field, fieldClass, Swatches } from "@/components/views/view-ui";
import { propertyTypeMeta } from "@/components/workspace/properties";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { createEntityType, deleteEntityType, updateEntityType, type EntityTypeRow } from "@/lib/world-actions";
import { galleryFor, type GalleryType } from "@/lib/entity-gallery";
import { entityIcons } from "@/lib/world";
import { useWorld, WORLD_NOTICE } from "./data";
import { useVocabulary } from "@/components/workspace/vocabulary";
import { SelectField } from "@plotra/ui/components/select-field";
import { confirm } from "@plotra/ui/components/dialogs";
import { IconButton } from "@plotra/ui/components/icon-button";
import { Tooltip } from "@plotra/ui/components/tooltip";
import { pluralOf } from "@/lib/plural";


/** Kinds a "link to note" field can be limited to. */
const linkKinds = ["character", "location", "scene", "chapter", "research", "note", "entity"] as const;

/**
 * Creates or edits a custom world-bible type (plan.md 2.8 "Entity types with
 * custom schemas"): its name, look and the fields every page of it has.
 */
export function EntityTypeDialog({ type, onClose }: { type: EntityTypeRow | null; onClose: (saved?: EntityTypeRow) => void }) {
  const { project, binder, notify } = useWorkspace();
  const words = useVocabulary();
  const { refresh, data } = useWorld();
  // A new type can start from the gallery (lib/entity-gallery.ts): the ones this project hasn't got.
  const gallery = type ? [] : galleryFor((data?.entityTypes ?? []).map((t) => t.name));
  const [from, setFrom] = useState<string | null>(null);
  const startFrom = (pick: GalleryType) => {
    setFrom(pick.name);
    setName(pick.name);
    setPlural(pick.plural);
    setIcon(pick.icon);
    setColor(pick.color);
    setFields(pick.schema);
  };
  const [name, setName] = useState(type?.name ?? "");
  const [plural, setPlural] = useState(type?.plural ?? "");
  const [icon, setIcon] = useState(type?.icon ?? entityIcons[2]);
  const [color, setColor] = useState(type?.color ?? "#1971c2");
  const [fields, setFields] = useState<EntityField[]>(type?.schema ?? []);
  const [busy, setBusy] = useState(false);

  const patchField = (i: number, change: Partial<EntityField>) => setFields((all) => all.map((f, j) => (j === i ? { ...f, ...change } : f)));
  const moveField = (i: number, by: -1 | 1) =>
    setFields((all) => {
      const j = i + by;
      if (j < 0 || j >= all.length) return all;
      const next = [...all];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const changed = () => {
    refresh();
    notify(WORLD_NOTICE);
  };

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const input = { name, plural: plural.trim() || pluralOf(name.trim()), icon, color, schema: fields.filter((f) => f.label.trim()) };
      const saved = type ? await updateEntityType(project.id, type.id, input) : await createEntityType(project.id, input);
      changed();
      onClose(saved);
    } catch (error) {
      toast.error(errorText(error));
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!type) return;
    const count = binder.get().nodes.filter((n) => n.entityTypeId === type.id && !n.deletedAt).length;
    const ok = await confirm({
      title: `Delete the type ‘${type.name}’?`,
      description:
        count > 0
          ? `Its ${count} ${count === 1 ? "note stays" : "notes stay"} in the binder as plain notes, but lose this type and its fields.`
          : "No notes use it yet.",
      confirmLabel: "Delete type",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const converted = await deleteEntityType(project.id, type.id);
      if (converted.length) binder.upsert(...converted);
      changed();
      notify("binder");
      onClose();
    } catch (error) {
      toast.error(errorText(error));
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{type ? `Edit ${type.name}` : "New type"}</DialogTitle>
          <DialogDescription>
            A type of thing in your world: a faction, a costume, a spell, a case. Each one is a normal note, with these fields in its properties.
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[65vh] gap-4 overflow-y-auto pr-1">
          {gallery.length > 0 && (
            <div role="group" aria-labelledby="entity-gallery" className="grid gap-1">
              <span id="entity-gallery" className="text-meta font-medium text-muted-foreground">
                Start from
              </span>
              <div className="flex flex-wrap gap-1">
                {gallery.map((pick) => (
                  <Tooltip key={pick.name} content={pick.hint}>
                    <button
                      type="button"
                      aria-pressed={from === pick.name}
                      onClick={() => startFrom(pick)}
                      className={cn(
                        "inline-flex h-8 items-center gap-1.5 rounded-md border px-2 text-xs hover:bg-accent",
                        from === pick.name && "border-ember bg-accent",
                      )}
                    >
                      <span style={{ color: pick.color }} className="inline-flex">
                        <Icon name={pick.icon} className="size-3.5" />
                      </span>
                      {pick.name}
                    </button>
                  </Tooltip>
                ))}
              </div>
              <p className="mt-1 text-xs text-faint">{from ? gallery.find((g) => g.name === from)?.hint : "Pick one to fill in its fields, then change what you like. Or start from nothing below."}</p>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name">
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Faction" maxLength={80} className={fieldClass} />
            </Field>
            <Field label="Plural">
              <input value={plural} onChange={(e) => setPlural(e.target.value)} placeholder={name.trim() ? pluralOf(name.trim()) : "Factions"} maxLength={80} className={fieldClass} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <Field label="Icon">
              <div className="flex flex-wrap gap-1">
                {entityIcons.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-label={option.replace(/-linear$/, "").replaceAll("-", " ")}
                    aria-pressed={icon === option}
                    onClick={() => setIcon(option)}
                    className={cn("grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground", icon === option && "bg-accent text-foreground ring-1 ring-ring")}
                    style={icon === option ? { color } : undefined}
                  >
                    <Icon name={option} className="size-4" />
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Colour">
              <Swatches value={color} allowNone={false} onChange={(c) => c && setColor(c)} />
            </Field>
          </div>

          <Field label="Fields">
            <div className="grid gap-1.5">
              {fields.length === 0 && <p className="text-xs text-faint">No fields yet. Its notes still have a body, tags, a synopsis and canon status.</p>}
              {fields.map((field, i) => (
                <div key={i} className="grid gap-1.5 rounded-md border p-1.5">
                  <div className="flex items-center gap-1.5">
                    <input
                      value={field.label}
                      onChange={(e) => patchField(i, { label: e.target.value })}
                      placeholder="Field name"
                      aria-label="Field name"
                      maxLength={60}
                      className={cn(fieldClass, "flex-1")}
                    />
                    <SelectField
                      value={field.type}
                      // Changing a saved field's type would strand the values pages already have.
                      disabled={Boolean(field.key)}
                      onValueChange={(v) => patchField(i, { type: v as PropertyType, options: {} })}
                      className={cn(fieldClass, "w-36")}
                      aria-label="Field type"
                    >
                      {propertyTypes.map((t) => (
                        <option key={t} value={t}>
                          {propertyTypeMeta[t].label}
                        </option>
                      ))}
                    </SelectField>
                    <RowButton label="Move up" icon="alt-arrow-up-linear" disabled={i === 0} onClick={() => moveField(i, -1)} />
                    <RowButton label="Move down" icon="alt-arrow-down-linear" disabled={i === fields.length - 1} onClick={() => moveField(i, 1)} />
                    <RowButton label="Remove field" icon="trash-bin-minimalistic-linear" onClick={() => setFields((all) => all.filter((_, j) => j !== i))} />
                  </div>
                  {(field.type === "select" || field.type === "multi_select") && (
                    <input
                      value={(field.options?.choices ?? []).join(", ")}
                      onChange={(e) => patchField(i, { options: { choices: e.target.value.split(",").map((c) => c.trimStart()) } })}
                      onBlur={(e) => patchField(i, { options: { choices: e.target.value.split(",").map((c) => c.trim()).filter(Boolean) } })}
                      placeholder="Choices, separated by commas"
                      aria-label="Choices"
                      className={fieldClass}
                    />
                  )}
                  {field.type === "node" && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-muted-foreground">
                      <span>Links to:</span>
                      {linkKinds.map((kind) => {
                        const kinds = field.options?.nodeKinds ?? [];
                        return (
                          <label key={kind} className="flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={kinds.includes(kind)}
                              onChange={(e) =>
                                patchField(i, { options: { ...field.options, nodeKinds: e.target.checked ? [...kinds, kind] : kinds.filter((k) => k !== kind) } })
                              }
                            />
                            {words.label(kind)}
                          </label>
                        );
                      })}
                      <label className="ml-auto flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={Boolean(field.options?.multiple)}
                          onChange={(e) => patchField(i, { options: { ...field.options, multiple: e.target.checked } })}
                        />
                        Several
                      </label>
                    </div>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setFields((all) => [...all, { key: "", label: "", type: "text" }])}
                className="flex h-7 w-fit items-center gap-1.5 rounded-md px-2 text-ui-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Icon name="add-linear" className="size-3.5" />
                Add a field
              </button>
            </div>
          </Field>
        </div>
        <div className="flex items-center justify-between gap-2">
          {type ? (
            <button type="button" disabled={busy} onClick={() => void remove()} className="h-9 rounded-md px-3 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50">
              Delete type
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => onClose()} className="h-9 rounded-md px-3 text-sm hover:bg-accent">
              Cancel
            </button>
            <button type="button" disabled={busy || !name.trim()} onClick={() => void save()} className="h-9 rounded-md bg-foreground px-4 text-sm text-background disabled:opacity-50">
              {type ? "Save" : "Create type"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RowButton({ label, icon, onClick, disabled }: { label: string; icon: React.ComponentProps<typeof Icon>["name"]; onClick: () => void; disabled?: boolean }) {
  return <IconButton label={label} icon={icon} disabled={disabled} onClick={onClick} />;
}
