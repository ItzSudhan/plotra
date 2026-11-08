"use client";

import type { NodeKind } from "@plotra/db/schema";
import { cn } from "@plotra/ui/lib/utils";
import { useMemo } from "react";
import { fieldClass } from "@/components/views/view-ui";
import { useStore } from "@/components/workspace/stores";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { ancestors, flatten } from "@/lib/tree";
import { SelectField } from "@plotra/ui/components/select-field";

/** A plain select of binder notes, labelled with their folder path. */
export function NodeSelect({
  value,
  onChange,
  kinds,
  placeholder,
  disabled,
  className,
  label,
}: {
  value: string | null;
  onChange: (nodeId: string | null) => void;
  /** Limit the choice to these kinds; folders are never offered unless listed. */
  kinds?: NodeKind[];
  placeholder: string;
  disabled?: boolean;
  className?: string;
  label: string;
}) {
  const { binder } = useWorkspace();
  const { index } = useStore(binder);
  const options = useMemo(
    () =>
      flatten(index)
        .filter((n) => (kinds ? kinds.includes(n.kind) : n.kind !== "folder"))
        .map((n) => ({ id: n.id, label: [...ancestors(index, n.id).slice(-1).map((a) => a.title), n.title].join(" / ") })),
    [index, kinds],
  );
  return (
    <SelectField value={value ?? ""} disabled={disabled} aria-label={label} onValueChange={(v) => onChange(v || null)} className={cn(fieldClass, className)}>
      <option value="">{placeholder}</option>
      {/* Keep a value the list no longer offers (trashed, or of another kind now). */}
      {value && !options.some((o) => o.id === value) && <option value={value}>{index.byId.get(value)?.title ?? "A note you can't see"}</option>}
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </SelectField>
  );
}
