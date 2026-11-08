"use client"

import * as React from "react"
import { cn } from "../lib/utils"

/**
 * The highlight behind the chosen tab or segment, which slides over to the
 * next one rather than jumping, as a segmented control does on a Mac. Put it
 * inside a `relative isolate` row of buttons and give it a colour; it follows
 * whichever button has aria-selected or aria-pressed set to true (or link with
 * aria-current="page"), and hides when none has. `underline` draws a bar along
 * the chosen one's foot instead.
 */
function Pill({
  className,
  underline = false,
}: {
  className?: string
  underline?: boolean
}) {
  const ref = React.useRef<HTMLSpanElement>(null)

  React.useLayoutEffect(() => {
    const pill = ref.current
    const row = pill?.parentElement
    if (!pill || !row) return
    let shown = false
    const place = () => {
      const chosen = row.querySelector<HTMLElement>(
        ':scope > [aria-selected="true"], :scope > [aria-pressed="true"], :scope > [aria-current="page"]'
      )
      if (!chosen) {
        pill.style.opacity = "0"
        shown = false
        return
      }
      const height = underline ? 2 : chosen.offsetHeight
      const top = underline
        ? chosen.offsetTop + chosen.offsetHeight - height
        : chosen.offsetTop
      // It appears in place the first time, rather than sliding in from the corner.
      if (!shown) pill.style.transition = "none"
      pill.style.translate = `${chosen.offsetLeft}px ${top}px`
      pill.style.width = `${chosen.offsetWidth}px`
      pill.style.height = `${height}px`
      pill.style.opacity = "1"
      if (!shown) {
        pill.getBoundingClientRect()
        pill.style.transition = ""
        shown = true
      }
    }
    place()
    const changes = new MutationObserver(place)
    changes.observe(row, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["aria-selected", "aria-pressed", "aria-current"],
    })
    const sizes = new ResizeObserver(place)
    sizes.observe(row)
    for (const child of row.children) sizes.observe(child)
    return () => {
      changes.disconnect()
      sizes.disconnect()
    }
  }, [underline])

  return (
    <span
      ref={ref}
      aria-hidden
      data-slot="pill"
      className={cn(
        "pointer-events-none absolute top-0 left-0 -z-10 opacity-0 transition-[translate,width,height] duration-[470ms] ease-spring-snappy",
        className
      )}
    />
  )
}

export { Pill }
