"use client";

import {
  BlockquoteRules,
  BoldRules,
  CodeRules,
  HeadingRules,
  HighlightRules,
  HorizontalRuleRules,
  ItalicRules,
  MarkComboRules,
  StrikethroughRules,
  UnderlineRules,
} from "@platejs/basic-nodes";
import {
  BlockquotePlugin,
  BoldPlugin,
  CodePlugin,
  H1Plugin,
  H2Plugin,
  H3Plugin,
  HighlightPlugin,
  HorizontalRulePlugin,
  ItalicPlugin,
  StrikethroughPlugin,
  UnderlinePlugin,
} from "@platejs/basic-nodes/react";
import { CalloutPlugin } from "@platejs/callout/react";
import { DndPlugin } from "@platejs/dnd";
import { IndentPlugin } from "@platejs/indent/react";
import { LinkRules } from "@platejs/link";
import { LinkPlugin } from "@platejs/link/react";
import { BulletedListRules, OrderedListRules, TaskListRules } from "@platejs/list";
import { ListPlugin } from "@platejs/list/react";
import { ImagePlugin } from "@platejs/media/react";
import { BlockSelectionPlugin } from "@platejs/selection/react";
import { SlashInputPlugin, SlashPlugin } from "@platejs/slash-command/react";
import { TableCellHeaderPlugin, TableCellPlugin, TablePlugin, TableRowPlugin } from "@platejs/table/react";
import {
  createSlatePlugin,
  createTextSubstitutionInputRule,
  ExitBreakPlugin,
  getPluginTypes,
  KEYS,
  TrailingBlockPlugin,
  type SlateEditor,
} from "platejs";
import { createPlatePlugin, ParagraphPlugin } from "platejs/react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { InlineAiPlugin } from "@/components/agent/inline-ai";
import { eventToHotkey } from "@/components/workspace/hotkeys";
import { formatFor } from "@/lib/editor-shortcuts";
import { typingOn } from "@/lib/shell-prefs";
import { BlockDraggable, BlockSelection } from "./block-draggable";
import { BlockTagsPlugin } from "./block-tags";
import { ImagePickerPlugin } from "./image-insert";
import { livePrefs } from "./live-prefs";
import { BreakdownPlugin } from "./breakdown";
import { CitationPlugin, ResearchKit } from "./citation";
import { scriptElementTypes } from "@/lib/script";
import { kits } from "./kit-registry";
import {
  BlockList,
  BlockquoteElement,
  CalloutElement,
  CodeLeaf,
  H1Element,
  H2Element,
  H3Element,
  HighlightLeaf,
  HrElement,
  ImageElement,
  LinkElement,
  ParagraphElement,
  TableCellElement,
  TableCellHeaderElement,
  TableElement,
  TableRowElement,
} from "./nodes";
import { SlashInputElement } from "./slash-menu";
import { CommentHighlightPlugin, ReviewSuggestionPlugin } from "./review";
import { ScriptElementsKit, ScriptKit } from "./script/script-kit";
import { FloatingToolbar, LinkFloatingToolbar } from "./toolbars";
import { EmbedPlugin, WikiLinkKit, WikiLinkPlugin } from "./wiki-links";

// The editor kit (plan.md 2.3), assembled from Plate's reference kits, plus
// Plotra's wiki-links and embeds.

// The person's typing switches (Customize → Typing), read as each rule fires so a change applies at once.
const markdown = () => typingOn(livePrefs.get(), "markdown");
const autolink = () => typingOn(livePrefs.get(), "autolink");

/**
 * The formatting shortcuts (lib/editor-shortcuts.ts), bound to the keys the
 * person chose. The plugins' own shortcuts are switched off above, so a key
 * someone moved elsewhere stops doing its old job.
 */
const FormatShortcutsPlugin = createPlatePlugin({
  key: "format-shortcuts",
  handlers: {
    onKeyDown: ({ editor, event }) => {
      if (event.defaultPrevented || event.nativeEvent.isComposing) return false;
      const hotkey = eventToHotkey(event.nativeEvent);
      if (!hotkey) return false;
      const shortcut = formatFor(hotkey, livePrefs.get().hotkeys);
      if (!shortcut) return false;
      event.preventDefault();
      const { action } = shortcut;
      if ("mark" in action) editor.tf.toggleMark(action.mark);
      else if ("block" in action) editor.tf.toggleBlock(action.block);
      else editor.tf.insertExitBreak({ reverse: action.exit === "before" });
      return true;
    },
  },
});

