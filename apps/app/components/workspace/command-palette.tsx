"use client";

import { Icon } from "@plotra/icons";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@plotra/ui/components/dialog";
import { IconButton } from "@plotra/ui/components/icon-button";
import { undoToast } from "@plotra/ui/components/sonner";
import { Command } from "cmdk";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { deleteLayout, saveLayout, type SavedLayout } from "@/lib/knowledge-actions";
import { read } from "@/lib/read";
import { ancestors, flatten, nodeIcon } from "@/lib/tree";
import { ProjectSearch } from "@/components/agent/project-search";
import { prunePanels } from "./panes";
import { formatHotkey } from "./hotkeys";
import { isShown, paletteId } from "@/lib/shell-prefs";
import { useShell } from "./shell-prefs";
import { useVocabulary } from "./vocabulary";
import { useStore } from "./stores";
import { quickKind } from "./binder-moves";
import { kindLabel } from "@/lib/vocabulary";
import { useUi, useWorkspace } from "./workspace-provider";
import { errorText } from "@/lib/errors";

const groupClass =
  "[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-meta [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground";

const itemClass =
  "flex h-9 cursor-default items-center gap-2.5 rounded-md px-2.5 text-sm text-muted-foreground select-none data-[selected=true]:bg-accent data-[selected=true]:text-foreground";

