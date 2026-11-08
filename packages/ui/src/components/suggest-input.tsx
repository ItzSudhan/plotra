"use client"

import * as React from "react"
import { Popover as PopoverPrimitive } from "radix-ui"
import { cn } from "../lib/utils"

/*
 * A text input with a styled suggestion list, in place of a native <datalist>.
 * Focus never leaves the input, so fields that save on blur keep working:
 * picking a suggestion only fills the text in, as a datalist does.
 */

// Set the value the way typing does, so the caller's onChange runs.
function fill(input: HTMLInputElement, text: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
  setter?.call(input, text)
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

function SuggestInput({
  suggestions,
  ref,
  onChange,
  onFocus,
  onBlur,
  onKeyDown,
  ...props
}: React.ComponentProps<"input"> & { suggestions: readonly string[] }) {
  const input = React.useRef<HTMLInputElement | null>(null)
  const listId = React.useId()
  const [open, setOpen] = React.useState(false)
  const [active, setActive] = React.useState(-1)

  const text = String(props.value ?? "").trim().toLowerCase()
  const matches = React.useMemo(
    () => suggestions.filter((s) => s.toLowerCase() !== text && s.toLowerCase().includes(text)).slice(0, 50),
    [suggestions, text]
  )
  const show = open && !props.disabled && matches.length > 0

  const setRef = (el: HTMLInputElement | null) => {
    input.current = el
    if (typeof ref === "function") ref(el)
    else if (ref) ref.current = el
  }

  const pick = (s: string) => {
    if (input.current) fill(input.current, s)
    setOpen(false)
    setActive(-1)
  }

  return (
    <PopoverPrimitive.Root open={show} onOpenChange={(o) => !o && setOpen(false)}>
      <PopoverPrimitive.Anchor asChild>
        <input
          {...props}
          ref={setRef}
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={show}
          aria-controls={show ? listId : undefined}
          aria-activedescendant={show && active >= 0 ? `${listId}-${active}` : undefined}
          onChange={(e) => {
            setOpen(true)
            setActive(-1)
            onChange?.(e)
          }}
          onFocus={(e) => {
            setOpen(true)
            onFocus?.(e)
          }}
          onBlur={(e) => {
            setOpen(false)
            setActive(-1)
            onBlur?.(e)
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault()
              if (!show) return setOpen(true)
              const step = e.key === "ArrowDown" ? 1 : -1
              return setActive((a) => (a + step + matches.length) % matches.length)
            }
            if (show && e.key === "Enter" && active >= 0) {
              e.preventDefault()
              return pick(matches[active]!)
            }
            if (show && e.key === "Escape") {
              e.preventDefault()
              e.stopPropagation()
              return setOpen(false)
            }
            onKeyDown?.(e)
          }}
        />
      </PopoverPrimitive.Anchor>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            if (e.target === input.current) e.preventDefault()
          }}
          className="z-50 max-h-[min(16rem,var(--radix-popover-content-available-height))] max-w-[min(24rem,90vw)] min-w-(--radix-popover-trigger-width) overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out"
        >
          <div role="listbox" id={listId}>
            {matches.map((s, i) => (
              <div
                key={s}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                // Keep focus in the input so its blur doesn't fire mid-pick.
                onMouseDown={(e) => e.preventDefault()}
                onMouseMove={() => setActive(i)}
                onClick={() => pick(s)}
                className={cn(
                  "cursor-default truncate rounded-sm px-2 py-1.5 text-[13px] select-none",
                  i === active && "bg-accent text-accent-foreground"
                )}
              >
                {s}
              </div>
            ))}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

export { SuggestInput }
