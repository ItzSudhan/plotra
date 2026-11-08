"use client"

import { Icon } from "@plotra/icons"
import { useTheme } from "next-themes"
import { Toaster as Sonner, toast, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <Icon name="check-circle-linear" className="size-4" />,
        info: <Icon name="info-circle-linear" className="size-4" />,
        warning: <Icon name="danger-triangle-linear" className="size-4" />,
        error: <Icon name="danger-circle-linear" className="size-4" />,
        loading: <Icon name="refresh-linear" className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

/**
 * Says something just happened and offers to take it back, for deletes and
 * other changes that can be reversed: "Moved ‘Chapter 3’ to Trash · Undo".
 */
function undoToast(message: string, onUndo: () => unknown, options: { duration?: number; description?: string } = {}) {
  return toast(message, {
    description: options.description,
    duration: options.duration ?? 7000,
    action: { label: "Undo", onClick: () => void onUndo() },
  })
}

export { Toaster, undoToast }
