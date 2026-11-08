"use client";

import { IconButton } from "@plotra/ui/components/icon-button";
import { undoToast } from "@plotra/ui/components/sonner";
import { Tooltip } from "@plotra/ui/components/tooltip";
import { cn } from "@plotra/ui/lib/utils";
import { generateKeyBetween } from "fractional-indexing";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { STRINGS_NOTICE, useStrings } from "@/components/interactive/data";
import { downloadText } from "@/components/interactive/download";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { createString, deleteString, updateString, type StringRow } from "@/lib/interactive-actions";
import { exportFileName, toCsv } from "@/lib/interactive/export";
import { categoryLabel, MAX_CHAR_LIMIT, MAX_STRING_CATEGORY, MAX_STRING_TEXT, stringCategories, stringKeyProblem, textLength } from "@/lib/interactive/strings";
import { read } from "@/lib/read";
import { CommitInput, CommitTextarea, Divider, EmptyState, errorText, Field, fieldClass, ToolButton, Toolbar } from "./view-ui";
import { SelectField } from "@plotra/ui/components/select-field";
import { plural } from "@/lib/plural";

// Short-text fields (plan.md 2.8): UI text, item descriptions, captions and alt
// text. Each has a stable String ID, an optional character limit with a live
// count, and a preview in a box the size of the limit. The CSV export adds
// every dialogue's lines, so it's the project's whole string table.

/** Characters per line of the preview box. */
const PREVIEW_WIDTH = 32;

/** What a String ID is, said once for the column heading and the preview. */
const STRING_ID_HINT = "A name for this text that never changes, so the game's code can find it even when the words do.";

const overLimit = (text: string, limit: number | null) => limit !== null && textLength(text) > limit;

