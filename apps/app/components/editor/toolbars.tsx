"use client";

import { flip, offset, useFloatingToolbar, useFloatingToolbarState, type UseVirtualFloatingOptions } from "@platejs/floating";
import { getLinkAttributes } from "@platejs/link";
import {
  FloatingLinkUrlInput,
  useFloatingLinkEdit,
  useFloatingLinkEditState,
  useFloatingLinkInsert,
  useFloatingLinkInsertState,
  useLinkToolbarButton,
  useLinkToolbarButtonState,
} from "@platejs/link/react";
import { Icon, type IconName } from "@plotra/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@plotra/ui/components/dropdown-menu";
import { Tooltip } from "@plotra/ui/components/tooltip";
import { cn } from "@plotra/ui/lib/utils";
import { KEYS, type TElement, type TLinkElement } from "platejs";
import {
  useComposedRef,
  useEditorId,
  useEditorReadOnly,
  useEditorRef,
  useEditorSelection,
  useEventEditorValue,
  useFormInputProps,
  useMarkToolbarButton,
  useMarkToolbarButtonState,
  usePluginOption,
  useSelectionFragmentProp,
} from "platejs/react";
import { Fragment, useMemo, useState } from "react";
import { openInlineAi, useInlineAiAvailable } from "@/components/agent/inline-ai";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { formatHotkey, resolveHotkey } from "@/components/workspace/hotkeys";
import { formatKeys, formatShortcuts } from "@/lib/editor-shortcuts";
import { arranged, isShown } from "@/lib/shell-prefs";
import { BlockTypeIcon, blockTypes } from "./block-types";
import { BreakdownButton } from "./breakdown";
import { useHideAi } from "./hide-ai";
import { useLivePrefs } from "./live-prefs";
import { CommentHighlightPlugin } from "./review";
import { useScriptBlockTypes } from "./script/block-types";
import { getBlockType, setBlockType } from "./transforms";

// Adapted from Plate UI's floating toolbar and link toolbar.

const buttonClass =
  "inline-flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-md px-1.5 text-sm text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-pressed:bg-accent aria-pressed:text-foreground";

function ToolbarButton({ label, pressed, className, ...props }: React.ComponentProps<"button"> & { label: string; pressed?: boolean }) {
  return (
    <Tooltip content={label}>
      <button type="button" aria-label={label} aria-pressed={pressed} className={cn(buttonClass, className)} {...props} />
    </Tooltip>
  );
}

/** A button's name with its shortcut, as the person has it: "Bold (⌘B)", or just "Bold" when they took the shortcut away. */
function useShortcutLabel(title: string, formatId: string) {
  const { hotkeys } = useLivePrefs();
  const shortcut = formatShortcuts.find((s) => s.id === formatId);
  const keys = shortcut ? formatKeys(shortcut, hotkeys) : undefined;
  return keys ? `${title} (${formatHotkey(keys)})` : title;
}

function MarkButton({ nodeType, title, icon }: { nodeType: string; title: string; icon: IconName }) {
  const state = useMarkToolbarButtonState({ nodeType });
  const { props } = useMarkToolbarButton(state);
  const label = useShortcutLabel(title, `format.${nodeType}`);
  return (
    <ToolbarButton label={label} pressed={props.pressed} onClick={props.onClick} onMouseDown={props.onMouseDown}>
      <Icon name={icon} className="size-4" />
    </ToolbarButton>
  );
}

function LinkButton() {
  const state = useLinkToolbarButtonState();
  const { props } = useLinkToolbarButton(state);
  return (
    <ToolbarButton label={`Link (${formatHotkey("mod+k")})`} pressed={props.pressed} onClick={props.onClick} onMouseDown={props.onMouseDown} data-plate-focus>
      <Icon name="link-linear" className="size-4" />
    </ToolbarButton>
  );
}

