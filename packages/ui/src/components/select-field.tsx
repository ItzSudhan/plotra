"use client"

import * as React from "react"
import { Select as SelectPrimitive } from "radix-ui"
import { Icon } from "@plotra/icons"
import { cn } from "../lib/utils"
import { SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator } from "./select"

/*
 * A styled stand-in for a native <select>. It takes the same <option> and
 * <optgroup> children, so swapping one in is a rename, but it opens our own
 * popover instead of the browser's menu.
 */

// Radix refuses "" as an item value, so the empty option travels under this key.
const EMPTY = "\u0000empty"
const toKey = (v: string) => (v === "" ? EMPTY : v)
const fromKey = (k: string) => (k === EMPTY ? "" : k)

type Option = { kind: "option"; value: string; label: React.ReactNode; disabled: boolean }
type Group = { kind: "group"; label: React.ReactNode; options: Option[] }

type OptionProps = { value?: string | number; disabled?: boolean; children?: React.ReactNode }
type GroupProps = { label?: React.ReactNode; children?: React.ReactNode }

function textOf(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return ""
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(textOf).join("")
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return textOf(node.props.children)
  return ""
}

function readOptions(children: React.ReactNode): Array<Option | Group> {
  const out: Array<Option | Group> = []
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return
    if (child.type === React.Fragment) {
      out.push(...readOptions((child.props as { children?: React.ReactNode }).children))
    } else if (child.type === "option") {
      const p = child.props as OptionProps
      out.push({ kind: "option", value: String(p.value ?? textOf(p.children)), label: p.children, disabled: !!p.disabled })
    } else if (child.type === "optgroup") {
      const p = child.props as GroupProps
      const options = readOptions(p.children).filter((o): o is Option => o.kind === "option")
      out.push({ kind: "group", label: p.label, options })
    }
  })
  return out
}

function SelectField({
  value,
  defaultValue,
  onValueChange,
  children,
  disabled,
  className,
  contentClassName,
  style,
  title,
  id,
  name,
  placeholder,
  open,
  defaultOpen,
  onOpenChange,
  autoFocus,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}: {
  value?: string | number
  defaultValue?: string | number
  onValueChange?: (value: string) => void
  /** <option> and <optgroup> elements, as for a native select. */
  children?: React.ReactNode
  disabled?: boolean
  className?: string
  contentClassName?: string
  style?: React.CSSProperties
  title?: string
  id?: string
  name?: string
  /** Shown when nothing is chosen and no option has an empty value. */
  placeholder?: React.ReactNode
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  autoFocus?: boolean
  "aria-label"?: string
  "aria-labelledby"?: string
}) {
  const items = readOptions(children)
  const flat = items.flatMap((i) => (i.kind === "group" ? i.options : [i]))

  const [inner, setInner] = React.useState(() => String(defaultValue ?? ""))
  const controlled = value !== undefined
  const current = controlled ? String(value) : inner

  // Like a native select, a value that matches nothing shows the first option.
  const shown = flat.find((o) => o.value === current) ?? (placeholder == null ? flat[0] : undefined)

  const renderOption = (o: Option) => (
    <SelectItem key={toKey(o.value)} value={toKey(o.value)} disabled={o.disabled} className="text-[13px] whitespace-pre">
      <span className="min-w-0 truncate">{o.label}</span>
    </SelectItem>
  )

  return (
    <SelectPrimitive.Root
      value={toKey(current)}
      onValueChange={(k) => {
        const next = fromKey(k)
        if (!controlled) setInner(next)
        onValueChange?.(next)
      }}
      disabled={disabled}
      name={name}
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
    >
      <SelectPrimitive.Trigger
        id={id}
        title={title}
        style={style}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        data-slot="select-field"
        className={cn(
          "inline-flex h-7 min-w-0 items-center justify-between gap-1 rounded-md border border-input bg-transparent px-2 text-left text-[13px] whitespace-nowrap outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60 data-[state=open]:border-ring",
          className
        )}
      >
        <span className={cn("min-w-0 truncate", !shown && "text-faint")}>{shown ? shown.label : placeholder}</span>
        <Icon name="alt-arrow-down-linear" className="size-3.5 shrink-0 opacity-50" />
      </SelectPrimitive.Trigger>
      <SelectContent
        position="popper"
        align="start"
        sideOffset={4}
        className={cn("max-h-[min(20rem,var(--radix-select-content-available-height))] max-w-[min(32rem,90vw)]", contentClassName)}
      >
        {items.map((item, i) =>
          item.kind === "group" ? (
            <SelectGroup key={`g${i}`}>
              {i > 0 && <SelectSeparator />}
              <SelectLabel>{item.label}</SelectLabel>
              {item.options.map(renderOption)}
            </SelectGroup>
          ) : (
            renderOption(item)
          )
        )}
      </SelectContent>
    </SelectPrimitive.Root>
  )
}

export { SelectField }