/**
 * Tab on a selected picture moves focus to its "Alt text" button (ImageElement
 * in nodes.tsx), so alt text can be set from the keyboard. Its priority puts it
 * ahead of the core Tab handling, which would otherwise indent the picture.
 */
const ImageAltPlugin = createPlatePlugin({
  key: "image-alt",
  priority: 1000,
  handlers: {
    onKeyDown: ({ editor, event }) => {
      if (event.key !== "Tab" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return false;
      if (event.defaultPrevented || event.nativeEvent.isComposing) return false;
      const entry = editor.api.block();
      if (!entry || entry[0].type !== editor.getType(KEYS.img)) return false;
      const button = editor.api.toDOMNode(entry[0])?.querySelector<HTMLElement>("[data-image-alt]");
      if (!button) return false;
      event.preventDefault();
      button.focus();
      return true;
    },
  },
});

const blockTargets = [...KEYS.heading, KEYS.p, KEYS.blockquote, KEYS.img];

const headingPlugin = (plugin: typeof H1Plugin, component: typeof H1Element) =>
  plugin.configure({
    inputRules: [HeadingRules.markdown({ enabled: markdown })],
    node: { component },
    rules: { break: { empty: "reset" } },
    // Bound by FormatShortcutsPlugin, to the person's keys.
    shortcuts: { toggle: null },
  });

const BlocksKit = [
  ParagraphPlugin.withComponent(ParagraphElement),
  headingPlugin(H1Plugin, H1Element),
  headingPlugin(H2Plugin, H2Element),
  headingPlugin(H3Plugin, H3Element),
  BlockquotePlugin.configure({
    inputRules: [BlockquoteRules.markdown({ enabled: markdown })],
    node: { component: BlockquoteElement },
    shortcuts: { toggle: null },
  }),
  HorizontalRulePlugin.configure({
    inputRules: [HorizontalRuleRules.markdown({ variant: "-", enabled: markdown }), HorizontalRuleRules.markdown({ variant: "_", enabled: markdown })],
    node: { component: HrElement },
  }),
  CalloutPlugin.withComponent(CalloutElement),
  ImagePlugin.configure({ options: { disableUploadInsert: true }, node: { component: ImageElement } }),
  ImageAltPlugin,
  ImagePickerPlugin,
  TablePlugin.withComponent(TableElement),
  TableRowPlugin.withComponent(TableRowElement),
  TableCellPlugin.withComponent(TableCellElement),
  TableCellHeaderPlugin.withComponent(TableCellHeaderElement),
];

const MarksKit = [
  BreakdownPlugin,
  // Their shortcuts are bound by FormatShortcutsPlugin, to the person's keys.
  BoldPlugin.configure({
    inputRules: [
      BoldRules.markdown({ variant: "*", enabled: markdown }),
      BoldRules.markdown({ variant: "_", enabled: markdown }),
      MarkComboRules.markdown({ variant: "boldItalic", enabled: markdown }),
    ],
    shortcuts: { toggle: null },
  }),
  ItalicPlugin.configure({
    inputRules: [ItalicRules.markdown({ variant: "*", enabled: markdown }), ItalicRules.markdown({ variant: "_", enabled: markdown })],
    shortcuts: { toggle: null },
  }),
  UnderlinePlugin.configure({ inputRules: [UnderlineRules.markdown({ enabled: markdown })], shortcuts: { toggle: null } }),
  StrikethroughPlugin.configure({
    inputRules: [StrikethroughRules.markdown({ enabled: markdown })],
    shortcuts: { toggle: null },
  }),
  CodePlugin.configure({
    inputRules: [CodeRules.markdown({ enabled: markdown })],
    node: { component: CodeLeaf },
    shortcuts: { toggle: null },
  }),
  HighlightPlugin.configure({
    inputRules: [HighlightRules.markdown({ variant: "==", enabled: markdown })],
    node: { component: HighlightLeaf },
    shortcuts: { toggle: null },
  }),
];

const ListKit = [
  IndentPlugin.configure({ inject: { targetPlugins: blockTargets }, options: { offset: 24 } }),
  ListPlugin.configure({
    inputRules: [
      BulletedListRules.markdown({ variant: "-", enabled: markdown }),
      BulletedListRules.markdown({ variant: "*", enabled: markdown }),
      OrderedListRules.markdown({ variant: ".", enabled: markdown }),
      OrderedListRules.markdown({ variant: ")", enabled: markdown }),
      TaskListRules.markdown({ checked: false, enabled: markdown }),
      TaskListRules.markdown({ checked: true, enabled: markdown }),
    ],
    inject: { targetPlugins: blockTargets },
    render: { belowNodes: BlockList },
  }),
];

const LinkKit = [
  LinkPlugin.configure({
    inputRules: [
      LinkRules.markdown({ enabled: markdown }),
      LinkRules.autolink({ variant: "paste", enabled: autolink }),
      LinkRules.autolink({ variant: "space", enabled: autolink }),
      LinkRules.autolink({ variant: "break", enabled: autolink }),
    ],
    render: { node: LinkElement, afterEditable: () => <LinkFloatingToolbar /> },
  }),
];

// Typographic substitutions writers expect: smart quotes, dashes, ellipses.
const notInCode = (editor: SlateEditor) => !editor.api.some({ match: { type: editor.getType(KEYS.codeBlock) } });
const TypographyPlugin = createSlatePlugin({
  key: "typography",
  inputRules: [
    createTextSubstitutionInputRule({
      enabled: ({ editor }) => typingOn(livePrefs.get(), "quotes") && notInCode(editor),
      patterns: [
        { format: ["“", "”"], match: '"' },
        { format: ["‘", "’"], match: "'" },
        { format: "—", match: "--" },
        { format: "…", match: "..." },
        { format: "→", match: "->" },
        { format: "©", match: ["(c)", "(C)"] },
      ],
    }),
  ],
});

// A script ends on a script element: no empty paragraph is kept under it.
const TrailingBlock = TrailingBlockPlugin.configure({ options: { exclude: [...scriptElementTypes] } });

const InteractionKit = [
  SlashPlugin.configure({ options: { triggerQuery: notInCode } }),
  SlashInputPlugin.withComponent(SlashInputElement),
  BlockSelectionPlugin.configure(({ editor }) => ({
    options: {
      // No rubber band: a drag that starts in the page's margin, beside or below the text, selects
      // text, as it does in a word processor. Blocks are picked from their handle or the context menu.
      areaOptions: { features: { singleTap: { allow: false } }, startAreas: [] },
      enableContextMenu: true,
      isSelectable: (element) => !getPluginTypes(editor, [KEYS.tr, KEYS.td, KEYS.th]).includes(element.type),
    },
    render: {
      belowRootNodes: (props) => {
        const className = [props.className, (props.attributes as { className?: string }).className].join(" ");
        if (!className.includes("slate-selectable")) return null;
        return <BlockSelection {...(props as unknown as React.ComponentProps<typeof BlockSelection>)} />;
      },
    },
  })),
  DndPlugin.configure({
    options: { enableScroller: true },
    render: {
      aboveNodes: BlockDraggable,
      aboveSlate: ({ children }) => <DndProvider backend={HTML5Backend}>{children}</DndProvider>,
    },
  }),
  // Bound by FormatShortcutsPlugin, to the person's keys.
  ExitBreakPlugin.configure({ shortcuts: { insert: null, insertBefore: null } }),
  FormatShortcutsPlugin,
  TrailingBlock,
  TypographyPlugin,
  createPlatePlugin({ key: "floating-toolbar", render: { afterEditable: () => <FloatingToolbar /> } }),
  // Inline AI (⌘J, the toolbar, the "/" menu). It renders nothing and binds nothing unless AI is on for the project.
  InlineAiPlugin,
];

export const EditorKit = [
  ...BlocksKit,
  ...MarksKit,
  ...ListKit,
  ...LinkKit,
  ...WikiLinkKit,
  ...ResearchKit,
  ...ScriptKit,
  BlockTagsPlugin,
  CommentHighlightPlugin,
  ReviewSuggestionPlugin,
  ...InteractionKit,
];

// Embedded notes render read-only; embeds inside them show as cards. No drag
// and drop or block selection: those are owned by the outer editor.
kits.readOnly = [...BlocksKit, ...MarksKit, ...ListKit, ...LinkKit, WikiLinkPlugin, EmbedPlugin, CitationPlugin, ...ScriptElementsKit, BlockTagsPlugin, ReviewSuggestionPlugin];