export function StringsView() {
  const { project, notify } = useWorkspace();
  const { data, refresh } = useStrings();
  const editable = project.actions.includes("edit");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // What's being typed in the selected row, so its preview keeps up.
  const [typing, setTyping] = useState<{ id: string; text: string } | null>(null);
  const [filter, setFilter] = useState("");
  const [naming, setNaming] = useState<string | null>(null);

  const rows = useMemo(() => data ?? [], [data]);
  const groups = useMemo(() => {
    const builtin: string[] = stringCategories.map((c) => c.id);
    const custom = [...new Set(rows.map((r) => r.category))].filter((c) => !builtin.includes(c)).sort((a, b) => a.localeCompare(b));
    const needle = filter.trim().toLowerCase();
    const shown = needle ? rows.filter((r) => r.key.toLowerCase().includes(needle) || r.text.toLowerCase().includes(needle)) : rows;
    return [...builtin, ...custom].map((category) => ({ category, rows: shown.filter((r) => r.category === category) }));
  }, [filter, rows]);
  const selected = rows.find((r) => r.id === selectedId);
  const tooLong = rows.filter((r) => overLimit(r.text, r.charLimit)).length;

  const changed = () => {
    notify(STRINGS_NOTICE);
    refresh();
  };
  const run = async <T,>(work: () => Promise<T>) => {
    try {
      const result = await work();
      changed();
      return result;
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  const add = async (category: string) => {
    const row = await run(() => createString(project.id, { category }));
    if (row) setSelectedId(row.id);
  };
  const save = (id: string, patch: Parameters<typeof updateString>[2]) => run(() => updateString(project.id, id, patch));

  /** Deletes a string at once, with an Undo that puts it back under the same ID. */
  const remove = async (row: StringRow) => {
    if (selectedId === row.id) setSelectedId(null);
    const done = await run(async () => {
      await deleteString(project.id, row.id);
      return true;
    });
    if (!done) return;
    undoToast(`Deleted ‘${row.key}’`, () =>
      void run(async () => {
        const made = await createString(project.id, { category: row.category, key: row.key, text: row.text, charLimit: row.charLimit });
        await updateString(project.id, made.id, { context: row.context, nodeId: row.nodeId, position: row.position });
      }),
    );
  };

  /** Swaps a row with its neighbour in the same category. */
  const move = (group: StringRow[], at: number, by: -1 | 1) => {
    const target = at + by;
    if (target < 0 || target >= group.length) return;
    const before = by === -1 ? group[target - 1] : group[target];
    const after = by === -1 ? group[target] : group[target + 1];
    try {
      void save(group[at].id, { position: generateKeyBetween(before?.position ?? null, after?.position ?? null) });
    } catch {
      toast.error("Couldn't move that string.");
    }
  };

  const exportCsv = async () => {
    try {
      const strings = await read("getProjectStrings", project.id);
      const header = ["id", "speaker", "text", "source", "context", "char_limit"];
      const body = strings.map((s) => [s.key, s.speaker, s.text, s.source, s.context, s.charLimit === null ? "" : String(s.charLimit)]);
      downloadText(exportFileName(`${project.title} strings`, "csv"), "text/csv", toCsv([header, ...body]));
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  if (!data) return null;

  return (
    <div className="flex h-full flex-col">
      <Toolbar>
        <ToolButton icon="add-linear" label="New string" disabled={!editable} onClick={() => void add(selected?.category ?? "ui")}>
          New string
        </ToolButton>
        {naming === null ? (
          <ToolButton icon="tag-linear" label="New category of your own" disabled={!editable} onClick={() => setNaming("")}>
            New category
          </ToolButton>
        ) : (
          <input
            autoFocus
            value={naming}
            maxLength={MAX_STRING_CATEGORY}
            aria-label="New category name"
            placeholder="Category name, then press Enter"
            onChange={(e) => setNaming(e.target.value)}
            onBlur={() => setNaming(null)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setNaming(null);
              if (e.key === "Enter" && naming.trim()) {
                // A category exists as long as it has a string in it, so it starts with one.
                void add(naming.trim());
                setNaming(null);
              }
            }}
            className={cn(fieldClass, "w-48")}
          />
        )}
        <Divider />
        <ToolButton icon="download-linear" label="Export every string and dialogue line as CSV" onClick={() => void exportCsv()}>
          Export CSV
        </ToolButton>
        <input value={filter} placeholder="Filter…" aria-label="Filter strings" onChange={(e) => setFilter(e.target.value)} className={cn(fieldClass, "ml-auto w-44")} />
        <span className="shrink-0 text-meta text-muted-foreground">
          {rows.length} {plural(rows.length, "string")}
          {tooLong > 0 && <span className="text-destructive"> · {tooLong} over the limit</span>}
        </span>
      </Toolbar>

      {rows.length === 0 ? (
        <EmptyState icon="text-field-focus-linear" title="No strings yet" action={editable && { label: "New string", onClick: () => void add("ui") }}>
          Short texts that have to fit somewhere: button labels, item descriptions, captions, alt text. Each gets an ID that the game&apos;s code uses to
          find it, and a character limit, and exports with the dialogue lines.
        </EmptyState>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1 overflow-auto">
            <table className="w-full min-w-[46rem] border-collapse text-ui-sm">
              <thead className="sticky top-0 z-10 bg-background text-left text-meta text-muted-foreground">
                <tr className="border-b">
                  <th className="w-56 px-3 py-1.5 font-medium">
                    <Tooltip content={STRING_ID_HINT}>
                      <span tabIndex={0} className="cursor-help rounded-sm underline decoration-dotted underline-offset-2 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
                        String ID
                      </span>
                    </Tooltip>
                  </th>
                  <th className="px-2 py-1.5 font-medium">Text</th>
                  <th className="w-20 px-2 py-1.5 text-right font-medium">Count</th>
                  <th className="w-20 px-2 py-1.5 font-medium">Limit</th>
                  <th className="w-52 px-2 py-1.5 font-medium">Context</th>
                  <th className="w-20" />
                </tr>
              </thead>
              {groups.map(
                (group) =>
                  // Built-in categories always show, so there's somewhere to add to; a filter hides the empty ones.
                  (group.rows.length > 0 || (!filter.trim() && stringCategories.some((c) => c.id === group.category))) && (
                    <tbody key={group.category}>
                      <tr className="border-b bg-muted/50">
                        <th colSpan={6} className="px-3 py-1 text-left font-medium">
                          <span className="flex items-center gap-2">
                            {categoryLabel(group.category)}
                            <span className="text-meta font-normal text-muted-foreground">{group.rows.length}</span>
                            {editable && (
                              <IconButton icon="add-linear" label={`New string in ${categoryLabel(group.category)}`} size="xs" onClick={() => void add(group.category)} />
                            )}
                          </span>
                        </th>
                      </tr>
                      {group.rows.map((row, at) => (
                        <Row
                          key={row.id}
                          row={row}
                          editable={editable}
                          selected={row.id === selectedId}
                          taken={rows.filter((r) => r.id !== row.id).map((r) => r.key)}
                          first={at === 0}
                          last={at === group.rows.length - 1}
                          // Reordering a filtered list would move a row past ones that aren't shown.
                          movable={!filter.trim()}
                          onSelect={() => setSelectedId(row.id)}
                          onTyping={(text) => setTyping({ id: row.id, text })}
                          onSave={(patch) => save(row.id, patch)}
                          onMove={(by) => move(group.rows, at, by)}
                          onDelete={() => void remove(row)}
                        />
                      ))}
                    </tbody>
                  ),
              )}
            </table>
          </div>
          {selected && (
            <Preview
              key={selected.id}
              row={selected}
              text={typing?.id === selected.id ? typing.text : selected.text}
              editable={editable}
              categories={groups.map((g) => g.category)}
              onSave={(patch) => save(selected.id, patch)}
              onClose={() => setSelectedId(null)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Row({
  row,
  editable,
  selected,
  taken,
  first,
  last,
  movable,
  onSelect,
  onTyping,
  onSave,
  onMove,
  onDelete,
}: {
  row: StringRow;
  editable: boolean;
  selected: boolean;
  /** Every other string's ID. */
  taken: string[];
  first: boolean;
  last: boolean;
  movable: boolean;
  onSelect: () => void;
  onTyping: (text: string) => void;
  onSave: (patch: Parameters<typeof updateString>[2]) => void;
  onMove: (by: -1 | 1) => void;
  onDelete: () => void;
}) {
  const [key, setKey] = useState(row.key);
  const [text, setText] = useState(row.text);
  const [synced, setSynced] = useState(row);
  if (row.key !== synced.key || row.text !== synced.text) {
    // Someone else changed it (or our own save came back).
    setSynced(row);
    setKey(row.key);
    setText(row.text);
  }
  const keyProblem = key !== row.key ? stringKeyProblem(key.trim(), taken) : null;
  const length = textLength(text);
  const over = row.charLimit !== null && length > row.charLimit;

  return (
    <tr onFocus={onSelect} onClick={onSelect} className={cn("group border-b align-top", selected && "bg-accent/50")}>
      <td className="px-3 py-1">
        <input
          value={key}
          disabled={!editable}
          spellCheck={false}
          aria-label="String ID"
          aria-invalid={!!keyProblem}
          title={keyProblem ?? undefined}
          onChange={(e) => setKey(e.target.value)}
          onBlur={() => {
            if (key === row.key) return;
            if (keyProblem) {
              toast.error(keyProblem);
              setKey(row.key);
            } else onSave({ key: key.trim() });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setKey(row.key);
          }}
          className={cn(fieldClass, "border-transparent font-mono text-xs hover:border-input", keyProblem && "border-destructive hover:border-destructive")}
        />
      </td>
      <td className="px-2 py-1">
        <textarea
          value={text}
          readOnly={!editable}
          rows={Math.min(6, Math.max(1, text.split("\n").length))}
          maxLength={MAX_STRING_TEXT}
          aria-label="Text"
          placeholder="Text"
          onChange={(e) => {
            setText(e.target.value);
            onTyping(e.target.value);
          }}
          onBlur={() => text !== row.text && onSave({ text })}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setText(row.text);
              onTyping(row.text);
            }
          }}
          className={cn(
            "block w-full resize-none rounded-md border border-transparent bg-transparent px-2 py-1 leading-snug outline-none placeholder:text-faint hover:border-input focus-visible:border-input focus-visible:ring-[3px] focus-visible:ring-ring/50",
            over && "border-destructive hover:border-destructive",
          )}
        />
      </td>
      <td className={cn("px-2 py-2 text-right font-mono text-xs whitespace-nowrap tabular-nums", over ? "font-semibold text-destructive" : "text-muted-foreground")}>
        {length}
        {row.charLimit !== null && ` / ${row.charLimit}`}
        {over && <span className="sr-only"> (too long)</span>}
      </td>
      <td className="px-2 py-1">
        <label className="contents">
          <span className="sr-only">Character limit</span>
          <CommitInput
            type="number"
            value={row.charLimit === null ? "" : String(row.charLimit)}
            disabled={!editable}
            placeholder="None"
            onCommit={(value) => onSave({ charLimit: value.trim() && Number(value) >= 1 ? Math.min(Math.floor(Number(value)), MAX_CHAR_LIMIT) : null })}
            className="border-transparent px-1.5 hover:border-input"
          />
        </label>
      </td>
      <td className="px-2 py-1">
        <label className="contents">
          <span className="sr-only">Context</span>
          <CommitInput
            value={row.context ?? ""}
            disabled={!editable}
            placeholder="Where it's shown"
            onCommit={(context) => onSave({ context })}
            className="border-transparent hover:border-input"
          />
        </label>
      </td>
      <td className="px-1 py-1.5">
        {editable && (
          <span className="flex justify-end opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100">
            <IconButton icon="alt-arrow-up-linear" label="Move up" size="xs" disabled={first || !movable} onClick={() => onMove(-1)} />
            <IconButton icon="alt-arrow-down-linear" label="Move down" size="xs" disabled={last || !movable} onClick={() => onMove(1)} />
            <IconButton icon="trash-bin-minimalistic-linear" label={`Delete ${row.key}`} size="xs" variant="destructive" onClick={onDelete} />
          </span>
        )}
      </td>
    </tr>
  );
}

function Preview({
  row,
  text,
  editable,
  categories,
  onSave,
  onClose,
}: {
  row: StringRow;
  /** The text as typed so far. */
  text: string;
  editable: boolean;
  categories: string[];
  onSave: (patch: Parameters<typeof updateString>[2]) => void;
  onClose: () => void;
}) {
  const limit = row.charLimit;
  const characters = Array.from(text);
  const fits = limit === null ? text : characters.slice(0, limit).join("");
  const spill = limit === null ? "" : characters.slice(limit).join("");
  const width = Math.min(limit ?? PREVIEW_WIDTH, PREVIEW_WIDTH);
  const lines = limit === null ? 1 : Math.ceil(limit / PREVIEW_WIDTH);

  return (
    <aside className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto border-l p-3 text-ui-sm">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate font-mono text-xs">{row.key}</p>
        <IconButton icon="close-linear" label="Close" size="xs" onClick={onClose} />
      </div>

      <div className="grid gap-1">
        <p className="text-meta font-medium text-muted-foreground">Preview</p>
        {/* The box holds exactly the limit in a fixed-width face; what spills out of it is over. */}
        <div className="overflow-x-auto rounded-md bg-muted p-3">
          <div
            className={cn("box-content rounded border bg-background px-2 py-1 font-mono text-xs leading-5 break-all whitespace-pre-wrap", spill && "border-destructive")}
            style={{ width: `${width}ch`, minHeight: `${lines * 1.25}rem` }}
          >
            {fits}
            {spill && <mark className="bg-destructive/20 text-destructive">{spill}</mark>}
            {!text && <span className="text-faint">Empty</span>}
          </div>
        </div>
        <p className={cn("text-xs", spill ? "font-medium text-destructive" : "text-muted-foreground")}>
          {limit === null
            ? `${characters.length} characters. Set a limit to see whether it fits.`
            : spill
              ? `${characters.length} of ${limit} characters: ${characters.length - limit} too many.`
              : `${characters.length} of ${limit} characters: ${limit - characters.length} left.`}
        </p>
      </div>

      <Field label="Category">
        <SelectField value={row.category} disabled={!editable} onValueChange={(v) => onSave({ category: v })} className={fieldClass}>
          {categories.map((category) => (
            <option key={category} value={category}>
              {categoryLabel(category)}
            </option>
          ))}
        </SelectField>
      </Field>

      <Field label="Context">
        <CommitTextarea
          value={row.context ?? ""}
          disabled={!editable}
          rows={3}
          placeholder="Where it's shown, and anything a translator should know"
          onCommit={(context) => onSave({ context })}
        />
      </Field>
    </aside>
  );
}
