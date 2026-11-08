"use client";

import type { TComboboxInputElement } from "platejs";
import { PlateElement, type PlateElementProps } from "platejs/react";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { openInlineAi, useInlineAiAvailable } from "@/components/agent/inline-ai";
import { isShown, typingOn } from "@/lib/shell-prefs";
import { AI_TOOLBAR_ID, useHideAi } from "./hide-ai";
import { BlockTypeIcon, blockTypes } from "./block-types";
import { useLivePrefs } from "./live-prefs";
import { CITATION_INPUT } from "./citation";
import {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxEmpty,
  InlineComboboxGroup,
  InlineComboboxGroupLabel,
  InlineComboboxInput,
  InlineComboboxItem,
} from "./inline-combobox";
import { ScriptSlashGroup } from "./script/block-types";
import { insertBlock } from "./transforms";
import { WIKILINK_INPUT } from "./wiki-links";

/** The "/" menu: type to filter, Enter to insert a block. */
export function SlashInputElement(props: PlateElementProps<TComboboxInputElement>) {
  const { editor, element } = props;
  const { modules } = useWorkspace();
  const ai = useInlineAiAvailable();
  const prefs = useLivePrefs();
  const showAi = ai && isShown(prefs, AI_TOOLBAR_ID);
  const typeMarkdown = typingOn(prefs, "markdown");
  const hideAi = useHideAi();
  const linkItems = [
    {
      value: "wikilink",
      label: "Link to note",
      keywords: ["[[", "wiki", "reference"],
      icon: "link-round-linear" as const,
      run: () => editor.tf.insertNodes({ type: WIKILINK_INPUT, children: [{ text: "" }] }),
    },
    {
      value: "embed",
      label: "Embed note",
      keywords: ["![[", "transclude", "include"],
      icon: "notes-linear" as const,
      run: () => editor.tf.insertNodes({ type: WIKILINK_INPUT, embed: true, children: [{ text: "" }] }),
    },
    // Citing a source belongs to the Research module (plan.md 2.8).
    ...(modules.has("research")
      ? [
          {
            value: "citation",
            label: "Citation",
            keywords: ["[@", "cite", "source", "reference", "bibliography"],
            icon: "square-academic-cap-linear" as const,
            run: () => editor.tf.insertNodes({ type: CITATION_INPUT, children: [{ text: "" }] }),
          },
        ]
      : []),
  ];

  return (
    <PlateElement {...props} as="span">
      <InlineCombobox element={element} trigger="/">
        <InlineComboboxInput />
        <InlineComboboxContent>
          <InlineComboboxEmpty>No matching blocks</InlineComboboxEmpty>
          <ScriptSlashGroup />
          <InlineComboboxGroup>
            <InlineComboboxGroupLabel>Blocks</InlineComboboxGroupLabel>
            {blockTypes.map(({ value, label, keywords, icon, markdown }) => (
              <InlineComboboxItem
                key={value}
                value={value}
                label={label}
                keywords={keywords}
                group="Blocks"
                onClick={() => insertBlock(editor, value)}
              >
                <BlockTypeIcon icon={icon} className="size-4 text-muted-foreground" />
                {label}
                {/* The Markdown that makes this block as you type, so it can be learnt from here. */}
                {markdown && typeMarkdown && (
                  <kbd className="ml-auto pl-3 font-mono text-meta text-muted-foreground" aria-label={`or type ${markdown.trim()}`}>
                    {markdown.trim()}
                  </kbd>
                )}
              </InlineComboboxItem>
            ))}
          </InlineComboboxGroup>
          <InlineComboboxGroup>
            <InlineComboboxGroupLabel>Links</InlineComboboxGroupLabel>
            {linkItems.map(({ value, label, keywords, icon, run }) => (
              <InlineComboboxItem key={value} value={value} label={label} keywords={keywords} group="Links" onClick={run}>
                <BlockTypeIcon icon={icon} className="size-4 text-muted-foreground" />
                {label}
              </InlineComboboxItem>
            ))}
          </InlineComboboxGroup>
          {/* Only where AI is on for the project (plan.md 2.11), and the person hasn't hidden it. After blocks and links: writing comes first. The menu has closed by the time it opens: the caret is back in the text. */}
          {showAi && (
            <InlineComboboxGroup>
              <InlineComboboxGroupLabel>AI</InlineComboboxGroupLabel>
              <InlineComboboxItem
                value="ai-continue"
                label="Continue writing"
                keywords={["ai", "continue", "write", "next", "generate"]}
                group="AI"
                onClick={() => requestAnimationFrame(() => openInlineAi(editor, "continue"))}
              >
                <BlockTypeIcon icon="magic-stick-3-linear" className="size-4 text-muted-foreground" />
                Continue writing
              </InlineComboboxItem>
              <InlineComboboxItem value="ai-hide" label="Hide AI for me" keywords={["ai", "hide", "off"]} group="AI" onClick={hideAi}>
                <BlockTypeIcon icon="eye-closed-linear" className="size-4 text-muted-foreground" />
                Hide AI for me
              </InlineComboboxItem>
            </InlineComboboxGroup>
          )}
        </InlineComboboxContent>
      </InlineCombobox>
      {props.children}
    </PlateElement>
  );
}