function TurnIntoButton() {
  const editor = useEditorRef();
  const [open, setOpen] = useState(false);
  const value = useSelectionFragmentProp({
    defaultValue: KEYS.p,
    getProp: (node) => getBlockType(node as TElement),
  });
  // In a script, the format's elements come first.
  const items = [...useScriptBlockTypes(), ...blockTypes.filter((t) => !t.insertOnly)];
  const selected = items.find((item) => item.value === (value ?? KEYS.p)) ?? items[0];

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" className={cn(buttonClass, "min-w-28 justify-between pr-1 text-foreground")}>
          {selected.label}
          <Icon name="alt-arrow-down-linear" className="size-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="ignore-click-outside/toolbar min-w-44"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          editor.tf.focus();
        }}
      >
        <DropdownMenuRadioGroup value={selected.value} onValueChange={(type) => setBlockType(editor, type)}>
          {items.map((item) => (
            <DropdownMenuRadioItem key={item.value} value={item.value} className="gap-2">
              <BlockTypeIcon icon={item.icon} className="size-4 text-muted-foreground" />
              {item.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Starts a comment on the selection; the shell knows which note this editor is (EditorHandle.comment). */
function CommentButton() {
  const editor = useEditorRef();
  // The "Comment on selection" command's keys, as the person has them.
  const keys = resolveHotkey("editor.comment", "mod+alt+m", useLivePrefs().hotkeys);
  return (
    <ToolbarButton
      label={keys ? `Comment (${formatHotkey(keys)})` : "Comment"}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => editor.getOption(CommentHighlightPlugin, "onComment")?.()}
    >
      <Icon name="chat-round-line-linear" className="size-4" />
    </ToolbarButton>
  );
}

/** Rewrite, shorten, expand or change the tone of the selection (plan.md 2.11). Only where AI is on. */
function AiButton() {
  const editor = useEditorRef();
  const available = useInlineAiAvailable();
  const hideAi = useHideAi();
  if (!available) return null;
  return (
    <>
      <ToolbarButton label={`AI (${formatHotkey("mod+j")})`} onMouseDown={(e) => e.preventDefault()} onClick={() => openInlineAi(editor)}>
        <Icon name="magic-stick-3-linear" className="size-4" />
        AI
      </ToolbarButton>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label="More AI options" className={cn(buttonClass, "min-w-6 px-0.5")} onMouseDown={(e) => e.preventDefault()}>
            <Icon name="alt-arrow-down-linear" className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="ignore-click-outside/toolbar">
          <DropdownMenuItem onSelect={hideAi}>
            <Icon name="eye-closed-linear" className="size-4" />
            Hide AI for me
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

// The mark buttons. Their ids are Plate's mark keys, which are also the hide and order ids
// ("toolbar.bold") and the formatting shortcut ids ("format.bold").
const marks: Record<string, { title: string; icon: IconName }> = {
  [KEYS.bold]: { title: "Bold", icon: "text-bold-linear" },
  [KEYS.italic]: { title: "Italic", icon: "text-italic-linear" },
  [KEYS.underline]: { title: "Underline", icon: "text-underline-linear" },
  [KEYS.strikethrough]: { title: "Strikethrough", icon: "text-cross-linear" },
  [KEYS.highlight]: { title: "Highlight", icon: "pen-linear" },
  [KEYS.code]: { title: "Code", icon: "code-linear" },
};

/** Which kind of button each is: a line goes between neighbours of different kinds, wherever they've been moved. */
const buttonKind = (id: string) => (id === "ai" || id === "turn-into" || id === "comment" ? id : "inline");

function ToolbarPiece({ id }: { id: string }) {
  if (id === "ai") return <AiButton />;
  if (id === "turn-into") return <TurnIntoButton />;
  if (id === "link") return <LinkButton />;
  if (id === "breakdown") return <BreakdownButton />;
  if (id === "comment") return <CommentButton />;
  const mark = marks[id];
  return mark ? <MarkButton nodeType={id} title={mark.title} icon={mark.icon} /> : null;
}

/** Formatting bar that appears above a text selection. */
export function FloatingToolbar() {
  const editorId = useEditorId();
  const focusedEditorId = useEventEditorValue("focus");
  const readOnly = useEditorReadOnly();
  const isFloatingLinkOpen = !!usePluginOption({ key: KEYS.link }, "mode");

  const state = useFloatingToolbarState({
    editorId,
    focusedEditorId,
    hideToolbar: isFloatingLinkOpen || readOnly,
    floatingOptions: {
      placement: "top",
      middleware: [offset(10), flip({ fallbackPlacements: ["top-start", "top-end", "bottom-start", "bottom-end"], padding: 12 })],
    },
  });
  const { clickOutsideRef, hidden, props, ref: floatingRef } = useFloatingToolbar(state);
  const ref = useComposedRef<HTMLDivElement>(floatingRef);
  // The buttons the person kept, in their order (Customize → Formatting toolbar). Shortcuts work either way.
  const prefs = useLivePrefs();
  // Buttons this project can't have are left out here, so the lines between kinds fall right.
  const aiAvailable = useInlineAiAvailable();
  const { modules } = useWorkspace();
  const buttons = arranged(prefs, "toolbar")
    .filter((id) => isShown(prefs, id))
    .map((id) => id.slice("toolbar.".length))
    .filter((id) => (id !== "ai" || aiAvailable) && (id !== "breakdown" || modules.has("production")));
  // With every button taken away, no empty bar either.
  if (hidden || !buttons.length) return null;

  return (
    <div ref={clickOutsideRef}>
      <div
        {...props}
        ref={ref}
        role="toolbar"
        aria-label="Formatting"
        className="absolute z-50 flex max-w-[80vw] items-center gap-0.5 overflow-x-auto rounded-lg border bg-popover p-1 font-sans whitespace-nowrap shadow-md print:hidden"
      >
        {buttons.map((id, i) => (
          <Fragment key={id}>
            {i > 0 && buttonKind(id) !== buttonKind(buttons[i - 1]) && <span className="mx-1 h-5 w-px bg-border" />}
            <ToolbarPiece id={id} />
          </Fragment>
        ))}
      </div>
    </div>
  );
}

const linkPopoverClass = "z-50 w-auto rounded-lg border bg-popover p-1 font-sans text-popover-foreground shadow-md outline-hidden";
const linkInputClass =
  "flex h-8 w-full rounded-md border-none bg-transparent px-1.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none";

/** Insert / edit popover for links. */
export function LinkFloatingToolbar() {
  const floatingOptions: UseVirtualFloatingOptions = useMemo(
    () => ({
      placement: "bottom-start",
      middleware: [offset(8), flip({ fallbackPlacements: ["bottom-end", "top-start", "top-end"], padding: 12 })],
    }),
    [],
  );

  const insertState = useFloatingLinkInsertState({ floatingOptions });
  const { hidden, props: insertProps, ref: insertRef, textInputProps } = useFloatingLinkInsert(insertState);
  const editState = useFloatingLinkEditState({ floatingOptions });
  const { editButtonProps, props: editProps, ref: editRef, unlinkButtonProps } = useFloatingLinkEdit(editState);
  const inputProps = useFormInputProps({ preventDefaultOnEnterKeydown: true });

  if (hidden) return null;

  const input = (
    <div className="flex w-[320px] flex-col" {...inputProps}>
      <div className="flex items-center">
        <Icon name="link-linear" className="mx-2 size-4 shrink-0 text-muted-foreground" />
        <FloatingLinkUrlInput className={linkInputClass} placeholder="Paste link" aria-label="Link address" data-plate-focus />
      </div>
      <div className="my-1 h-px bg-border" />
      <div className="flex items-center">
        <Icon name="text-linear" className="mx-2 size-4 shrink-0 text-muted-foreground" />
        <input className={linkInputClass} placeholder="Text to display" aria-label="Text to display" data-plate-focus {...textInputProps} />
      </div>
    </div>
  );

  return (
    <>
      <div ref={insertRef} className={linkPopoverClass} {...insertProps}>
        {input}
      </div>
      <div ref={editRef} className={linkPopoverClass} {...editProps}>
        {editState.isEditing ? (
          input
        ) : (
          <div className="flex items-center gap-0.5">
            <button type="button" className={buttonClass} {...editButtonProps}>
              Edit link
            </button>
            <LinkOpenButton />
            <ToolbarButton label="Remove link" {...unlinkButtonProps}>
              <Icon name="link-broken-linear" className="size-4" />
            </ToolbarButton>
          </div>
        )}
      </div>
    </>
  );
}

function LinkOpenButton() {
  const editor = useEditorRef();
  const selection = useEditorSelection();
  const attributes = useMemo(() => {
    void selection; // Recompute when the caret moves to another link.
    const entry = editor.api.node<TLinkElement>({ match: { type: editor.getType(KEYS.link) } });
    return entry ? getLinkAttributes(editor, entry[0]) : {};
  }, [editor, selection]);

  return (
    <Tooltip content="Open link in a new tab">
    <a
      {...attributes}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Open link in a new tab"
      className={buttonClass}
      onMouseOver={(e) => e.stopPropagation()}
    >
      <Icon name="square-arrow-right-up-linear" className="size-4" />
    </a>
    </Tooltip>
  );
}
