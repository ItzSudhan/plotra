"use client"

import * as React from "react"
import { cn } from "../lib/utils"

/**
 * A form field with a visible label and an optional hint. The label wraps the
 * control, so clicking it focuses the control and screen readers announce it.
 */
function Field({
  label,
  hint,
  className,
  children,
}: {
  label: React.ReactNode
  hint?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <label className={cn("grid gap-1.5", className)}>
      <span className="text-ui-sm font-medium text-foreground">{label}</span>
      {children}
      {hint && <span className="text-meta text-muted-foreground">{hint}</span>}
    </label>
  )
}

export { Field }
