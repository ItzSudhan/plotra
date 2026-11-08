"use client"

import * as React from "react"
import { Button } from "./button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./dialog"
import { Input } from "./input"

// Styled replacements for window.confirm and window.prompt, callable from
// anywhere: `if (!(await confirm({ title: "Delete ‘Romance’?" }))) return;`.
// <DialogsHost /> is mounted once near the root; without it they fall back to
// the browser's own dialogs.

export type ConfirmOptions = {
  title: string
  description?: React.ReactNode
  /** Defaults to "Delete" when destructive, otherwise "Continue". */
  confirmLabel?: string
  cancelLabel?: string
  /** Red confirm button. Defaults to true. */
  destructive?: boolean
  /** Keeps the button off until this text is typed back. */
  typeToConfirm?: string
}

export type PromptOptions = {
  title: string
  description?: React.ReactNode
  label: string
  defaultValue?: string
  placeholder?: string
  confirmLabel?: string
  /** Returns a message to show when the value can't be used, or null when it can. */
  validate?: (value: string) => string | null
}

type Request =
  | { kind: "confirm"; options: ConfirmOptions; resolve: (ok: boolean) => void }
  | { kind: "prompt"; options: PromptOptions; resolve: (value: string | null) => void }

let enqueue: ((request: Request) => void) | null = null

function plain(node: React.ReactNode): string {
  return typeof node === "string" ? node : ""
}

/** Asks before doing something. Resolves true when the person confirms. */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  if (!enqueue) {
    return Promise.resolve(typeof window !== "undefined" && window.confirm([options.title, plain(options.description)].filter(Boolean).join("\n\n")))
  }
  return new Promise((resolve) => enqueue!({ kind: "confirm", options, resolve }))
}

/** Asks for a line of text. Resolves null when cancelled. */
export function promptText(options: PromptOptions): Promise<string | null> {
  if (!enqueue) {
    return Promise.resolve(typeof window !== "undefined" ? window.prompt(options.title, options.defaultValue ?? "") : null)
  }
  return new Promise((resolve) => enqueue!({ kind: "prompt", options, resolve }))
}

export function DialogsHost() {
  const [queue, setQueue] = React.useState<Request[]>([])
  const [typed, setTyped] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const current = queue[0]

  React.useEffect(() => {
    enqueue = (request) => setQueue((q) => [...q, request])
    return () => {
      enqueue = null
    }
  }, [])

  React.useEffect(() => {
    setError(null)
    setTyped(current?.kind === "prompt" ? (current.options.defaultValue ?? "") : "")
  }, [current])

  const finish = (value: boolean | string | null) => {
    if (!current) return
    if (current.kind === "confirm") current.resolve(value === true)
    else current.resolve(typeof value === "string" ? value : null)
    setQueue((q) => q.slice(1))
  }

  if (!current) return null

  if (current.kind === "confirm") {
    const o = current.options
    const destructive = o.destructive ?? true
    const ready = !o.typeToConfirm || typed.trim() === o.typeToConfirm.trim()
    return (
      <Dialog open onOpenChange={(open) => !open && finish(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{o.title}</DialogTitle>
            {o.description ? <DialogDescription>{o.description}</DialogDescription> : <DialogDescription className="sr-only">{o.title}</DialogDescription>}
          </DialogHeader>
          {o.typeToConfirm && (
            <label className="grid gap-1.5 text-sm">
              <span className="text-muted-foreground">
                Type <strong className="font-medium text-foreground">{o.typeToConfirm}</strong> to confirm.
              </span>
              <Input value={typed} autoFocus autoComplete="off" spellCheck={false} onChange={(e) => setTyped(e.target.value)} />
            </label>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => finish(false)}>
              {o.cancelLabel ?? "Cancel"}
            </Button>
            <Button
              variant={destructive ? "destructive" : "default"}
              size="sm"
              disabled={!ready}
              autoFocus={!o.typeToConfirm}
              onClick={() => finish(true)}
            >
              {o.confirmLabel ?? (destructive ? "Delete" : "Continue")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  const o = current.options
  const submit = () => {
    const value = typed.trim()
    const problem = o.validate ? o.validate(value) : value ? null : "This can't be empty."
    if (problem) {
      setError(problem)
      return
    }
    finish(value)
  }
  return (
    <Dialog open onOpenChange={(open) => !open && finish(null)}>
      <DialogContent className="sm:max-w-md">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <DialogHeader>
            <DialogTitle>{o.title}</DialogTitle>
            {o.description ? <DialogDescription>{o.description}</DialogDescription> : <DialogDescription className="sr-only">{o.title}</DialogDescription>}
          </DialogHeader>
          <label className="grid gap-1.5">
            <span className="text-ui-sm font-medium">{o.label}</span>
            <Input
              value={typed}
              autoFocus
              placeholder={o.placeholder}
              aria-invalid={error ? true : undefined}
              onChange={(e) => {
                setTyped(e.target.value)
                setError(null)
              }}
            />
            {error && (
              <span role="alert" className="text-meta text-destructive">
                {error}
              </span>
            )}
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => finish(null)}>
              Cancel
            </Button>
            <Button type="submit" size="sm">
              {o.confirmLabel ?? "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
