"use client";

import { Icon } from "@plotra/icons";
import { promptText } from "@plotra/ui/components/dialogs";
import { IconButton } from "@plotra/ui/components/icon-button";
import { undoToast } from "@plotra/ui/components/sonner";
import { Tooltip } from "@plotra/ui/components/tooltip";
import { cn } from "@plotra/ui/lib/utils";
import { Controls, ReactFlow, ReactFlowProvider, useReactFlow, useViewport, ViewportPortal } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useTheme } from "next-themes";
import { type ChangeEvent, type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { toast } from "sonner";
import { useRoomDoc } from "@/components/collab/use-room-doc";
import { fileUrl, removeAttachment, uploadAttachment } from "@/components/research/attachments";
import { useHorizon } from "@/components/world/data";
import { NodeIcon } from "@/components/world/entity-icon";
import { NODE_MIME } from "@/components/workspace/binder";
import { useStore } from "@/components/workspace/stores";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { canvasMaps, type MapMeta, type MarkData } from "@/lib/canvas";
import { colorFor } from "@/lib/colors";
import { errorText } from "@/lib/errors";
import { swatches } from "@/lib/story";
import { flatten, isTrashed, type BinderNode } from "@/lib/tree";
import { SuggestInput } from "@plotra/ui/components/suggest-input";
import { cutPicture, needsTiles, visibleTiles } from "./map-tiles";
import { Swatches, ToolButton } from "./view-ui";

// Maps (beat-the-competitors.md step 5): a picture of the world with pins,
// regions and paths on it, each able to stand for a note, edited live by
// everyone who has the map open. A map is a canvas made as one
// (`settings.board = "map"`): its picture and marks live in the canvas's Yjs
// doc (lib/canvas.ts), so history, links and search come with it. A pin for
// another map opens that map: maps nest by linking.
//
// Everything is drawn in the picture's own pixels inside React Flow's
// viewport, which does the panning and zooming; pins are scaled back so they
// stay the same size on screen at any zoom.

const LOCAL = Symbol("local");
const PIN_W = 28;
const PIN_H = 36;
const MAIN_LAYER = "Main";
const images = "image/png,image/jpeg,image/webp,image/gif,image/avif";

type Tool = "select" | "pin" | "region" | "path";
type Remote = { clientId: number; name: string; color: string; x: number; y: number };

export function MapView({ nodeId }: { nodeId: string }) {
  return (
    <ReactFlowProvider>
      <MapCanvas key={nodeId} nodeId={nodeId} />
    </ReactFlowProvider>
  );
}

/** The size of a picture, read in the browser before it's uploaded. */
async function pictureSize(file: File): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

const near = (a: number[], x: number, y: number, by: number) => a.length >= 2 && Math.hypot(a[a.length - 2] - x, a[a.length - 1] - y) < by;
const pairs = (points: number[]) => Array.from({ length: Math.floor(points.length / 2) }, (_, i) => [points[i * 2], points[i * 2 + 1]] as const);
const centroid = (points: number[]) => {
  const p = pairs(points);
  return p.reduce((acc, [x, y]) => [acc[0] + x / p.length, acc[1] + y / p.length], [0, 0]);
};

function MapCanvas({ nodeId }: { nodeId: string }) {
  const { project, user, binder, registerEditor, setDocStats, openNode } = useWorkspace();
  const { index } = useStore(binder);
  const node = index.byId.get(nodeId);
  const editable = Boolean(node?.actions.includes("edit"));
  const { resolvedTheme } = useTheme();
  const flow = useReactFlow();
  const horizon = useHorizon();
  const { doc, provider, ready, sync } = useRoomDoc({ projectId: project.id, room: `node-${nodeId}` });
  const maps = useMemo(() => (doc ? canvasMaps(doc) : null), [doc]);
  const [marks, setMarks] = useState<Record<string, MarkData>>({});
  const [meta, setMeta] = useState<MapMeta>({});
  const [tool, setTool] = useState<Tool>("select");
  const [draft, setDraft] = useState<number[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [picker, setPicker] = useState<"new" | "link" | null>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  // Every pin, region and path as a list: the way to them without a mouse.
  const [listOpen, setListOpen] = useState(false);
  const [hiddenLayers, setHiddenLayers] = useState<Set<string>>(new Set());
  const [remotes, setRemotes] = useState<Remote[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  // The map's size on screen, for which tiles of a large picture are in view.
  const [pane, setPane] = useState({ width: 0, height: 0 });
  const fileInput = useRef<HTMLInputElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const fitted = useRef(false);

  useEffect(() => {
    setDocStats(nodeId, { sync });
  }, [nodeId, setDocStats, sync]);
  useEffect(() => {
    const element = paneRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setPane({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!maps) return;
    const pull = () => {
      setMarks(maps.marks.toJSON() as Record<string, MarkData>);
      setMeta(maps.meta.toJSON() as MapMeta);
    };
    pull();
    maps.marks.observe(pull);
    maps.meta.observe(pull);
    return () => {
      maps.marks.unobserve(pull);
      maps.meta.unobserve(pull);
    };
  }, [maps]);

  const width = Number(meta.width) || 0;
  const height = Number(meta.height) || 0;
  const hasPicture = Boolean(meta.fileId && width && height);
  const fit = useCallback((duration = 300) => {
    if (width && height) void flow.fitBounds({ x: 0, y: 0, width, height }, { padding: 0.04, duration });
  }, [flow, height, width]);
  useEffect(() => {
    if (ready && hasPicture && !fitted.current) {
      fitted.current = true;
      requestAnimationFrame(() => fit(0));
    }
  }, [fit, hasPicture, ready]);

  // Other people's pointers, through the room's awareness, as on a canvas.
  useEffect(() => {
    if (!provider) return;
    const awareness = provider.awareness;
    awareness.setLocalStateField("user", { name: user.name, color: colorFor(user.id) });
    const onChange = () => {
      const list: Remote[] = [];
      awareness.getStates().forEach((state, clientId) => {
        const s = state as { user?: { name: string; color: string }; pointer?: { x: number; y: number } | null };
        if (clientId !== awareness.clientID && s.user && s.pointer) list.push({ clientId, ...s.user, ...s.pointer });
      });
      setRemotes(list);
    };
    awareness.on("change", onChange);
    return () => awareness.off("change", onChange);
  }, [provider, user.id, user.name]);

  const transact = useCallback((fn: () => void) => doc?.transact(fn, LOCAL), [doc]);
  const update = useCallback(
    (id: string, patch: Partial<MarkData>) =>
      transact(() => {
        const mark = maps?.marks.get(id);
        if (mark) maps!.marks.set(id, { ...mark, ...patch });
      }),
    [maps, transact],
  );
  const add = useCallback(
    (mark: MarkData) => {
      if (!maps || !editable) return;
      const id = crypto.randomUUID();
      transact(() => maps.marks.set(id, mark));
      setSelected(id);
      return id;
    },
    [editable, maps, transact],
  );
  const remove = useCallback(
    (id: string) => {
      const before = maps?.marks.get(id);
      transact(() => maps?.marks.delete(id));
      setSelected(null);
      if (before && maps) {
        const what = before.type === "pin" ? "pin" : before.type === "region" ? "region" : "path";
        undoToast(`Removed the ${what} from the map`, () => transact(() => maps.marks.set(id, before)));
      }
    },
    [maps, transact],
  );

  // History: snapshot and restore, the same handle a canvas registers.
  useEffect(() => {
    if (!doc || !maps) return;
    registerEditor(nodeId, {
      focus: () => {},
      focusEnd: () => {},
      scrollToHeading: () => {},
      scrollToHeadingText: () => {},
      linkMention: () => false,
      comment: () => {},
      revealThread: () => {},
      resolveSuggestion: () => {},
      snapshot: () => Y.encodeStateAsUpdate(doc),
      replaceContent: (value) => {
        if (!editable || !value || typeof value !== "object") return;
        const { marks: restored, map } = value as { marks?: Record<string, MarkData>; map?: MapMeta };
        transact(() => {
          maps.marks.clear();
          for (const [id, mark] of Object.entries(restored ?? {})) maps.marks.set(id, mark);
          maps.meta.clear();
          for (const [key, v] of Object.entries(map ?? {})) if (v !== undefined) maps.meta.set(key, v);
        });
      },
    });
    return () => registerEditor(nodeId, null);
  }, [doc, editable, maps, nodeId, registerEditor, transact]);

  // ---- What's shown ---------------------------------------------------------------------------

  const layerOf = (mark: MarkData) => mark.layer?.trim() || MAIN_LAYER;
  const layers = useMemo(() => {
    const counts = new Map<string, number>();
    for (const mark of Object.values(marks)) counts.set(layerOf(mark), (counts.get(layerOf(mark)) ?? 0) + 1);
    return [...counts.entries()].sort(([a], [b]) => (a === MAIN_LAYER ? -1 : b === MAIN_LAYER ? 1 : a.localeCompare(b)));
  }, [marks]);
  // Under a spoiler horizon, a mark for something the audience doesn't know yet isn't drawn.
  const beyondHorizon = (mark: MarkData) => Boolean(horizon && mark.nodeId && !horizon.knows(mark.nodeId));
  const shown = Object.entries(marks).filter(([, mark]) => !hiddenLayers.has(layerOf(mark)) && !beyondHorizon(mark));
  const hiddenByHorizon = Object.values(marks).filter(beyondHorizon).length;
  const selectedMark = selected ? marks[selected] : undefined;

  /** The note a mark stands for, if the viewer can see it; "gone" when it's restricted, deleted or in the trash. */
  const targetOf = (mark: MarkData): BinderNode | "gone" | null => {
    if (!mark.nodeId) return null;
    const target = index.byId.get(mark.nodeId);
    return !target || isTrashed(index, target.id) ? "gone" : target;
  };
  // Never the title of a note the viewer can't see.
  const nameOf = (mark: MarkData) => {
    const target = targetOf(mark);
    return mark.label?.trim() || (target === "gone" ? "Restricted" : target?.title) || "";
  };
  const openMark = (mark: MarkData, mode: "tab" | "split" = "tab") => {
    const target = targetOf(mark);
    if (target && target !== "gone") openNode(target.id, mode);
  };

  const kindOf = (mark: MarkData) => (mark.type === "pin" ? "Pin" : mark.type === "region" ? "Region" : "Path");
  /** Selects a mark and brings it into view (from the list). */
  const reveal = (id: string) => {
    const mark = marks[id];
    if (!mark) return;
    setSelected(id);
    const [x, y] = mark.type === "pin" ? [mark.x ?? 0, mark.y ?? 0] : mark.type === "region" ? centroid(mark.points ?? []) : [mark.points?.[0] ?? 0, mark.points?.[1] ?? 0];
    void flow.setCenter(x, y, { zoom: flow.getZoom(), duration: 300 });
  };
  const rename = async (id: string) => {
    const mark = marks[id];
    if (!mark) return;
    const label = await promptText({ title: `Rename this ${kindOf(mark).toLowerCase()}`, label: "Label", defaultValue: nameOf(mark), confirmLabel: "Rename" });
    if (label !== null) update(id, { label: label.trim().slice(0, 120) || undefined });
  };

  // ---- Drawing --------------------------------------------------------------------------------

  const at = (e: { clientX: number; clientY: number }) => {
    const p = flow.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    return { x: Math.round(Math.min(Math.max(p.x, 0), width)), y: Math.round(Math.min(Math.max(p.y, 0), height)) };
  };
  const finish = useCallback(() => {
    const enough = tool === "region" ? draft.length >= 6 : draft.length >= 4;
    if (enough && (tool === "region" || tool === "path")) add({ type: tool, points: draft, color: tool === "region" ? swatches[4] : swatches[0] });
    setDraft([]);
    setTool("select");
  }, [add, draft, tool]);

  // Keys act on this map only while it has focus (it takes it when clicked), so typing elsewhere never removes a pin.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const typing = (e.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable=true]");
    if (typing) return;
    if (e.key === "Escape") {
      setDraft([]);
      setTool("select");
      setSelected(null);
      setPicker(null);
    } else if (e.key === "Enter" && draft.length) finish();
    else if ((e.key === "Backspace" || e.key === "Delete") && selected && editable) {
      e.preventDefault();
      remove(selected);
    }
  };

  const choosePicture = async (file: File | undefined) => {
    if (!file || !maps) return;
    if (!images.split(",").includes(file.type)) return void toast.error("Choose a PNG, JPEG, WebP, GIF or AVIF picture.");
    setUploading(true);
    const before = maps.meta.toJSON() as MapMeta;
    try {
      const size = await pictureSize(file);
      const row = await uploadAttachment(project.id, nodeId, file);
      // A very large picture is cut once, here: an overview to show zoomed out, and tiles for close up (./map-tiles.ts).
      let overview: MapMeta["overview"];
      let tiles: MapMeta["tiles"];
      if (needsTiles(size.width, size.height)) {
        try {
          const cut = await cutPicture(file, size.width, size.height);
          setProgress(`Preparing the map: 0 of ${cut.cols * cut.rows + 1}`);
          const base = file.name.replace(/\.[a-z0-9]+$/i, "");
          const asFile = (blob: Blob, name: string) => new File([blob], `${name}.${blob.type === "image/webp" ? "webp" : "jpg"}`, { type: blob.type });
          const shown = await uploadAttachment(project.id, nodeId, asFile(cut.overview.blob, `${base} (overview)`));
          overview = { fileId: shown.id, width: cut.overview.width, height: cut.overview.height };
          const ids: string[] = [];
          for await (const blob of cut.tiles()) {
            ids.push((await uploadAttachment(project.id, nodeId, asFile(blob, `${base} (tile ${ids.length + 1})`))).id);
            setProgress(`Preparing the map: ${ids.length + 1} of ${cut.cols * cut.rows + 1}`);
          }
          tiles = { size: cut.size, cols: cut.cols, rows: cut.rows, ids };
        } catch (error) {
          // Shown whole instead: slower to move about, but all there.
          toast.message(errorText(error, "This picture is too large for the browser to cut into tiles, so it's shown whole. Moving about may be slow."));
        }
      }
      transact(() => {
        maps.meta.set("fileId", row.id);
        maps.meta.set("width", size.width);
        maps.meta.set("height", size.height);
        if (overview && tiles) {
          maps.meta.set("overview", overview);
          maps.meta.set("tiles", tiles);
        } else {
          maps.meta.delete("overview");
          maps.meta.delete("tiles");
        }
      });
      fitted.current = false;
      // The old picture's overview and tiles were only ever copies of it.
      for (const id of [before.overview?.fileId, ...(before.tiles?.ids ?? [])]) if (id) void removeAttachment(id).catch(() => {});
    } catch (error) {
      toast.error(errorText(error, "The picture couldn't be uploaded."));
    } finally {
      setUploading(false);
      setProgress(null);
    }
  };

  if (!node) return null;

  return (
    <div
      ref={paneRef}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onPointerDownCapture={(e) => {
        // Take focus for the keys above, unless a field inside the map was clicked.
        if (!(e.target as HTMLElement).closest("input, textarea, select")) paneRef.current?.focus({ preventScroll: true });
      }}
      className={cn("relative h-full outline-none", tool !== "select" && "[&_.react-flow\\_\\_pane]:!cursor-crosshair")}
      onDragOver={(e) => {
        if (editable && hasPicture && e.dataTransfer.types.includes(NODE_MIME)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }
      }}
      onDrop={(e) => {
        const id = e.dataTransfer.getData(NODE_MIME);
        if (!id || !editable || !hasPicture) return;
        e.preventDefault();
        add({ type: "pin", ...at(e), nodeId: id });
      }}
      onPointerMove={(e) => {
        const p = flow.screenToFlowPosition({ x: e.clientX, y: e.clientY });
        provider?.awareness.setLocalStateField("pointer", { x: Math.round(p.x), y: Math.round(p.y) });
      }}
      onPointerLeave={() => provider?.awareness.setLocalStateField("pointer", null)}
    >
      <ReactFlow
        nodes={[]}
        edges={[]}
        onPaneClick={(e) => {
          if (!hasPicture) return;
          if (tool === "select") return setSelected(null);
          const p = at(e);
          if (tool === "pin") {
            add({ type: "pin", ...p, label: "New pin" });
            setTool("select");
            return;
          }
          // A second click on the same spot (a double click) finishes the shape.
          if (near(draft, p.x, p.y, 4 / flow.getZoom())) return finish();
          setDraft((d) => [...d, p.x, p.y]);
        }}
        zoomOnDoubleClick={tool === "select"}
        colorMode={resolvedTheme === "dark" ? "dark" : "light"}
        minZoom={0.02}
        maxZoom={8}
        proOptions={{ hideAttribution: true }}
        className="bg-muted/40"
      >
        {hasPicture && (
          <ViewportPortal>
            <MapPicture meta={meta} width={width} height={height} alt={`The map ${node.title}`} pane={pane} />
            <Shapes
              marks={shown.filter(([, m]) => m.type !== "pin")}
              draft={draft}
              tool={tool}
              selected={selected}
              width={width}
              height={height}
              nameOf={nameOf}
              onSelect={(id) => setSelected(id)}
              onOpen={(mark) => openMark(mark)}
              kindOf={kindOf}
              editable={editable}
              onPoints={(id, points) => update(id, { points })}
            />
            {shown
              .filter(([, m]) => m.type === "pin")
              .map(([id, mark]) => (
                <Pin
                  key={id}
                  mark={mark}
                  name={nameOf(mark)}
                  target={targetOf(mark)}
                  selected={selected === id}
                  draggable={editable && tool === "select"}
                  onSelect={() => setSelected(id)}
                  onOpen={() => openMark(mark)}
                  onMove={(x, y) => update(id, { x: Math.round(Math.min(Math.max(x, 0), width)), y: Math.round(Math.min(Math.max(y, 0), height)) })}
                />
              ))}
          </ViewportPortal>
        )}
        <Controls showInteractive={false} position="bottom-left" />
        <RemotePointers remotes={remotes} />
      </ReactFlow>

      <input ref={fileInput} type="file" accept={images} className="hidden" onChange={(e) => (void choosePicture(e.target.files?.[0]), (e.target.value = ""))} />

      {hasPicture && (
        <div className="absolute top-3 left-3 z-10 flex items-center gap-1 rounded-lg border bg-popover p-1 shadow-sm">
          <ToolButton icon="cursor-linear" label="Select and move" shortcut="Esc" pressed={tool === "select"} onClick={() => (setTool("select"), setDraft([]))} />
          <ToolButton icon="map-point-linear" label="Add a pin: click the map (or drag a note in from the binder)" pressed={tool === "pin"} disabled={!editable} onClick={() => (setTool("pin"), setDraft([]))} />
          <ToolButton icon="pen-2-linear" label="Draw a region: click its corners, then Enter or double-click" pressed={tool === "region"} disabled={!editable} onClick={() => (setTool("region"), setDraft([]))} />
          <ToolButton icon="route-linear" label="Draw a path: click along it, then Enter or double-click" pressed={tool === "path"} disabled={!editable} onClick={() => (setTool("path"), setDraft([]))} />
          <span className="mx-0.5 h-5 w-px bg-border" />
          <ToolButton icon="document-add-linear" label="Pin a note" disabled={!editable} onClick={() => setPicker(picker === "new" ? null : "new")} />
          <ToolButton icon="layers-linear" label="Layers" pressed={layersOpen} onClick={() => (setLayersOpen(!layersOpen), setListOpen(false))} />
          <ToolButton icon="list-linear" label="Every pin, region and path as a list" pressed={listOpen} onClick={() => (setListOpen(!listOpen), setLayersOpen(false))} />
          <ToolButton icon="full-screen-linear" label="Fit the map" onClick={() => fit()} />
          {editable && <ToolButton icon="gallery-linear" label="Change the picture" disabled={uploading} onClick={() => fileInput.current?.click()} />}
          {!editable && <span className="px-2 text-xs text-muted-foreground">Read only</span>}
          {hiddenByHorizon > 0 && (
            <Tooltip content="Marks for what the audience doesn't know yet, at the spoiler horizon">
              <span tabIndex={0} className="rounded px-2 text-xs text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
                {hiddenByHorizon} hidden by the horizon
              </span>
            </Tooltip>
          )}
        </div>
      )}

      {draft.length > 0 && (
        <div className="absolute bottom-14 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-lg border bg-popover px-3 py-1.5 text-xs shadow-sm">
          {tool === "region" ? "Click the region's corners." : "Click along the path."} {pairs(draft).length} points.
          <button type="button" onClick={finish} className="rounded-md bg-foreground px-2 py-1 text-background">
            Finish (Enter)
          </button>
          <button type="button" onClick={() => (setDraft([]), setTool("select"))} className="rounded-md px-2 py-1 hover:bg-accent">
            Cancel (Esc)
          </button>
        </div>
      )}

      {layersOpen && hasPicture && (
        <div className="absolute top-14 left-3 z-20 grid w-56 gap-1 rounded-lg border bg-popover p-2 text-ui-sm shadow-lg">
          <p className="px-1 text-meta font-medium text-muted-foreground">Layers</p>
          {layers.length === 0 && <p className="px-1 py-1 text-xs text-muted-foreground">Nothing on the map yet.</p>}
          {layers.map(([name, count]) => (
            <label key={name} className="flex min-h-7 items-center gap-2 rounded px-1 hover:bg-accent">
              <input
                type="checkbox"
                checked={!hiddenLayers.has(name)}
                onChange={(e) =>
                  setHiddenLayers((h) => {
                    const next = new Set(h);
                    if (e.target.checked) next.delete(name);
                    else next.add(name);
                    return next;
                  })
                }
                className="size-4 accent-[var(--ember)]"
              />
              <span className="flex-1 truncate">{name}</span>
              <span className="text-xs text-faint">{count}</span>
            </label>
          ))}
          <p className="px-1 pt-1 text-xs text-faint">Put a pin, region or path on a layer in its panel. Hiding a layer is just for you.</p>
        </div>
      )}

      {listOpen && hasPicture && (
        <MarkList
          marks={shown}
          selected={selected}
          editable={editable}
          nameOf={nameOf}
          kindOf={kindOf}
          onSelect={reveal}
          onRename={(id) => void rename(id)}
          onRemove={remove}
          onClose={() => setListOpen(false)}
        />
      )}

      {picker && (
        <NotePicker
          maps
          onPick={(id) => {
            if (picker === "link" && selected) update(selected, { nodeId: id });
            else {
              // In the middle of what's on screen.
              const box = paneRef.current?.getBoundingClientRect();
              const p = box ? at({ clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 }) : { x: width / 2, y: height / 2 };
              add({ type: "pin", ...p, nodeId: id });
            }
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}

      {selected && selectedMark && (
        <MarkEditor
          mark={selectedMark}
          editable={editable}
          layers={layers.map(([name]) => name)}
          target={targetOf(selectedMark)}
          onChange={(patch) => update(selected, patch)}
          onLink={() => setPicker("link")}
          onOpen={(mode) => openMark(selectedMark, mode)}
          onRemove={() => remove(selected)}
          onClose={() => setSelected(null)}
        />
      )}

      {ready && !hasPicture && (
        <div className="absolute inset-0 z-10 grid place-items-center">
          <div className="max-w-sm text-center">
            <Icon name="map-bold-duotone" className="mx-auto size-10 text-faint" />
            <p className="mt-3 font-display text-2xl">A map starts with a picture</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {editable
                ? "Choose a picture of your world: a drawn map, a satellite photo, a floor plan. Then pin notes to it and draw regions and paths."
                : "No picture has been chosen for this map yet."}
            </p>
            {editable && (
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInput.current?.click()}
                className="mt-4 inline-flex h-9 items-center gap-2 rounded-md bg-foreground px-4 text-sm text-background disabled:opacity-50"
              >
                <Icon name="gallery-linear" className="size-4" />
                {uploading ? (progress ?? "Uploading…") : "Choose a picture…"}
              </button>
            )}
            <p className="mt-2 text-xs text-faint">PNG, JPEG, WebP, GIF or AVIF.</p>
          </div>
        </div>
      )}
      {!ready && <div className="absolute top-3 left-3 z-10 rounded-md bg-popover px-2 py-1 text-xs text-muted-foreground shadow-sm">Loading…</div>}
      {uploading && hasPicture && (
        <div className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-md bg-popover px-2.5 py-1 text-xs text-muted-foreground shadow-sm">{progress ?? "Uploading the picture…"}</div>
      )}
    </div>
  );
}

// ---- The picture --------------------------------------------------------------------------------------

/** One of the map's pictures, in place, never in the way of a click. */
function Picture({ src, alt, left = 0, top = 0, width, height, lazy }: { src: string; alt: string; left?: number; top?: number; width: number; height: number; lazy?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a map's picture is a private file of the project, served by /api/files
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      draggable={false}
      decoding="async"
      {...(lazy && { loading: "lazy" as const })}
      className="pointer-events-none absolute max-w-none select-none"
      style={{ left, top, width, height }}
    />
  );
}

/**
 * The map's picture: whole, or for a very large one (./map-tiles.ts) its
 * overview, with the full-size tiles on screen over it once the map is zoomed
 * in past what the overview can show.
 */
function MapPicture({ meta, width, height, alt, pane }: { meta: MapMeta; width: number; height: number; alt: string; pane: { width: number; height: number } }) {
  const { x, y, zoom } = useViewport();
  const { overview, tiles } = meta;
  if (!overview || !tiles) return <Picture src={fileUrl(String(meta.fileId))} alt={alt} width={width} height={height} />;
  const close = zoom > (overview.width / width) * 1.25;
  const view = { left: -x / zoom, top: -y / zoom, right: (pane.width - x) / zoom, bottom: (pane.height - y) / zoom };
  return (
    <>
      <Picture src={fileUrl(overview.fileId)} alt={alt} width={width} height={height} />
      {close &&
        visibleTiles(view, tiles).map(([col, row]) => {
          const id = tiles.ids[row * tiles.cols + col];
          if (!id) return null;
          return (
            <Picture
              key={id}
              src={fileUrl(id)}
              alt=""
              left={col * tiles.size}
              top={row * tiles.size}
              width={Math.min(tiles.size, width - col * tiles.size)}
              height={Math.min(tiles.size, height - row * tiles.size)}
              lazy
            />
          );
        })}
    </>
  );
}

// ---- Pins, regions and paths ----------------------------------------------------------------------

function Pin({
  mark,
  name,
  target,
  selected,
  draggable,
  onSelect,
  onOpen,
  onMove,
}: {
  mark: MarkData;
  name: string;
  target: BinderNode | "gone" | null;
  selected: boolean;
  draggable: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onMove: (x: number, y: number) => void;
}) {
  const { zoom } = useViewport();
  const flow = useReactFlow();
  const drag = useRef<{ moved: boolean } | null>(null);
  const color = mark.color ?? "var(--ember)";
  return (
    // At the point itself, with no size; what's inside is scaled back so a pin is the same size at any zoom.
    <div className="absolute" style={{ left: mark.x, top: mark.y }}>
      <div className="origin-top-left" style={{ transform: `scale(${1 / zoom})` }}>
        <button
          type="button"
          aria-label={name || "Pin"}
          aria-pressed={selected}
          // `nopan`: dragging a pin moves it rather than the map.
          className={cn("nopan absolute flex flex-col items-center", draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer")}
          style={{ left: -PIN_W / 2, top: -PIN_H, width: PIN_W }}
          onPointerDown={(e) => {
            e.stopPropagation();
            onSelect();
            if (!draggable) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { moved: false };
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            drag.current.moved = true;
            const p = flow.screenToFlowPosition({ x: e.clientX, y: e.clientY });
            onMove(p.x, p.y);
          }}
          onPointerUp={() => (drag.current = null)}
          // Enter or Space on a focused pin selects it, as a click does.
          onClick={onSelect}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
        >
          <svg width={PIN_W} height={PIN_H} viewBox="0 0 28 36" className={cn("drop-shadow", selected && "drop-shadow-[0_0_4px_var(--ember)]")}>
            <path d="M14 35C14 35 26 21.5 26 13.5C26 6.6 20.6 1 14 1S2 6.6 2 13.5C2 21.5 14 35 14 35Z" fill={color} stroke="white" strokeWidth="2" />
            <circle cx="14" cy="13.5" r="4.5" fill="white" />
          </svg>
          {name && (
            <span className={cn("mt-0.5 max-w-40 truncate rounded bg-background/90 px-1.5 py-0.5 text-meta font-medium shadow-sm", selected && "ring-1 ring-ember")}>
              {target === "gone" && <Icon name="lock-keyhole-minimalistic-linear" className="mr-0.5 inline size-3" />}
              {target && target !== "gone" && <NodeIcon node={target} className="mr-0.5 inline size-3 text-muted-foreground" />}
              {name}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

function Shapes({
  marks,
  draft,
  tool,
  selected,
  width,
  height,
  nameOf,
  onSelect,
  onOpen,
  kindOf,
  editable,
  onPoints,
}: {
  kindOf: (mark: MarkData) => string;
  marks: Array<[string, MarkData]>;
  draft: number[];
  tool: Tool;
  selected: string | null;
  width: number;
  height: number;
  nameOf: (mark: MarkData) => string;
  onSelect: (id: string) => void;
  onOpen: (mark: MarkData) => void;
  editable: boolean;
  /** A region's or path's corners, moved, added or taken away. */
  onPoints: (id: string, points: number[]) => void;
}) {
  const { zoom } = useViewport();
  const interactive = tool === "select";
  const points = (p: number[]) => pairs(p).map(([x, y]) => `${x},${y}`).join(" ");
  const editing = interactive && editable && selected ? marks.find(([id, mark]) => id === selected && mark.type !== "pin" && (mark.points?.length ?? 0) >= 4) : undefined;
  return (
    <svg width={width} height={height} className="pointer-events-none absolute top-0 left-0 overflow-visible">
      {marks.map(([id, mark]) => {
        if (!mark.points || mark.points.length < 4) return null;
        const color = mark.color ?? (mark.type === "region" ? swatches[4] : swatches[0]);
        const isSelected = selected === id;
        const handlers = {
          onPointerDown: (e: React.PointerEvent) => {
            if (!interactive) return;
            e.stopPropagation();
            onSelect(id);
          },
          onDoubleClick: (e: React.MouseEvent) => {
            e.stopPropagation();
            onOpen(mark);
          },
        };
        const [cx, cy] = mark.type === "region" ? centroid(mark.points) : [mark.points[0], mark.points[1]];
        const name = nameOf(mark);
        return (
          // Focusable: Enter or Space selects it (opening its panel), Delete removes it (with Undo), as a pin.
          <g
            key={id}
            role="button"
            tabIndex={interactive ? 0 : -1}
            aria-label={`${kindOf(mark)}: ${name || "no label"}`}
            aria-pressed={isSelected}
            onKeyDown={(e) => {
              if (!interactive || (e.key !== "Enter" && e.key !== " ")) return;
              e.preventDefault();
              e.stopPropagation();
              onSelect(id);
            }}
            className={cn(interactive && "nopan cursor-pointer", "outline-none focus-visible:[&>*:first-child]:[stroke:var(--ring)] focus-visible:[&>*:first-child]:[stroke-width:4px]")}
            style={{ pointerEvents: interactive ? "auto" : "none" }}
          >
            {mark.type === "region" ? (
              <polygon points={points(mark.points)} fill={color} fillOpacity={isSelected ? 0.32 : 0.18} stroke={color} strokeWidth={isSelected ? 3 : 2} vectorEffect="non-scaling-stroke" {...handlers} />
            ) : (
              <>
                {/* A wide, invisible line underneath, so a thin path is easy to click. */}
                <polyline points={points(mark.points)} fill="none" stroke="transparent" strokeWidth={14} vectorEffect="non-scaling-stroke" {...handlers} />
                <polyline points={points(mark.points)} fill="none" stroke={color} strokeWidth={isSelected ? 4 : 3} strokeDasharray="8 5" strokeLinecap="round" vectorEffect="non-scaling-stroke" className="pointer-events-none" />
              </>
            )}
            {name && (
              <text
                x={cx}
                y={cy}
                textAnchor="middle"
                dominantBaseline="middle"
                className="pointer-events-none fill-foreground font-sans font-medium"
                style={{ fontSize: 12 / zoom, paintOrder: "stroke", stroke: "var(--background)", strokeWidth: 3 / zoom }}
              >
                {name}
              </text>
            )}
          </g>
        );
      })}
      {editing && <Corners id={editing[0]} mark={editing[1]} width={width} height={height} onPoints={onPoints} />}
      {draft.length >= 2 && (
        <g className="pointer-events-none">
          <polyline points={points(draft)} fill={tool === "region" ? "var(--ember)" : "none"} fillOpacity={0.12} stroke="var(--ember)" strokeWidth={2} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
          {pairs(draft).map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={4 / zoom} fill="var(--ember)" />
          ))}
        </g>
      )}
    </svg>
  );
}

/**
 * A selected region's or path's corners, to drag. A dot halfway along each side
 * adds a corner there when dragged; double-clicking a corner takes it away, down
 * to three for a region and two for a path.
 */
function Corners({ id, mark, width, height, onPoints }: { id: string; mark: MarkData; width: number; height: number; onPoints: (id: string, points: number[]) => void }) {
  const { zoom } = useViewport();
  const flow = useReactFlow();
  // The corner being dragged, and the shape's corners as they are mid-drag.
  const drag = useRef<{ index: number; points: number[] } | null>(null);
  const corners = pairs(mark.points ?? []);
  const closed = mark.type === "region";
  const fewest = closed ? 3 : 2;
  const r = 5.5 / zoom;
  const sides = corners.flatMap(([x, y], i) => {
    const next = corners[i + 1] ?? (closed ? corners[0] : undefined);
    return next ? [{ i, x: (x + next[0]) / 2, y: (y + next[1]) / 2 }] : [];
  });

  const start = (e: React.PointerEvent<SVGCircleElement>, index: number, points: number[]) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { index, points };
  };
  const move = (e: React.PointerEvent<SVGCircleElement>) => {
    const d = drag.current;
    if (!d) return;
    const p = flow.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const next = [...d.points];
    next[d.index * 2] = Math.round(Math.min(Math.max(p.x, 0), width));
    next[d.index * 2 + 1] = Math.round(Math.min(Math.max(p.y, 0), height));
    d.points = next;
    onPoints(id, next);
  };
  const end = () => {
    drag.current = null;
  };
  const addCorner = (e: React.PointerEvent<SVGCircleElement>, side: { i: number; x: number; y: number }) => {
    const next = [...(mark.points ?? [])];
    next.splice((side.i + 1) * 2, 0, Math.round(side.x), Math.round(side.y));
    onPoints(id, next);
    start(e, side.i + 1, next);
  };
  const removeCorner = (e: React.MouseEvent, i: number) => {
    e.stopPropagation();
    if (corners.length <= fewest) return;
    const next = [...(mark.points ?? [])];
    next.splice(i * 2, 2);
    onPoints(id, next);
  };

  return (
    <g className="nopan" style={{ pointerEvents: "auto" }}>
      {sides.map((side) => (
        <circle
          key={`side-${side.i}`}
          cx={side.x}
          cy={side.y}
          r={r * 0.75}
          fill="var(--background)"
          stroke="var(--ember)"
          strokeWidth={1.5 / zoom}
          className="cursor-copy"
          onPointerDown={(e) => addCorner(e, side)}
          onPointerMove={move}
          onPointerUp={end}
        >
          <title>Drag to add a corner</title>
        </circle>
      ))}
      {corners.map(([x, y], i) => (
        <circle
          key={`corner-${i}`}
          cx={x}
          cy={y}
          r={r}
          fill="var(--ember)"
          stroke="white"
          strokeWidth={1.5 / zoom}
          className="cursor-move"
          onPointerDown={(e) => start(e, i, [...(mark.points ?? [])])}
          onPointerMove={move}
          onPointerUp={end}
          onDoubleClick={(e) => removeCorner(e, i)}
        >
          <title>{corners.length > fewest ? "Drag to move; double-click to take away" : "Drag to move"}</title>
        </circle>
      ))}
    </g>
  );
}

// ---- Panels ------------------------------------------------------------------------------------

/** The marks on the map as rows, grouped by kind: select, rename and remove each without a mouse. */
function MarkList({
  marks,
  selected,
  editable,
  nameOf,
  kindOf,
  onSelect,
  onRename,
  onRemove,
  onClose,
}: {
  marks: Array<[string, MarkData]>;
  selected: string | null;
  editable: boolean;
  nameOf: (mark: MarkData) => string;
  kindOf: (mark: MarkData) => string;
  onSelect: (id: string) => void;
  onRename: (id: string) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  const groups = (["region", "pin", "path"] as const)
    .map((type) => ({ type, rows: marks.filter(([, m]) => m.type === type).sort(([, a], [, b]) => nameOf(a).localeCompare(nameOf(b))) }))
    .filter((g) => g.rows.length);
  const heading = { region: "Regions", pin: "Pins", path: "Paths" } as const;
  return (
    <aside
      aria-label="On this map"
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.stopPropagation();
        onClose();
      }}
      className="absolute top-14 left-3 z-20 flex max-h-[calc(100%-4.5rem)] w-72 flex-col rounded-lg border bg-popover text-ui-sm shadow-lg"
    >
      <div className="flex items-center gap-2 border-b p-2 pl-3">
        <h3 className="min-w-0 flex-1 font-medium">On this map</h3>
        <IconButton icon="close-linear" label="Close the list" size="xs" onClick={onClose} />
      </div>
      {groups.length === 0 ? (
        <p className="p-3 text-muted-foreground">Nothing on the map yet. Add a pin, or draw a region or a path.</p>
      ) : (
        <div className="min-h-0 overflow-y-auto p-1">
          {groups.map((g) => (
            <section key={g.type} aria-label={heading[g.type]} className="grid gap-0.5 pb-1">
              <p className="px-2 pt-1 text-meta font-medium text-muted-foreground">
                {heading[g.type]} · {g.rows.length}
              </p>
              <ul>
                {g.rows.map(([id, mark]) => {
                  const name = nameOf(mark) || `${kindOf(mark)} with no label`;
                  return (
                    <li key={id} className={cn("flex items-center gap-1 rounded-md pl-1", selected === id && "bg-accent")}>
                      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: mark.color ?? (mark.type === "region" ? swatches[4] : swatches[0]) }} aria-hidden />
                      <button
                        type="button"
                        aria-current={selected === id || undefined}
                        onClick={() => onSelect(id)}
                        className="min-h-8 min-w-0 flex-1 truncate rounded px-1 text-left outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      >
                        {name}
                      </button>
                      {editable && (
                        <>
                          <IconButton icon="pen-linear" label={`Rename ${name}`} size="xs" onClick={() => onRename(id)} />
                          <IconButton icon="trash-bin-minimalistic-linear" label={`Remove ${name}`} size="xs" variant="destructive" onClick={() => onRemove(id)} />
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </aside>
  );
}

const fieldClass = "h-7 w-full rounded-md border border-input bg-transparent px-2 text-ui-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

function Commit({
  value,
  onCommit,
  placeholder,
  label,
  suggestions,
}: {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  label: string;
  suggestions?: string[];
}) {
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setDraft(value);
  }
  const field = {
    value: draft,
    placeholder,
    "aria-label": label,
    onChange: (e: ChangeEvent<HTMLInputElement>) => setDraft(e.target.value),
    onBlur: () => draft !== value && onCommit(draft),
    onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => e.key === "Enter" && e.currentTarget.blur(),
    className: fieldClass,
  };
  return suggestions ? <SuggestInput {...field} suggestions={suggestions} /> : <input {...field} />;
}

function MarkEditor({
  mark,
  editable,
  layers,
  target,
  onChange,
  onLink,
  onOpen,
  onRemove,
  onClose,
}: {
  mark: MarkData;
  editable: boolean;
  layers: string[];
  target: BinderNode | "gone" | null;
  onChange: (patch: Partial<MarkData>) => void;
  onLink: () => void;
  onOpen: (mode: "tab" | "split") => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const kind = mark.type === "pin" ? "Pin" : mark.type === "region" ? "Region" : "Path";
  const isMapLink = target && target !== "gone" && target.kind === "canvas" && target.settings?.board === "map";
  return (
    <div className="absolute top-3 right-3 z-20 grid w-64 gap-2.5 rounded-lg border bg-popover p-3 text-ui-sm shadow-md">
      <div className="flex items-center justify-between">
        <p className="text-meta font-medium text-muted-foreground">{kind}</p>
        <IconButton icon="close-linear" label="Close" size="xs" onClick={onClose} />
      </div>
      {editable && mark.type !== "pin" && <p className="text-xs text-faint">Drag a corner to move it, or a dot on a side to add one. Double-click a corner to take it away.</p>}
      {target === "gone" ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon name="lock-keyhole-minimalistic-linear" className="size-3.5" />A note you can&apos;t see, or that&apos;s been deleted.
        </p>
      ) : target ? (
        <div className="grid gap-1">
          <p className="flex items-center gap-1.5 font-medium">
            <NodeIcon node={target} className="size-4 text-muted-foreground" />
            <span className="truncate">{target.title}</span>
          </p>
          {target.synopsis && <p className="line-clamp-3 text-xs text-muted-foreground">{target.synopsis}</p>}
          <div className="flex flex-wrap gap-1">
            <button type="button" onClick={() => onOpen("tab")} className="flex h-8 items-center rounded-md border px-2 text-xs outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50">
              {isMapLink ? "Open its map" : "Open"}
            </button>
            <button type="button" onClick={() => onOpen("split")} className="flex h-8 items-center rounded-md border px-2 text-xs outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50">
              Open to the side
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Not linked to a note.</p>
      )}
      {editable && (
        <>
          <div className="flex flex-wrap gap-1">
            <button type="button" onClick={onLink} className="flex h-8 items-center rounded-md border px-2 text-xs outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50">
              {mark.nodeId ? "Link to another note" : "Link to a note…"}
            </button>
            {mark.nodeId && (
              <button type="button" onClick={() => onChange({ nodeId: undefined })} className="flex h-8 items-center rounded-md px-2 text-xs text-muted-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50">
                Unlink
              </button>
            )}
          </div>
          <Commit value={mark.label ?? ""} label="Label" placeholder={target && target !== "gone" ? `Label (or “${target.title}”)` : "Label"} onCommit={(label) => onChange({ label: label.trim().slice(0, 120) || undefined })} />
          <Commit value={mark.layer ?? ""} label="Layer" suggestions={layers} placeholder={`Layer (${MAIN_LAYER})`} onCommit={(layer) => onChange({ layer: layer.trim().slice(0, 60) || undefined })} />
          <Swatches value={mark.color} onChange={(color) => onChange({ color: color ?? undefined })} />
          <button type="button" onClick={onRemove} className="flex h-8 items-center justify-center gap-1.5 rounded-md text-destructive hover:bg-destructive/10">
            <Icon name="trash-bin-minimalistic-linear" className="size-3.5" />
            Remove from the map
          </button>
        </>
      )}
    </div>
  );
}

function NotePicker({ onPick, onClose, maps }: { onPick: (id: string) => void; onClose: () => void; maps?: boolean }) {
  const { binder } = useWorkspace();
  const { index } = useStore(binder);
  const [query, setQuery] = useState("");
  // Places first: they're what a map is mostly for. Other maps can be pinned too, which is how maps nest.
  const rank = (n: BinderNode) => (n.kind === "location" ? 0 : n.kind === "canvas" ? 1 : 2);
  const results = flatten(index)
    .filter((n) => n.kind !== "folder" && (n.kind !== "canvas" || (maps && n.settings?.board === "map")) && n.title.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, 50);
  return (
    <div className="absolute top-14 left-3 z-30 w-72 rounded-lg border bg-popover p-1.5 shadow-lg">
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "Enter" && results[0]) onPick(results[0].id);
        }}
        placeholder="Find a place, a character, a map…"
        aria-label="Find a note to pin"
        className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-ui-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
      <ul className="mt-1 max-h-72 overflow-y-auto">
        {results.map((n) => (
          <li key={n.id}>
            <button type="button" onClick={() => onPick(n.id)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-ui-sm outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50">
              <NodeIcon node={n} className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{n.title}</span>
            </button>
          </li>
        ))}
        {results.length === 0 && <li className="px-2 py-2 text-xs text-muted-foreground">No matching notes.</li>}
      </ul>
    </div>
  );
}

function RemotePointers({ remotes }: { remotes: Remote[] }) {
  const viewport = useViewport();
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {remotes.map((r) => (
        <div
          key={r.clientId}
          className="absolute flex items-center gap-1 transition-transform duration-75"
          style={{ transform: `translate(${r.x * viewport.zoom + viewport.x}px, ${r.y * viewport.zoom + viewport.y}px)` }}
        >
          <span className="size-2.5 rounded-full ring-2 ring-background" style={{ backgroundColor: r.color }} />
          <span className="rounded px-1 text-meta font-medium text-white" style={{ backgroundColor: r.color }}>
            {r.name}
          </span>
        </div>
      ))}
    </div>
  );
}
