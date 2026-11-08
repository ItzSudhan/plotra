"use client";

import type { ScriptFormat } from "@plotra/db/schema";
import { useEditorRef, usePluginOption } from "platejs/react";
import { CHARACTER, scriptElementInfo, scriptElements } from "@/lib/script";
import { BlockTypeIcon, type BlockType } from "../block-types";
import { InlineComboboxGroup, InlineComboboxGroupLabel, InlineComboboxItem } from "../inline-combobox";
import { insertBlock } from "../transforms";
import { BaseScriptPlugin, toggleDualDialogue } from "./flow";

/** A format's elements as block types, for the "/" menu and "Turn into". */
export function scriptBlockTypes(format: ScriptFormat): BlockType[] {
  return scriptElements[format].map((type) => {
    const { label, glyph, keywords } = scriptElementInfo(type, format);
    return { value: type, label, keywords, icon: { glyph } };
  });
}

/** The script elements this editor's document is written in; none in prose. */
export function useScriptBlockTypes(): BlockType[] {
  const format = usePluginOption(BaseScriptPlugin, "format");
  return scriptBlockTypes(format ?? "prose");
}

/** The format's elements in the "/" menu, ahead of the ordinary blocks. */
export function ScriptSlashGroup() {
  const editor = useEditorRef();
  const types = useScriptBlockTypes();
  if (!types.length) return null;
  const speaks = types.some((t) => t.value === CHARACTER);
  return (
    <InlineComboboxGroup>
      <InlineComboboxGroupLabel>Script</InlineComboboxGroupLabel>
      {types.map(({ value, label, keywords, icon }) => (
        <InlineComboboxItem key={value} value={value} label={label} keywords={keywords} group="Script" onClick={() => insertBlock(editor, value)}>
          <BlockTypeIcon icon={icon} className="size-4 text-muted-foreground" />
          {label}
        </InlineComboboxItem>
      ))}
      {/* Marks (or unmarks) the speech's cue, so it's set beside the speech before it. */}
      {speaks && (
        <InlineComboboxItem value="dual_dialogue" label="Dual dialogue" keywords={["dual", "side by side", "simultaneous", "^"]} group="Script" onClick={() => toggleDualDialogue(editor)}>
          <BlockTypeIcon icon={{ glyph: "CC" }} className="size-4 text-muted-foreground" />
          Dual dialogue
        </InlineComboboxItem>
      )}
    </InlineComboboxGroup>
  );
}
