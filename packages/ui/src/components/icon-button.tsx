"use client"

import * as React from "react"
import { Icon, type IconName } from "@plotra/icons"
import { cn } from "../lib/utils"
import { Tooltip } from "./tooltip"

const sizes = {
  // Looks 24px for dense rows, but the hit area reaches 32px.
  xs: "size-6 rounded-md relative after:absolute after:-inset-1 after:content-[''] pointer-coarse:size-10 [&_svg]:size-3.5",
  sm: "size-8 rounded-md pointer-coarse:size-11 [&_svg]:size-4",
  md: "size-9 rounded-md pointer-coarse:size-11 [&_svg]:size-[18px]",
} as const

const variants = {
  ghost: "text-muted-foreground hover:bg-accent hover:text-foreground aria-pressed:bg-accent aria-pressed:text-foreground",
  outline: "border bg-background text-foreground hover:bg-accent",
  destructive: "text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
} as const

/**
 * A button that shows only an icon. `label` is required: it names the button
 * for screen readers and is shown as a tooltip on hover and focus.
 */
const IconButton = React.forwardRef<
  HTMLButtonElement,
  Omit<React.ComponentProps<"button">, "children"> & {
    label: string
    icon: IconName
    shortcut?: string
    size?: keyof typeof sizes
    variant?: keyof typeof variants
    tooltipSide?: "top" | "right" | "bottom" | "left"
    /** Extra content after the icon, such as a badge. */
    children?: React.ReactNode
  }
>(function IconButton(
  { label, icon, shortcut, size = "sm", variant = "ghost", tooltipSide, className, type = "button", children, ...props },
  ref,
) {
  return (
    <Tooltip content={label} shortcut={shortcut} side={tooltipSide}>
      <button
        ref={ref}
        type={type}
        aria-label={label}
        className={cn(
          "inline-flex shrink-0 items-center justify-center transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0",
          sizes[size],
          variants[variant],
          className,
        )}
        {...props}
      >
        <Icon name={icon} />
        {children}
      </button>
    </Tooltip>
  )
})

export { IconButton }
