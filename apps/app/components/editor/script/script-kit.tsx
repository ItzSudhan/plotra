"use client";

import { cn } from "@plotra/ui/lib/utils";
import {
  createPlatePlugin,
  PlateElement,
  PlateLeaf,
  toPlatePlugin,
  useEditorSelector,
  usePluginOption,
  useReadOnly,
  type PlateElementProps,
  type PlateLeafProps,
} from "platejs/react";
import type { DocNode } from "@/lib/doc-index";
import { CHARACTER, dualRoles, isSpeechElement, scriptElementInfo, scriptElementTypes, SCRIPT_NOTE, type DualRole, type ScriptElementType } from "@/lib/script";
import { CharacterMenu } from "./character-menu";
import { BaseScriptPlugin, closeCue, cueMenu, moveCue } from "./flow";
import "./script.css";

// Script elements as Plate blocks (plan.md 2.3): scene headings, action,
// character cues, dialogue and the rest, for screenplays, stage plays, comic
// scripts and audio scripts. How each is laid out is in script.css, keyed on
// the document's format; how the keyboard moves between them is in flow.ts.

/** The classes a script element carries, shared with the static renderer. */
export const scriptElementClass = (type: string) => `script-el script-${type}`;

// Dual dialogue keeps the document flat: each block of the pair says which column it's in
// (`data-dual`) and script.css floats the left column beside the right. Worked out once per
// change of the document, for every element to look up.
const rolesCache = new WeakMap<object, Array<DualRole | null>>();
function documentDualRoles(children: object[]) {
  let roles = rolesCache.get(children);
  if (!roles) rolesCache.set(children, (roles = dualRoles(children as DocNode[])));
  return roles;
}

function scriptElement(type: ScriptElementType) {
  return function ScriptElement(props: PlateElementProps) {
    const readOnly = useReadOnly();
    const { editor, element } = props;
    // An empty element says what it is, so the page's structure shows before it's written.
    // Subscribed, so the words follow a format switch (the option is set just after the first render).
    const format = usePluginOption(BaseScriptPlugin, "format");
    const placeholder = !readOnly && editor.api.isEmpty(element) ? scriptElementInfo(type, format || "screenplay").placeholder : "";
    // A selector, not a prop: marking the next cue dual moves this speech without changing it.
    const dual = useEditorSelector(
      (e) => {
        if (!isSpeechElement(element as DocNode)) return null;
        const path = e.api.findPath(element);
        return path?.length === 1 ? (documentDualRoles(e.children)[path[0]] ?? null) : null;
      },
      [element],
    );
    return (
      <PlateElement
        {...props}
        className={cn(scriptElementClass(type))}
        attributes={{
          ...props.attributes,
          ...(placeholder && { "data-placeholder": placeholder }),
          ...(element.align === "center" && { "data-align": "center" }),
          ...(element.fountain === "lyric" && { "data-lyric": "" }),
          ...(dual && { "data-dual": dual }),
          ...(type === CHARACTER && element.dual === true && { "data-dual-cue": "" }),
        }}
      />
    );
  };
}

function ScriptNoteLeaf(props: PlateLeafProps) {
  return <PlateLeaf {...props} className="script-note" />;
}

const elementPlugins = scriptElementTypes.map((type) =>
  createPlatePlugin({ key: type, node: { isElement: true, component: scriptElement(type) } }),
);

const ScriptNotePlugin = createPlatePlugin({ key: SCRIPT_NOTE, node: { isLeaf: true, component: ScriptNoteLeaf } });

/**
 * The keyboard flow. Set its `format` option to the document's format
 * (`editor.setOption(ScriptPlugin, "format", …)`); it does nothing in prose.
 */
export const ScriptPlugin = toPlatePlugin(BaseScriptPlugin, {
  handlers: {
    // Enter and Tab reach the cue menu through the editor's transforms (flow.ts); the arrows and Escape come here.
    onKeyDown: ({ editor, event }) => {
      if (event.defaultPrevented || event.altKey || event.metaKey || event.ctrlKey) return;
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Escape") return;
      if (!cueMenu(editor)) return;
      event.preventDefault();
      if (event.key === "Escape") closeCue(editor);
      else moveCue(editor, event.key === "ArrowDown" ? 1 : -1);
      return true;
    },
  },
  render: { afterEditable: () => <CharacterMenu /> },
});

/** The elements only: enough to show a script (embeds, read-only previews). */
export const ScriptElementsKit = [...elementPlugins, ScriptNotePlugin];

/** Elements plus the keyboard flow, for editors people write in. */
export const ScriptKit = [...ScriptElementsKit, ScriptPlugin];
