"use client"

import * as React from "react"
import { Tooltip as TooltipPrimitive } from "radix-ui"
import { cn } from "../lib/utils"

/** Mounted once near the root. Tooltips show after a short pause, and at once when moving between them. */
function TooltipProvider({ children, delayDuration = 350 }: { children: React.ReactNode; delayDuration?: number }) {
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration} skipDelayDuration={250}>
      {children}
    </TooltipPrimitive.Provider>
  )
}

/**
 * A styled tooltip that also shows on keyboard focus. Wrap one focusable
 * element. `shortcut` is shown dimmed after the text, e.g. "⌘P".
 */
function Tooltip({
  content,
  shortcut,
  side = "top",
  align = "center",
  children,
  disabled,
}: {
  content: React.ReactNode
  shortcut?: string
  side?: "top" | "right" | "bottom" | "left"
  align?: "start" | "center" | "end"
  children: React.ReactElement
  disabled?: boolean
}) {
  if (disabled || content == null || content === "") return children
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            "z-[100] max-w-xs rounded-md bg-foreground px-2 py-1 text-xs leading-snug text-background shadow-md",
            "data-[state=delayed-open]:animate-fade-in data-[state=instant-open]:animate-fade-in data-[state=closed]:animate-fade-out",
          )}
        >
          {content}
          {shortcut && <span className="ml-2 opacity-70">{shortcut}</span>}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

export { Tooltip, TooltipProvider }
