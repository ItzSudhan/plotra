import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Our own type sizes (globals.css: --text-ui, --text-ui-sm, --text-meta).
// Without this, tailwind-merge reads `text-ui-sm` as a colour and drops it
// when a real colour such as `text-muted-foreground` comes after it, so the
// text falls back to 16px.
const twMerge = extendTailwindMerge({
  extend: {
    theme: { text: ["ui", "ui-sm", "meta"] },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