/** ⌘P runs commands, ⌘O jumps to a note. Both live in one dialog. */
export function CommandPalette() {
  const { palette } = useUi();
  const { setUi } = useWorkspace();

  return (
    <Dialog open={palette !== null} onOpenChange={(open) => !open && setUi({ palette: null })}>
      <DialogContent showCloseButton={false} className="top-[18%] translate-y-0 gap-0 overflow-hidden p-0 data-[state=open]:animate-palette-in sm:max-w-xl">
        <DialogTitle className="sr-only">
          {palette === "files" ? "Find a note" : palette === "layouts" ? "Saved layouts" : palette === "search" ? "Search the whole project" : "All commands"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {palette === "files"
            ? "Type to find a note, then press Enter to open it."
            : palette === "layouts"
              ? "Switch to a saved layout, or save the current one."
              : palette === "search"
                ? "Type to search the text of every note, then press Enter to open one."
                : "Type to find a command."}
        </DialogDescription>
        {palette === "files" ? <QuickSwitcher /> : palette === "commands" ? <Commands /> : palette === "layouts" ? <Layouts /> : palette === "search" ? <ProjectSearch /> : null}
      </DialogContent>
    </Dialog>
  );
}

function Footer({ hints }: { hints: Array<[string, string]> }) {
  return (
    <div className="flex h-9 items-center gap-4 border-t px-3 text-xs text-faint">
      {hints.map(([key, label]) => (
        <span key={label}>
          <kbd className="mr-1 font-sans text-muted-foreground">{key}</kbd>
          {label}
        </span>
      ))}
    </div>
  );
}

function Commands() {
  const { commands: all, setUi, binder, activeNodeId, ui } = useWorkspace();
  const words = useVocabulary();
  // Commands about "this note" name it by its type: "Rename this chapter".
  const [kind] = useState(() => {
    const id = activeNodeId.get() ?? ui.get().selectedId;
    const node = id ? binder.get().index.byId.get(id) : undefined;
    return node ? words.label(node.kind).toLowerCase() : null;
  });
  // Commands the person took out of the palette (Customize → Command palette); their shortcuts still work.
  const { shell } = useShell();
  const commands = useMemo(() => all.filter((c) => isShown(shell, paletteId(c.id))), [all, shell]);
  const groups = useMemo(() => [...new Set(commands.map((c) => c.group))], [commands]);

  return (
    <Command loop className="flex flex-col">
      <Command.Input autoFocus aria-label="Find a command" placeholder="Type what you want to do…" className="h-12 border-b bg-transparent px-4 text-sm outline-none placeholder:text-faint" />
      <Command.List className="max-h-[min(60vh,420px)] overflow-y-auto p-1.5">
        <Command.Empty className="py-8 text-center text-sm text-muted-foreground">No matching commands.</Command.Empty>
        {groups.map((group) => (
          <Command.Group
            key={group}
            heading={group}
            className={groupClass}
          >
            {commands
              .filter((c) => c.group === group && c.id !== "palette.commands")
              .map((command) => {
                const title = kind && command.withKind ? command.withKind(kind) : command.title;
                return (
                  <Command.Item
                    key={command.id}
                    value={`${command.group} ${title}`}
                    // Synonyms: "delete" finds Move to Trash, "print" the Read view, "hide sidebar" the binder.
                    keywords={command.keywords?.split(/\s+/)}
                    onSelect={() => {
                      setUi({ palette: null });
                      // Let the dialog close (and return focus) before the command moves focus itself.
                      requestAnimationFrame(command.run);
                    }}
                    className={itemClass}
                  >
                    <span className="flex-1 truncate">{title}</span>
                    {command.hotkey && <kbd className="font-sans text-xs text-faint">{formatHotkey(command.hotkey)}</kbd>}
                  </Command.Item>
                );
              })}
          </Command.Group>
        ))}
      </Command.List>
      <Footer hints={[["↑↓", "navigate"], ["↵", "run"], ["esc", "close"]]} />
    </Command>
  );
}

function QuickSwitcher() {
  const { binder, open, setUi, actions, project, modules } = useWorkspace();
  const { index } = useStore(binder);
  // "Create “…”" makes the project's main kind (a scene, a session), as ⌘⌥N does.
  const kind = quickKind(project.type, modules);
  const [query, setQuery] = useState("");
  const nodes = useMemo(() => flatten(index).filter((n) => n.kind !== "folder"), [index]);
  const exact = nodes.some((n) => n.title.toLowerCase() === query.trim().toLowerCase());

  return (
    <Command
      loop
      className="flex flex-col"
      onKeyDown={(e) => {
        // ⌘↵ opens in a new tab, ⌘⌥↵ to the right.
        if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey)) return;
        const selected = document.querySelector<HTMLElement>("[cmdk-item][data-selected=true]")?.dataset.nodeId;
        if (!selected) return;
        e.preventDefault();
        setUi({ palette: null });
        open(selected, e.altKey ? "split" : "tab");
      }}
    >
      <Command.Input
        autoFocus
        value={query}
        onValueChange={setQuery}
        placeholder="Find a note…"
        aria-label="Find a note"
        className="h-12 border-b bg-transparent px-4 text-sm outline-none placeholder:text-faint"
      />
      <Command.List className="max-h-[min(60vh,420px)] overflow-y-auto p-1.5">
        <Command.Empty className="py-8 text-center text-sm text-muted-foreground">No notes match.</Command.Empty>
        {nodes.map((node) => {
          const trail = ancestors(index, node.id).map((a) => a.title);
          return (
            <Command.Item
              key={node.id}
              value={node.id}
              keywords={[node.title, ...trail]}
              data-node-id={node.id}
              onSelect={() => {
                setUi({ palette: null });
                open(node.id);
              }}
              className={itemClass}
            >
              <Icon name={nodeIcon(node)} className="size-4 shrink-0" />
              <span className="truncate text-foreground">{node.title}</span>
              {trail.length > 0 && <span className="ml-auto truncate pl-3 text-xs text-faint">{trail.join(" / ")}</span>}
            </Command.Item>
          );
        })}
        {query.trim() && !exact && (
          <Command.Item
            value={`create ${query}`}
            keywords={[query]}
            forceMount
            onSelect={() => {
              setUi({ palette: null });
              void actions.create(kind, undefined, query.trim());
            }}
            className={itemClass}
          >
            <Icon name="document-add-linear" className="size-4 shrink-0" />
            Create “{query.trim()}”
            <span className="ml-auto pl-3 text-xs text-faint">New {kindLabel(kind, project.settings).toLowerCase()}</span>
          </Command.Item>
        )}
      </Command.List>
      <Footer hints={[["↵", "open"], [formatHotkey("mod+enter"), "new tab"], [formatHotkey("mod+alt+enter"), "split"]]} />
    </Command>
  );
}

