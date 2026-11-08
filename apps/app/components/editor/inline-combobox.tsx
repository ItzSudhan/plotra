"use client";

import {
  Combobox,
  ComboboxGroup,
  ComboboxGroupLabel,
  ComboboxItem,
  ComboboxPopover,
  ComboboxProvider,
  Portal,
  useComboboxContext,
  useComboboxStore,
  type ComboboxItemProps,
} from "@ariakit/react";
import { filterWords } from "@platejs/combobox";
import { useComboboxInput, useHTMLInputCursorState, type UseComboboxInputResult } from "@platejs/combobox/react";
import { cn } from "@plotra/ui/lib/utils";
import type { PointRef, TElement } from "platejs";
import { useComposedRef, useEditorRef } from "platejs/react";
import { createContext, startTransition, use, useEffect, useMemo, useRef, useState } from "react";

// Adapted from Plate UI's inline combobox (platejs.org/r/inline-combobox).

type FilterFn = (item: { value: string; group?: string; keywords?: string[]; label?: string }, search: string) => boolean;

type InlineComboboxContextValue = {
  filter: FilterFn | false;
  inputProps: UseComboboxInputResult["props"];
  inputRef: React.RefObject<HTMLInputElement | null>;
  removeInput: UseComboboxInputResult["removeInput"];
  trigger: string;
  setHasEmpty: (hasEmpty: boolean) => void;
};

const InlineComboboxContext = createContext<InlineComboboxContextValue>(null as unknown as InlineComboboxContextValue);

const defaultFilter: FilterFn = ({ group, keywords = [], label, value }, search) =>
  [value, ...keywords, group, label].filter(Boolean).some((keyword) => filterWords(keyword!, search));

export function InlineCombobox({
  children,
  element,
  filter = defaultFilter,
  trigger,
}: {
  children: React.ReactNode;
  element: TElement;
  trigger: string;
  filter?: FilterFn | false;
}) {
  const editor = useEditorRef();
  const inputRef = useRef<HTMLInputElement>(null);
  const cursorState = useHTMLInputCursorState(inputRef);
  const [value, setValue] = useState("");

  // The point just before the input, so cancelling can put the typed text back.
  const insertPointRef = useRef<PointRef | null>(null);
  useEffect(() => {
    const path = editor.api.findPath(element);
    const point = path && editor.api.before(path);
    if (!point) return;
    const pointRef = editor.api.pointRef(point);
    insertPointRef.current = pointRef;
    return () => {
      if (insertPointRef.current === pointRef) insertPointRef.current = null;
      pointRef.unref();
    };
  }, [editor, element]);

  const { props: inputProps, removeInput } = useComboboxInput({
    cancelInputOnBlur: true,
    cursorState,
    autoFocus: true,
    ref: inputRef,
    onCancelInput: (cause) => {
      if (cause !== "backspace") {
        editor.tf.insertText(trigger + value, { at: insertPointRef.current?.current ?? undefined });
      }
      if (cause === "arrowLeft" || cause === "arrowRight") {
        editor.tf.move({ distance: 1, reverse: cause === "arrowLeft" });
      }
    },
  });

  const [hasEmpty, setHasEmpty] = useState(false);
  const contextValue = useMemo(
    () => ({ filter, inputProps, inputRef, removeInput, setHasEmpty, trigger }),
    [filter, inputProps, removeInput, trigger],
  );

  const store = useComboboxStore({ setValue: (next) => startTransition(() => setValue(next)) });
  const items = store.useState("items");

  // Keep the first match highlighted as the list changes.
  useEffect(() => {
    if (!store.getState().activeId) store.setActiveId(store.first());
  }, [items, store]);

  return (
    <span contentEditable={false}>
      <ComboboxProvider open={items.length > 0 || hasEmpty} store={store}>
        <InlineComboboxContext value={contextValue}>{children}</InlineComboboxContext>
      </ComboboxProvider>
    </span>
  );
}

export function InlineComboboxInput({ className, ...props }: React.HTMLAttributes<HTMLInputElement>) {
  const { inputProps, inputRef, trigger } = use(InlineComboboxContext);
  const store = useComboboxContext()!;
  const value = store.useState("value");
  const ref = useComposedRef(inputRef);

  // An invisible copy of the text sizes the input to its content.
  return (
    <>
      {trigger}
      <span className="relative min-h-[1lh]">
        <span className="invisible overflow-hidden text-nowrap" aria-hidden="true">
          {value || "​"}
        </span>
        <Combobox
          ref={ref}
          className={cn("absolute top-0 left-0 size-full bg-transparent outline-none", className)}
          value={value}
          autoSelect
          {...inputProps}
          {...props}
        />
      </span>
    </>
  );
}

export function InlineComboboxContent({ className, ...props }: React.ComponentProps<typeof ComboboxPopover>) {
  const store = useComboboxContext();

  // Wrap around at the ends of the list.
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!store) return;
    const { items, activeId } = store.getState();
    if (!items.length) return;
    const index = items.findIndex((item) => item.id === activeId);
    if (event.key === "ArrowUp" && index <= 0) {
      event.preventDefault();
      store.setActiveId(store.last());
    } else if (event.key === "ArrowDown" && index >= items.length - 1) {
      event.preventDefault();
      store.setActiveId(store.first());
    }
  }

  return (
    <Portal>
      <ComboboxPopover
        className={cn(
          "z-500 max-h-[300px] w-[260px] overflow-y-auto rounded-md border bg-popover py-1 font-sans text-popover-foreground shadow-md",
          className,
        )}
        onKeyDownCapture={handleKeyDown}
        {...props}
      />
    </Portal>
  );
}

export function InlineComboboxItem({
  className,
  focusEditor = true,
  group,
  keywords,
  label,
  onClick,
  ...props
}: { focusEditor?: boolean; group?: string; keywords?: string[]; label?: string } & ComboboxItemProps &
  Required<Pick<ComboboxItemProps, "value">>) {
  const { filter, removeInput } = use(InlineComboboxContext);
  const store = useComboboxContext()!;
  const search = store.useState("value");
  const visible = !filter || filter({ group, keywords, label, value: props.value }, search);
  if (!visible) return null;

  return (
    <ComboboxItem
      className={cn(
        "mx-1 flex h-8 cursor-pointer items-center gap-2 rounded-sm px-2 text-sm outline-none select-none hover:bg-accent data-[active-item=true]:bg-accent [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
        className,
      )}
      onClick={(event) => {
        removeInput(focusEditor);
        onClick?.(event);
      }}
      {...props}
    />
  );
}

export function InlineComboboxEmpty({ children, className }: React.HTMLAttributes<HTMLDivElement>) {
  const { setHasEmpty } = use(InlineComboboxContext);
  const store = useComboboxContext()!;
  const items = store.useState("items");

  useEffect(() => {
    setHasEmpty(true);
    return () => setHasEmpty(false);
  }, [setHasEmpty]);

  if (items.length > 0) return null;
  return <div className={cn("mx-1 flex h-8 items-center px-2 text-sm text-muted-foreground", className)}>{children}</div>;
}

export function InlineComboboxGroup({ className, ...props }: React.ComponentProps<typeof ComboboxGroup>) {
  return <ComboboxGroup {...props} className={cn("hidden py-1 not-last:border-b [&:has([role=option])]:block", className)} />;
}

export function InlineComboboxGroupLabel({ className, ...props }: React.ComponentProps<typeof ComboboxGroupLabel>) {
  return <ComboboxGroupLabel {...props} className={cn("mt-1 mb-1.5 px-3 text-xs font-medium text-muted-foreground", className)} />;
}
