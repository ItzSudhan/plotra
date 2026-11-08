"use client";

import { Icon, type IconName } from "@plotra/icons";
import { Pill } from "@plotra/ui/components/pill";
import { cn } from "@plotra/ui/lib/utils";
import { useState } from "react";
import { swatches } from "@/lib/story";
import { errorText } from "@/lib/errors";
import { SelectField } from "@plotra/ui/components/select-field";
import { Tooltip } from "@plotra/ui/components/tooltip";

// Small controls shared by the story views' toolbars and side panels.

export function Toolbar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex h-11 shrink-0 items-center gap-1.5 overflow-x-auto border-b bg-background px-3 text-ui-sm", className)}>{children}</div>
  );
}

export function ToolButton({
  icon,
  label,
  onClick,
  disabled,
  pressed,
  shortcut,
  children,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  shortcut?: string;
  children?: React.ReactNode;
}) {
  const button = (
    <button
      type="button"
      aria-label={children ? undefined : label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        // 32px tall and at least 32px wide, bigger on touch screens.
        "flex h-8 min-w-8 shrink-0 items-center justify-center gap-1.5 rounded-md px-1.5 text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40 pointer-coarse:h-10 pointer-coarse:min-w-10",
        pressed && "bg-accent text-foreground",
      )}
    >
      <Icon name={icon} className="size-4" />
      {children}
    </button>
  );
  // A labelled button says what it does already; an icon alone gets a tooltip.
  return children && !shortcut ? button : <Tooltip content={label} shortcut={shortcut}>{button}</Tooltip>;
}

export function ToolbarSelect<T extends string>({
  value,
  onChange,
  options,
  label,
  disabled,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
      <span className="sr-only sm:not-sr-only">{label}</span>
      <SelectField
        value={value}
        disabled={disabled}
        onValueChange={(v) => onChange(v as T)}
        className="h-7 rounded-md border border-input bg-background px-1.5 text-ui-sm text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </SelectField>
    </label>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string }> }) {
  return (
    <div className="relative isolate flex shrink-0 rounded-md border border-input p-0.5">
      <Pill className="rounded bg-accent" />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn("h-6 rounded px-2 text-meta text-muted-foreground transition-colors", value === o.value && "text-foreground")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const Divider = () => <span className="mx-0.5 h-5 w-px shrink-0 bg-border" />;

export const fieldClass =
  "h-7 w-full min-w-0 rounded-md border border-input bg-transparent px-2 text-ui-sm outline-none placeholder:text-faint focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60";

/** An input that commits on blur or Enter, and resets on Escape. */
export function CommitInput({
  value,
  onCommit,
  placeholder,
  type = "text",
  disabled,
  className,
  invalid,
  maxLength,
  "aria-label": ariaLabel,
}: {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
  className?: string;
  invalid?: boolean;
  maxLength?: number;
  "aria-label"?: string;
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
      disabled={disabled}
      placeholder={placeholder}
      maxLength={maxLength}
      aria-label={ariaLabel}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setDraft(value);
      }}
      className={cn(fieldClass, invalid && "border-destructive", className)}
    />
  );
}

/** Multi-line version of CommitInput. */
export function CommitTextarea({
  value,
  onCommit,
  placeholder,
  disabled,
  rows = 3,
  className,
  "aria-label": ariaLabel,
}: {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
  className?: string;
  "aria-label"?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setDraft(value);
  }
  return (
    <textarea
      value={draft}
      rows={rows}
      readOnly={disabled}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setDraft(value);
          e.currentTarget.blur();
        }
      }}
      className={cn(
        "w-full resize-y rounded-md border border-input bg-transparent px-2 py-1.5 text-ui-sm leading-relaxed outline-none placeholder:text-faint focus-visible:ring-[3px] focus-visible:ring-ring/50",
        className,
      )}
    />
  );
}

/** What each swatch (lib/story) is called, for screen readers and tooltips. */
const swatchNames: Record<string, string> = {
  "#e2602a": "Ember",
  "#b98021": "Gold",
  "#2b8a3e": "Green",
  "#109a82": "Teal",
  "#1971c2": "Blue",
  "#5f3dc4": "Violet",
  "#9c36b5": "Purple",
  "#c2255c": "Rose",
  "#868e96": "Grey",
};

/** A swatch's name ("Teal"), or "Custom colour" for one that isn't in the set. */
export const swatchName = (colour: string) => swatchNames[colour.toLowerCase()] ?? "Custom colour";

export function Swatches({ value, onChange, allowNone = true }: { value: string | null | undefined; onChange: (c: string | null) => void; allowNone?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {swatches.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={swatchName(c)}
          aria-pressed={value === c}
          onClick={() => onChange(value === c && allowNone ? null : c)}
          className={cn("relative size-6 rounded-full ring-offset-2 ring-offset-popover outline-none after:absolute after:-inset-1 after:content-[''] focus-visible:ring-[3px] focus-visible:ring-ring/50 pointer-coarse:size-8", value === c && "ring-2 ring-foreground/50")}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="text-meta font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

/** What an empty view offers to do about being empty; left out for someone who can't do it. */
export type EmptyAction = { label: string; icon?: IconName; onClick: () => void };

/**
 * What a view shows when it has nothing to show (onboarding-plan.md 3): what
 * belongs here, and where there is one thing to do about it, a button that does it.
 */
export function EmptyState({ icon, title, action, children }: { icon: IconName; title: string; action?: EmptyAction | false; children?: React.ReactNode }) {
  return (
    <div className="grid h-full place-items-center p-6">
      <div className="max-w-sm text-center">
        <Icon name={icon} className="mx-auto size-10 text-faint" />
        <p className="mt-3 font-display text-2xl">{title}</p>
        {children && <div className="mt-1 text-sm text-muted-foreground">{children}</div>}
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="mx-auto mt-4 flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-sm text-background outline-none hover:bg-foreground/90 focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Icon name={action.icon ?? "add-linear"} className="size-4" />
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}

export { errorText };
