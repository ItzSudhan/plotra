"use client";

import type { ProjectType } from "@plotra/db/schema";
import { Icon } from "@plotra/icons";
import { Input } from "@plotra/ui/components/input";
import { Label } from "@plotra/ui/components/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@plotra/ui/components/select";
import { formatMeta, moduleMeta, typeFormat, typeModules } from "@/lib/modules";
import { leadTypes, otherTypes } from "@/lib/onboarding/tracks";
import { projectTypeMeta } from "@/lib/project-types";

/**
 * Title and type of a new, blank project: the fields of the "New project"
 * dialog and of the welcome screen. Submitted as `title` and `type` to
 * `createProject` (lib/actions.ts).
 */
export function ProjectFields({
  type,
  onTypeChange,
  idPrefix = "project",
  autoFocus,
}: {
  type: ProjectType;
  onTypeChange: (type: ProjectType) => void;
  /** Keeps the field ids unique when the dialog and the welcome screen are on one page. */
  idPrefix?: string;
  autoFocus?: boolean;
}) {
  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-title`}>Title</Label>
        <Input id={`${idPrefix}-title`} name="title" placeholder="The Lantern Keepers" maxLength={120} required autoFocus={autoFocus} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-type`}>Type</Label>
        <Select name="type" value={type} onValueChange={(value) => onTypeChange(value as ProjectType)}>
          <SelectTrigger id={`${idPrefix}-type`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {/* The kinds Plotra is tested for first, then every other one (plan.md 8.1). */}
            <SelectGroup>
              {leadTypes.map(({ type: t }) => (
                <TypeItem key={t} type={t} />
              ))}
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Other kinds</SelectLabel>
              {otherTypes.map((t) => (
                <TypeItem key={t} type={t} />
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {typeModules[type].length ? `Starts with ${typeModules[type].map((id) => moduleMeta[id].label.toLowerCase()).join(", ")}` : "Starts with the essentials"}
          {typeFormat[type] !== "prose" && `; scenes are written as ${formatMeta[typeFormat[type]].label.toLowerCase()}`}. More tools are offered as you need them.
        </p>
      </div>
    </>
  );
}

function TypeItem({ type }: { type: ProjectType }) {
  return (
    <SelectItem value={type}>
      <Icon name={projectTypeMeta[type].icon} className="text-muted-foreground" />
      {projectTypeMeta[type].label}
    </SelectItem>
  );
}
