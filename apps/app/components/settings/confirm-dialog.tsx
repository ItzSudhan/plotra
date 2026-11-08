"use client";

import { Button } from "@plotra/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@plotra/ui/components/dialog";
import { Input } from "@plotra/ui/components/input";
import { useState } from "react";

/**
 * Wraps a destructive button in an "are you sure" step. With `typeToConfirm`,
 * the button stays off until that text is typed back, for things that can't be
 * undone and take a lot with them.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Delete",
  typeToConfirm,
  onConfirm,
}: {
  trigger: React.ReactNode;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  typeToConfirm?: string;
  /** Gets what was typed, when `typeToConfirm` asked for it. */
  onConfirm: (typed: string) => Promise<unknown> | void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [typed, setTyped] = useState("");
  const confirmed = !typeToConfirm || typed.trim() === typeToConfirm.trim();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setTyped("");
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {typeToConfirm && (
          <label className="grid gap-1.5 text-sm">
            <span className="text-muted-foreground">
              Type <strong className="font-medium text-foreground">{typeToConfirm}</strong> to confirm.
            </span>
            <Input value={typed} autoComplete="off" spellCheck={false} onChange={(e) => setTyped(e.target.value)} />
          </label>
        )}
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={pending || !confirmed}
            onClick={async () => {
              setPending(true);
              try {
                await onConfirm(typed);
                setOpen(false);
              } finally {
                setPending(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