/** Saved pane arrangements ("Drafting", "Plotting"…), stored per user per project (plan.md 2.4). */
function Layouts() {
  const { project, dock, binder, setUi } = useWorkspace();
  const [layouts, setLayouts] = useState<SavedLayout[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    read("listLayouts", project.id)
      .then((l) => !cancelled && setLayouts(l))
      .catch(() => !cancelled && setLayouts([]));
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  const name = query.trim();
  const exact = layouts?.find((l) => l.name.toLowerCase() === name.toLowerCase());

  const save = async () => {
    const api = dock.current;
    if (!api || !name) return;
    try {
      await saveLayout(project.id, exact?.name ?? name, api.toJSON());
      toast.success(`Saved layout “${exact?.name ?? name}”.`);
      setUi({ palette: null });
    } catch (error) {
      toast.error(errorText(error, "Couldn't save the layout."));
    }
  };

  const apply = async (layout: SavedLayout) => {
    setUi({ palette: null });
    try {
      const state = await read("getLayout", project.id, layout.id);
      const api = dock.current;
      if (!api) return;
      api.fromJSON(state as Parameters<typeof api.fromJSON>[0]);
      prunePanels(api, binder.get().index);
    } catch (error) {
      toast.error(errorText(error, "Couldn't open that layout."));
    }
  };

  // Removed at once, with an Undo that saves it again under the same name.
  const remove = async (layout: SavedLayout) => {
    setLayouts((all) => all?.filter((l) => l.id !== layout.id) ?? null);
    try {
      const state = await read("getLayout", project.id, layout.id);
      await deleteLayout(project.id, layout.id);
      undoToast(`Removed the layout ‘${layout.name}’`, async () => {
        try {
          await saveLayout(project.id, layout.name, state);
          setLayouts(await read("listLayouts", project.id));
        } catch (error) {
          toast.error(errorText(error, "Couldn't bring the layout back."));
        }
      });
    } catch (error) {
      setLayouts((all) => (all ? [...all, layout] : all));
      toast.error(errorText(error, "Couldn't remove the layout."));
    }
  };

  return (
    <Command loop className="flex flex-col">
      <Command.Input
        autoFocus
        value={query}
        onValueChange={setQuery}
        placeholder="Find a layout, or type a name to save this one…"
        aria-label="Find a layout, or name this one"
        className="h-12 border-b bg-transparent px-4 text-sm outline-none placeholder:text-faint"
      />
      <Command.List className="max-h-[min(60vh,420px)] overflow-y-auto p-1.5">
        {layouts === null ? (
          <Command.Loading>
            <div className="py-6 text-center text-sm text-muted-foreground">Loading…</div>
          </Command.Loading>
        ) : (
          <>
            {!name && layouts.length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">No saved layouts yet. Type a name to save this one.</div>
            )}
            {layouts.map((layout) => (
              <Command.Item key={layout.id} value={`layout ${layout.name}`} onSelect={() => void apply(layout)} className={itemClass}>
                <Icon name="widget-linear" className="size-4 shrink-0" />
                <span className="flex-1 truncate text-foreground">{layout.name}</span>
                <IconButton
                  icon="trash-bin-minimalistic-linear"
                  size="xs"
                  label={`Remove the layout ${layout.name}`}
                  tooltipSide="left"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    void remove(layout);
                  }}
                />
              </Command.Item>
            ))}
            {name && (
              <Command.Item value={`save ${name}`} keywords={[name]} forceMount onSelect={() => void save()} className={itemClass}>
                <Icon name="add-linear" className="size-4 shrink-0" />
                {exact ? `Replace “${exact.name}” with this layout` : `Save this layout as “${name}”`}
              </Command.Item>
            )}
          </>
        )}
      </Command.List>
      <Footer hints={[["↵", "switch"], ["esc", "close"]]} />
    </Command>
  );
}
