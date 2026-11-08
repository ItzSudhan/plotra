"use client";

import { Tooltip } from "@plotra/ui/components/tooltip";
import { scriptFormats, type ScriptFormat } from "@plotra/db/schema";
import { Icon } from "@plotra/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@plotra/ui/components/dropdown-menu";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { formatMeta } from "@/lib/modules";
import { isScriptFormat } from "@/lib/script";
import { setNodeSettings } from "@/lib/story-actions";

/**
 * Picks the format a note is written in (plan.md 2.3): prose, screenplay,
 * stage play, comic or audio script. Shown where script formats are switched
 * on, and on any note that's already a script. The text stays as it is; what
 * changes is the page layout and what Enter and Tab do.
 */
export function FormatSwitcher({ nodeId, format }: { nodeId: string; format: ScriptFormat }) {
  const { project, modules, patchNode, binder } = useWorkspace();
  if (!modules.has("screenplay") && !isScriptFormat(format)) return null;

  const change = (next: ScriptFormat) => {
    const node = binder.get().index.byId.get(nodeId);
    if (!node || next === format) return;
    const rest = { ...node.settings };
    delete rest.format;
    void patchNode(nodeId, { settings: next === "prose" ? rest : { ...rest, format: next } }, () =>
      setNodeSettings(project.id, nodeId, { format: next === "prose" ? null : next }),
    );
  };

  return (
    <DropdownMenu>
      <Tooltip content="The format this note is written in">
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="ml-1 flex shrink-0 items-center gap-1 rounded bg-muted px-1.5 py-px text-meta text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Icon name="clapperboard-text-linear" className="size-3" />
          {formatMeta[format].label}
          <Icon name="alt-arrow-down-linear" className="size-2.5" />
        </button>
      </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent align="start" className="min-w-64">
        <DropdownMenuRadioGroup value={format} onValueChange={(value) => change(value as ScriptFormat)}>
          {scriptFormats.map((value) => (
            <DropdownMenuRadioItem key={value} value={value} className="items-start">
              <span>
                {formatMeta[value].label}
                <span className="block text-xs text-muted-foreground">{formatMeta[value].description}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
