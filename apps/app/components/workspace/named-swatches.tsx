"use client";

import { Tooltip } from "@plotra/ui/components/tooltip";
import { cn } from "@plotra/ui/lib/utils";
import { colourName } from "./settings-helpers";

/** A row of colour choices, each named ("Rose", "Teal") and at least 24px. */
export function NamedSwatches({
  colours,
  value,
  onChange,
  label,
  disabled,
  className,
}: {
  colours: readonly string[];
  value: string | null | undefined;
  onChange: (colour: string) => void;
  /** Names the group: "Colour of Needs research". */
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex flex-wrap gap-1", className)}>
      {colours.map((colour) => {
        const chosen = value?.toLowerCase() === colour.toLowerCase();
        return (
          <Tooltip key={colour} content={colourName(colour)}>
            <button
              type="button"
              role="radio"
              aria-checked={chosen}
              aria-label={colourName(colour)}
              disabled={disabled}
              onClick={() => onChange(colour)}
              className="group grid size-7 place-items-center rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60 pointer-coarse:size-10"
            >
              <span
                className={cn("size-6 rounded-full ring-offset-2 ring-offset-card transition-transform", chosen ? "ring-2 ring-foreground/60" : "group-enabled:group-hover:scale-110")}
                style={{ backgroundColor: colour }}
              />
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
