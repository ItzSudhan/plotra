"use client";

import type { CalendarDefinition } from "@plotra/db/schema";
import { Icon } from "@plotra/icons";
import { confirm } from "@plotra/ui/components/dialogs";
import { IconButton } from "@plotra/ui/components/icon-button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@plotra/ui/components/dialog";
import { cn } from "@plotra/ui/lib/utils";
import { useState } from "react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { formatDate, parseStoryDate } from "@/lib/calendar";
import { deleteCalendar, saveCalendar, type CalendarRow } from "@/lib/story-actions";
import { errorText, fieldClass } from "./view-ui";

// Custom calendars for fantasy and historical timelines (plan.md 2.5): months
// with their own lengths, the length of a day, and named eras.

const blank: CalendarDefinition = {
  months: Array.from({ length: 12 }, (_, i) => ({ name: `Month ${i + 1}`, days: 30 })),
  hoursPerDay: 24,
  eras: [],
};

export function CalendarDialog({
  calendars,
  canEdit,
  onClose,
  onSaved,
}: {
  calendars: CalendarRow[];
  canEdit: boolean;
  onClose: () => void;
  onSaved: (selectId: string | null) => void;
}) {
  const { project } = useWorkspace();
  const [editing, setEditing] = useState<{ id?: string; name: string; definition: CalendarDefinition } | null>(
    calendars.length ? null : { name: "New calendar", definition: blank },
  );
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      const saved = await saveCalendar(project.id, editing);
      onSaved(editing.id ? null : saved.id);
      setEditing(null);
      toast.success("Calendar saved.");
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const def = editing?.definition;
  const setDef = (patch: Partial<CalendarDefinition>) => editing && setEditing({ ...editing, definition: { ...editing.definition, ...patch } });
  const preview = editing ? { id: "preview", name: editing.name, definition: editing.definition } : null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Calendars</DialogTitle>
          <DialogDescription>
            Invent the months, days and eras of your world. Story dates are written as year-month-day (e.g. 312-04-17), using these months.
          </DialogDescription>
        </DialogHeader>
        {!editing ? (
          <div className="grid gap-2">
            {calendars.map((c) => (
              <div key={c.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <Icon name="calendar-linear" className="size-4 text-muted-foreground" />
                <span className="flex-1 truncate">{c.name}</span>
                <span className="text-xs text-faint">
                  {c.definition.months.length} months · {c.definition.hoursPerDay}h days
                </span>
                {canEdit && (
                  <>
                    <button type="button" onClick={() => setEditing({ ...c })} className="h-8 rounded-md px-2 text-ui-sm outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50">
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await confirm({
                          title: `Delete the calendar ‘${c.name}’?`,
                          description: "Timelines that use it go back to the ordinary calendar. Story dates written in it stay as they are, but may read differently.",
                          confirmLabel: "Delete calendar",
                        });
                        if (!ok) return;
                        try {
                          await deleteCalendar(project.id, c.id);
                          onSaved(null);
                        } catch (error) {
                          toast.error(errorText(error));
                        }
                      }}
                      className="h-8 rounded-md px-2 text-ui-sm text-destructive outline-none hover:bg-destructive/10 focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            ))}
            {canEdit && (
              <button
                type="button"
                onClick={() => setEditing({ name: "New calendar", definition: blank })}
                className="flex h-9 items-center justify-center gap-1.5 rounded-md border border-dashed text-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <Icon name="calendar-add-linear" className="size-4" />
                New calendar
              </button>
            )}
          </div>
        ) : (
          <div className="grid min-h-0 gap-4 overflow-y-auto pr-1">
            <div className="grid grid-cols-[1fr_8rem] gap-2">
              <label className="grid gap-1 text-xs text-muted-foreground">
                Name
                <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className={fieldClass} />
              </label>
              <label className="grid gap-1 text-xs text-muted-foreground">
                Hours per day
                <input
                  type="number"
                  min={1}
                  value={def!.hoursPerDay}
                  onChange={(e) => setDef({ hoursPerDay: Number(e.target.value) })}
                  className={fieldClass}
                />
              </label>
            </div>
            <div className="grid gap-1.5">
              <p className="text-meta font-medium text-muted-foreground">Months</p>
              {def!.months.map((m, i) => (
                <div key={i} className="grid grid-cols-[1.5rem_1fr_5rem_2rem] items-center gap-1.5">
                  <span className="text-right text-xs text-faint tabular-nums">{i + 1}</span>
                  <input
                    value={m.name}
                    aria-label={`Name of month ${i + 1}`}
                    onChange={(e) => setDef({ months: def!.months.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })}
                    className={fieldClass}
                  />
                  <input
                    type="number"
                    min={1}
                    value={m.days}
                    aria-label={`Days in ${m.name}`}
                    onChange={(e) => setDef({ months: def!.months.map((x, j) => (j === i ? { ...x, days: Number(e.target.value) } : x)) })}
                    className={fieldClass}
                  />
                  <IconButton
                    icon="close-linear"
                    label={`Remove ${m.name || `month ${i + 1}`}`}
                    disabled={def!.months.length <= 1}
                    onClick={() => setDef({ months: def!.months.filter((_, j) => j !== i) })}
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() => setDef({ months: [...def!.months, { name: `Month ${def!.months.length + 1}`, days: 30 }] })}
                className="h-8 justify-self-start rounded-md px-2 text-ui-sm text-muted-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                + Add month
              </button>
            </div>
            <div className="grid gap-1.5">
              <p className="text-xs text-muted-foreground">Eras (optional): years are counted from each era&apos;s first year</p>
              {(def!.eras ?? []).map((era, i) => (
                <div key={i} className="grid grid-cols-[1fr_7rem_2rem] items-center gap-1.5">
                  <input
                    value={era.name}
                    aria-label={`Name of era ${i + 1}`}
                    placeholder="e.g. AE"
                    onChange={(e) => setDef({ eras: def!.eras!.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })}
                    className={fieldClass}
                  />
                  <input
                    type="number"
                    value={era.startYear}
                    aria-label={`Era ${i + 1} starts in year`}
                    onChange={(e) => setDef({ eras: def!.eras!.map((x, j) => (j === i ? { ...x, startYear: Number(e.target.value) } : x)) })}
                    className={fieldClass}
                  />
                  <IconButton icon="close-linear" label={`Remove ${era.name || `era ${i + 1}`}`} onClick={() => setDef({ eras: def!.eras!.filter((_, j) => j !== i) })} />
                </div>
              ))}
              <button
                type="button"
                onClick={() => setDef({ eras: [...(def!.eras ?? []), { name: "", startYear: 0 }] })}
                className="h-8 justify-self-start rounded-md px-2 text-ui-sm text-muted-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                + Add era
              </button>
            </div>
            {preview && (
              <p className={cn("rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground")}>
                Example: 312-02-05 reads as{" "}
                <span className="text-foreground">{formatDate(preview, parseStoryDate(preview, "312-02-05") ?? 0, "day")}</span>
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => (calendars.length ? setEditing(null) : onClose())} className="h-8 rounded-md px-3 text-sm outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50">
                Cancel
              </button>
              <button type="button" disabled={busy} onClick={() => void save()} className="h-8 rounded-md bg-foreground px-3 text-sm text-background outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50">
                Save calendar
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
