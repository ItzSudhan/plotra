"use client";

import { useCallback, useRef, useState } from "react";

/**
 * A card whose text is edited in place: it takes focus, Enter or F2 starts
 * editing (as does a double-click), and Escape in the field cancels and puts
 * focus back on the card. Spread `cardProps` on the card and `fieldProps` on
 * the input or textarea shown while `editing`.
 *
 * Pass `onEdit` when the card has its own way to edit (a dialog, a side
 * panel): the keys and double-click call it instead of switching `editing`.
 */
export function useEditableCard<T extends HTMLElement = HTMLElement>({
  disabled = false,
  onEdit,
  onCancel,
}: { disabled?: boolean; onEdit?: () => void; onCancel?: () => void } = {}) {
  const [editing, setEditing] = useState(false);
  const cardRef = useRef<T | null>(null);

  const startEditing = useCallback(() => {
    if (disabled) return;
    if (onEdit) onEdit();
    else setEditing(true);
  }, [disabled, onEdit]);

  const refocus = () => requestAnimationFrame(() => cardRef.current?.focus({ preventScroll: true }));

  /** Ends editing after a save; focus goes back to the card when it was in the field. */
  const finishEditing = useCallback((refocusCard = false) => {
    setEditing(false);
    if (refocusCard) refocus();
  }, []);

  const cancelEditing = useCallback(() => {
    onCancel?.();
    setEditing(false);
    refocus();
  }, [onCancel]);

  const cardProps = {
    ref: cardRef,
    tabIndex: 0,
    "aria-keyshortcuts": disabled ? undefined : "Enter F2",
    onDoubleClick: (event: React.MouseEvent) => {
      if (editing) return;
      event.stopPropagation();
      startEditing();
    },
    onKeyDown: (event: React.KeyboardEvent) => {
      // Keys typed in the field, or in a button inside the card, are theirs.
      if (editing || event.target !== event.currentTarget) return;
      if (event.key === "Enter" || event.key === "F2") {
        event.preventDefault();
        startEditing();
      }
    },
  };

  const fieldProps = {
    autoFocus: true,
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        cancelEditing();
      }
    },
  };

  return { editing, setEditing, startEditing, finishEditing, cancelEditing, cardRef, cardProps, fieldProps };
}

/** Classes for a focusable card: a visible focus ring without the browser's outline. */
export const editableCardClass = "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";
