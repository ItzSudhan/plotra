"use client"

import * as React from "react"
import { cn } from "../lib/utils"
import { Switch as SwitchPrimitive } from "radix-ui"

/**
 * An on/off switch, drawn and moving like iOS's: the knob stretches toward the
 * other side while it is held, and springs across when let go. It is its own
 * press feedback, so the app-wide press (apps/app/lib/press.ts) leaves it alone.
 */
function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-press="off"
      className={cn(
        "group/switch inline-flex h-[1.375rem] w-[2.375rem] shrink-0 cursor-pointer items-center rounded-full bg-input p-0.5 transition-colors duration-200 ease-out outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-ember",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block h-[1.125rem] w-[1.125rem] rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.12),0_3px_8px_rgb(0_0_0/0.12)] transition-[translate,width] duration-[470ms] ease-spring-snappy group-active/switch:w-[1.375rem] data-[state=checked]:translate-x-4 group-active/switch:data-[state=checked]:translate-x-3"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
