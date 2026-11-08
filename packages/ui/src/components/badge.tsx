import * as React from "react"
import { cn } from "../lib/utils"

const tones = {
  neutral: "bg-muted text-muted-foreground",
  ember: "bg-ember/12 text-ember-ink",
  teal: "bg-teal/12 text-teal-ink",
  gold: "bg-gold/14 text-gold-ink",
  rose: "bg-rose/12 text-rose-ink",
  violet: "bg-violet/12 text-violet-ink",
  destructive: "bg-destructive/10 text-destructive",
} as const

export type BadgeTone = keyof typeof tones

/** A small label: a status, a count, a mode. 12px, with text colours that pass contrast. */
function Badge({ tone = "neutral", className, ...props }: React.ComponentProps<"span"> & { tone?: BadgeTone }) {
  return (
    <span
      data-slot="badge"
      className={cn("inline-flex h-5 shrink-0 items-center gap-1 rounded-md px-1.5 text-meta font-medium whitespace-nowrap", tones[tone], className)}
      {...props}
    />
  )
}

export { Badge }
