"use client";

import type { NodeSettings } from "@plotra/db/schema";
import { Icon } from "@plotra/icons";
import { promptText } from "@plotra/ui/components/dialogs";
import { IconButton } from "@plotra/ui/components/icon-button";
import { undoToast } from "@plotra/ui/components/sonner";
import { cn } from "@plotra/ui/lib/utils";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { NODE_MIME } from "@/components/workspace/binder";
import { useStore } from "@/components/workspace/stores";
import { useHorizon } from "@/components/world/data";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { STORY_NOTICE, useStory } from "@/components/workflow/data";
import {
  canonicalDate,
  dayMinutes,
  formatDate,
  formatDuration,
  GREGORIAN_ID,
  gregorian,
  parseDuration,
  parseStoryDate,
  ticks,
  yearMinutes,
  type Calendar,
} from "@/lib/calendar";
import { read } from "@/lib/read";
import {
  createTimelineEvent,
  deleteTimelineEvent,
  setNodeSettings,
  updateTimelineEvent,
  type TimelineEvent,
} from "@/lib/story-actions";
import { swatches } from "@/lib/story";
import { flatten, nodeKindMeta, type BinderNode } from "@/lib/tree";
import { CalendarDialog } from "./calendar-dialog";
import {
  CommitInput,
  CommitTextarea,
  Divider,
  EmptyState,
  errorText,
  Field,
  Segmented,
  Swatches,
  ToolButton,
  Toolbar,
  ToolbarSelect,
} from "./view-ui";
import { useVocabulary } from "@/components/workspace/vocabulary";
import { SelectField } from "@plotra/ui/components/select-field";

// Timeline builder (plan.md 2.5): story time on a horizontal axis, in lanes
// by plot thread, POV character or location. Scenes appear by their "Story
// date" property (and last for their "Duration"), so dragging a scene here
// rewrites its date and vice versa. Standalone events live in timeline_event.
// Narrative mode lays scenes out in reading order instead, so flashbacks show
// up as dates jumping backwards.

type LaneMode = "none" | "thread" | "pov" | "location";
type Mode = "chronological" | "narrative";

type Item = {
  key: string;
  type: "scene" | "event";
  id: string;
  title: string;
  start: number;
  end: number | null;
  color: string;
  lanes: string[];
  /** Position in reading order (scenes only). */
  order?: number;
  node?: BinderNode;
  event?: TimelineEvent;
};

type Lane = { key: string; label: string; color?: string };

const NONE = "__none";
const ALL = "__all";
const ROW = 34;
const LANE_PAD = 10;
const LABEL_W = 168;
const SLOT_W = 190;
const MIN_ITEM_W = 110;
const timelineNotice = (id: string) => `timeline:${id}`;

const laneOptions: Array<{ value: LaneMode; label: string }> = [
  { value: "none", label: "No lanes" },
  { value: "thread", label: "Plot threads" },
  { value: "pov", label: "POV character" },
  { value: "location", label: "Location" },
];

// The how-to tip under the toolbar, until it's dismissed in this browser.
const HINT_KEY = "plotra:timeline-hint-dismissed";
const hintListeners = new Set<() => void>();
const hintDismissed = () => {
  try {
    return localStorage.getItem(HINT_KEY) === "1";
  } catch {
    return true;
  }
};
function useHint(): [boolean, () => void] {
  const dismissed = useSyncExternalStore(
    (on) => {
      hintListeners.add(on);
      return () => hintListeners.delete(on);
    },
    hintDismissed,
    () => true,
  );
  const dismiss = () => {
    try {
      localStorage.setItem(HINT_KEY, "1");
    } catch {}
    hintListeners.forEach((on) => on());
  };
  return [!dismissed, dismiss];
}

const str = (v: unknown) => (typeof v === "string" ? v : Array.isArray(v) ? String(v[0] ?? "") : v == null ? "" : String(v));

export function TimelineView({ nodeId }: { nodeId: string }) {
  const { binder } = useWorkspace();
  const node = useStore(binder).index.byId.get(nodeId);
  if (!node) return null;
  return <Timeline key={nodeId} timeline={node} />;
}

function Timeline({ timeline }: { timeline: BinderNode }) {
  const { project, binder, propertyDefs, actions, openNode, notify, onNotice } = useWorkspace();
  const words = useVocabulary();
  const { index } = useStore(binder);
  const defs = useStore(propertyDefs);
  const { data: story } = useStory();
  const editable = timeline.actions.includes("edit");
  const settings = timeline.settings ?? {};

  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [eventsTick, setEventsTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const load = (attempt: number) =>
      read("getTimelineEvents", project.id, timeline.id)
        .then((e) => !cancelled && setEvents(e))
        // A timeline created a moment ago may not be on the server yet.
        .catch(() => attempt < 5 && !cancelled && (retry = setTimeout(() => load(attempt + 1), 1000 * (attempt + 1))));
    void load(0);
    return () => {
      cancelled = true;
      clearTimeout(retry);
    };
  }, [eventsTick, project.id, timeline.id]);
  useEffect(() => onNotice((n) => n === timelineNotice(timeline.id) && setEventsTick((t) => t + 1)), [onNotice, timeline.id]);

  // ---- Settings (stored on the timeline node, shared with collaborators) -------
  const calendars = useMemo<Calendar[]>(() => [gregorian, ...(story?.calendars ?? []).map((c) => ({ ...c }))], [story?.calendars]);
  const calendar = calendars.find((c) => c.id === settings.calendarId) ?? gregorian;
  const laneMode = (settings.lanes as LaneMode) ?? "none";
  const mode = (settings.mode as Mode) ?? "chronological";
  const readingOrder = settings.readingOrder !== false;

  const saveSettings = (patch: NodeSettings) => {
    binder.patch(timeline.id, { settings: { ...settings, ...patch } });
    if (!editable) return;
    setNodeSettings(project.id, timeline.id, patch)
      .then((n) => binder.upsert(n))
      .catch((error) => toast.error(errorText(error)));
  };

  // ---- Items -------------------------------------------------------------------
  const hasDef = useCallback((kind: string, key: string) => defs.some((d) => d.nodeKind === kind && d.key === key), [defs]);
  // Under a spoiler horizon the timeline only has what the audience knows by then.
  const horizon = useHorizon();
  const nodes = useMemo(() => flatten(index).filter((n) => !horizon || horizon.knows(n.id)), [horizon, index]);
  const threadsOf = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const c of story?.cells ?? []) map.set(c.nodeId, [...(map.get(c.nodeId) ?? []), c.threadId]);
    return map;
  }, [story?.cells]);
  const threadColor = useMemo(() => new Map((story?.threads ?? []).map((t) => [t.id, t.color])), [story?.threads]);

  const sceneLanes = useCallback(
    (n: BinderNode): string[] => {
      if (laneMode === "none") return [ALL];
      if (laneMode === "thread") {
        const t = (threadsOf.get(n.id) ?? []).filter((id) => threadColor.has(id));
        return t.length ? t : [NONE];
      }
      const target = str(n.properties[laneMode]);
      return [target && index.byId.has(target) ? target : NONE];
    },
    [index, laneMode, threadColor, threadsOf],
  );

  const { items, undated } = useMemo(() => {
    const out: Item[] = [];
    const undatedScenes: BinderNode[] = [];
    let order = 0;
    for (const n of nodes) {
      if (n.kind === "folder" || n.kind === "canvas" || n.kind === "timeline") continue;
      const date = parseStoryDate(calendar, str(n.properties["story-date"]));
      if (date === null) {
        if (n.kind === "scene") {
          undatedScenes.push(n);
          order++;
        }
        continue;
      }
      const duration = parseDuration(calendar, str(n.properties.duration));
      const lanes = sceneLanes(n);
      out.push({
        key: `scene:${n.id}`,
        type: "scene",
        id: n.id,
        title: n.title,
        start: date,
        end: duration ? date + duration : null,
        color: laneMode === "thread" && lanes[0] !== NONE ? (threadColor.get(lanes[0]) ?? "var(--ember)") : "var(--ember)",
        lanes,
        order: order++,
        node: n,
      });
    }
    for (const e of events) {
      out.push({
        key: `event:${e.id}`,
        type: "event",
        id: e.id,
        title: e.title,
        start: e.start,
        end: e.end,
        color: e.color ?? "#868e96",
        lanes: [laneMode === "none" ? ALL : e.lane ?? NONE],
        event: e,
      });
    }
    return { items: out, undated: undatedScenes };
  }, [calendar, events, laneMode, nodes, sceneLanes, threadColor]);

  const { lanes, laned } = useMemo(() => {
    if (laneMode === "none") return { lanes: [{ key: ALL, label: "" }] as Lane[], laned: items };
    const used = new Set(items.flatMap((i) => i.lanes));
    let list: Lane[];
    if (laneMode === "thread") list = (story?.threads ?? []).map((t) => ({ key: t.id, label: t.name, color: t.color }));
    else {
      const kind = laneMode === "pov" ? "character" : "location";
      list = nodes.filter((n) => n.kind === kind && used.has(n.id)).map((n) => ({ key: n.id, label: n.title }));
    }
    // Items whose lane no longer exists (a deleted thread) fall into "Unassigned".
    const known = new Set(list.map((l) => l.key));
    return {
      lanes: [...list, { key: NONE, label: laneMode === "thread" ? "No thread" : "Unassigned" }],
      laned: items.map((i) => ({ ...i, lanes: [...new Set(i.lanes.map((l) => (known.has(l) ? l : NONE)))] })),
    };
  }, [items, laneMode, nodes, story?.threads]);

  // ---- View: zoom and pan --------------------------------------------------------
  const bodyRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [view, setView] = useState<{ start: number; pxPerMin: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ key: string; start: number; end: number | null; lane: string } | null>(null);
  const [calendarsOpen, setCalendarsOpen] = useState(false);
  const [showHint, dismissHint] = useHint();
  // Set when an item is chosen with the keyboard, so its panel takes focus.
  const [panelFocus, setPanelFocus] = useState(false);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth - LABEL_W));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const fit = useCallback(() => {
    const times = items.flatMap((i) => [i.start, i.end ?? i.start]);
    if (!times.length) {
      const now = parseStoryDate(calendar, calendar.definition ? "1-01-01" : new Date().toISOString().slice(0, 10))!;
      setView({ start: now - 15 * dayMinutes(calendar), pxPerMin: (width || 800) / (30 * dayMinutes(calendar)) });
      return;
    }
    const min = Math.min(...times);
    const max = Math.max(...times);
    const span = Math.max(max - min, dayMinutes(calendar));
    const pxPerMin = Math.max(((width || 800) - 240) / span, 1e-9);
    setView({ start: min - 60 / pxPerMin, pxPerMin });
  }, [calendar, items, width]);

  // Where this timeline was zoomed and scrolled to last time, in this browser, for its calendar.
  const savedKey = `plotra:timeline-view:${timeline.id}`;
  const savedView = useCallback((): { start: number; pxPerMin: number } | null => {
    try {
      const saved = JSON.parse(localStorage.getItem(savedKey) ?? "null") as { calendarId?: string; start?: number; pxPerMin?: number } | null;
      return saved && saved.calendarId === calendar.id && Number.isFinite(saved.start) && Number.isFinite(saved.pxPerMin) && saved.pxPerMin! > 0
        ? { start: saved.start!, pxPerMin: saved.pxPerMin! }
        : null;
    } catch {
      return null;
    }
  }, [calendar.id, savedKey]);
  useEffect(() => {
    if (!view) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(savedKey, JSON.stringify({ calendarId: calendar.id, ...view }));
      } catch {}
    }, 400);
    return () => clearTimeout(timer);
  }, [calendar.id, savedKey, view]);

  // Where it was left, or fitted once there's something to show; again when the calendar changes.
  const fittedFor = useRef<string | null>(null);
  useEffect(() => {
    if (fittedFor.current === calendar.id || !story) return;
    fittedFor.current = calendar.id;
    const saved = savedView();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring what this browser kept
    if (saved) setView(saved);
    else fit();
  }, [calendar.id, fit, savedView, story]);

  const zoom = (factor: number, anchorX = width / 2) =>
    setView((v) => {
      if (!v) return v;
      const at = v.start + anchorX / v.pxPerMin;
      const pxPerMin = Math.min(Math.max(v.pxPerMin * factor, 20 / (yearMinutes(calendar) * 20000)), 40);
      return { pxPerMin, start: at - anchorX / pxPerMin };
    });

  // Wheel: horizontal scroll pans, ⌘/ctrl + wheel zooms around the pointer.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el || mode !== "chronological") return;
    const onWheel = (e: WheelEvent) => {
      const x = e.clientX - el.getBoundingClientRect().left - LABEL_W;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoom(Math.exp(-e.deltaY * 0.0025), x);
      } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey) {
        e.preventDefault();
        const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
        setView((v) => (v ? { ...v, start: v.start + dx / v.pxPerMin } : v));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // zoom only depends on view state through setView.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, width, calendar]);

  const v = view ?? { start: 0, pxPerMin: 1 };
  const timeToX = (t: number) => (t - v.start) * v.pxPerMin;
  const xToTime = (x: number) => v.start + x / v.pxPerMin;
  // Snap to a unit that's about 10px wide at this zoom.
  const snap = useCallback(
    (t: number) => {
      const day = dayMinutes(calendar);
      const units = [1, 5, 15, 60, 360, day, 7 * day, 30 * day, yearMinutes(calendar)];
      const unit = [...units].reverse().find((u) => u * v.pxPerMin <= 14) ?? 1;
      return Math.round(t / unit) * unit;
    },
    [calendar, v.pxPerMin],
  );

  // ---- Layout: pack each lane's items into rows ----------------------------------
  const scenesInOrder = laned.filter((i) => i.type === "scene").sort((a, b) => a.order! - b.order!);
  const narrativeIndex = new Map(scenesInOrder.map((s, i) => [s.id, i]));
  const shown = (mode === "narrative" ? laned.filter((i) => i.type === "scene") : laned).map((i) =>
    drag?.key === i.key ? { ...i, start: drag.start, end: drag.end, lanes: i.lanes.map((l, n) => (n === 0 ? drag.lane : l)) } : i,
  );
  const xOf = (i: Item) => (mode === "narrative" ? narrativeIndex.get(i.id)! * SLOT_W + 12 : timeToX(i.start));
  const wOf = (i: Item) =>
    mode === "narrative" ? SLOT_W - 24 : Math.max(i.end !== null ? (i.end - i.start) * v.pxPerMin : 0, MIN_ITEM_W);

  const laneLayout = lanes.map((lane) => {
    const mine = shown.filter((i) => i.lanes.includes(lane.key)).sort((a, b) => xOf(a) - xOf(b));
    const rowsEnd: number[] = [];
    const placed = mine.map((item) => {
      const x = xOf(item);
      let row = rowsEnd.findIndex((end) => end <= x - 6);
      if (row < 0) row = rowsEnd.push(0) - 1;
      rowsEnd[row] = x + wOf(item);
      return { item, row };
    });
    return { lane, placed, height: Math.max(rowsEnd.length, 1) * ROW + LANE_PAD * 2 };
  });
  const lanesWithTop = laneLayout.map((l, i) => ({ ...l, top: laneLayout.slice(0, i).reduce((sum, x) => sum + x.height, 0) }));
  const totalHeight = laneLayout.reduce((sum, x) => sum + x.height, 0);
  // Narrative mode scrolls sideways through the scenes; chronological mode pans instead.
  const narrativeWidth = mode === "narrative" ? LABEL_W + scenesInOrder.length * SLOT_W + 24 : undefined;
  const laneAt = (y: number) => lanesWithTop.find((l) => y >= l.top && y < l.top + l.height)?.lane.key ?? lanes.at(-1)!.key;

  // ---- Writes --------------------------------------------------------------------
  const refreshEvents = () => {
    notify(timelineNotice(timeline.id));
    setEventsTick((t) => t + 1);
  };

  const commitScene = async (n: BinderNode, start: number, end: number | null, lane?: string) => {
    const patch: Record<string, unknown> = {};
    if (!hasDef(n.kind, "story-date")) {
      toast.error(`${words.plural(n.kind)} don't have a Story date field yet.`, {
        description: "Open one, and under Properties in the inspector add a field called Story date.",
      });
      return;
    }
    patch["story-date"] = canonicalDate(calendar, start);
    if (end !== null && hasDef(n.kind, "duration")) patch.duration = formatDuration(calendar, end - start);
    if (lane !== undefined && (laneMode === "pov" || laneMode === "location") && hasDef(n.kind, laneMode)) {
      patch[laneMode] = lane === NONE ? null : lane;
    }
    await actions.setProperties(n.id, patch);
  };

  const commitEvent = async (e: TimelineEvent, patch: Partial<TimelineEvent>) => {
    setEvents((list) => list.map((x) => (x.id === e.id ? { ...x, ...patch } : x)));
    try {
      await updateTimelineEvent(project.id, timeline.id, e.id, patch);
      refreshEvents();
    } catch (error) {
      toast.error(errorText(error));
      setEventsTick((t) => t + 1);
    }
  };

  /** Dates an undated scene without dragging: asks for the date in words the calendar reads. */
  const setDateFor = async (n: BinderNode) => {
    const example = canonicalDate(calendar, view ? snap(xToTime(width / 2)) : 0);
    const text = await promptText({
      title: `When does ‘${n.title}’ happen?`,
      label: "Story date",
      placeholder: `e.g. ${example}`,
      confirmLabel: "Set date",
      validate: (value) => (parseStoryDate(calendar, value) === null ? `Write the date as year-month-day, e.g. ${example}` : null),
    });
    if (text === null) return;
    const t = parseStoryDate(calendar, text);
    if (t !== null) await commitScene(n, t, null);
  };

  const deleteEvent = async (event: TimelineEvent) => {
    try {
      await deleteTimelineEvent(project.id, timeline.id, event.id);
      setEvents((list) => list.filter((e) => e.id !== event.id));
      setSelected(null);
      refreshEvents();
      undoToast(`Deleted ‘${event.title}’`, async () => {
        try {
          const restored = await createTimelineEvent(project.id, timeline.id, {
            title: event.title,
            description: event.description,
            start: event.start,
            end: event.end,
            lane: event.lane,
            color: event.color,
            nodeId: event.nodeId,
          });
          setEvents((list) => [...list, restored]);
          refreshEvents();
        } catch (error) {
          toast.error(errorText(error, "The event couldn't be brought back."));
        }
      });
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  const createEvent = async (start: number, lane: string | null, extra: Partial<TimelineEvent> = {}) => {
    try {
      const created = await createTimelineEvent(project.id, timeline.id, {
        title: "New event",
        start,
        lane: lane && lane !== NONE && lane !== ALL ? lane : null,
        color: swatches[4],
        ...extra,
      });
      setEvents((list) => [...list, created]);
      setSelected(`event:${created.id}`);
      refreshEvents();
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  // ---- Pointer interaction ---------------------------------------------------------
  const startDrag = (e: React.PointerEvent, item: Item, kind: "move" | "resize") => {
    e.stopPropagation();
    setSelected(item.key);
    const canMove = item.type === "event" ? editable : item.node!.actions.includes("edit");
    if (!canMove || mode === "narrative" || e.button !== 0) return;
    e.preventDefault();
    const body = bodyRef.current!;
    const x0 = e.clientX;
    const origin = { start: item.start, end: item.end, lane: item.lanes[0] };
    // Scenes change lanes only where the lane is one of their properties.
    const laneMovable = item.type === "event" ? laneMode !== "none" : laneMode === "pov" || laneMode === "location";
    let moved = false;
    let last = { ...origin };
    const onMove = (ev: PointerEvent) => {
      const dt = (ev.clientX - x0) / v.pxPerMin;
      if (Math.abs(ev.clientX - x0) > 3) moved = true;
      if (!moved) return;
      const y = ev.clientY - body.getBoundingClientRect().top + body.scrollTop - 28;
      if (kind === "move") {
        const start = snap(origin.start + dt);
        last = { start, end: origin.end !== null ? origin.end + (start - origin.start) : null, lane: laneMovable ? laneAt(y) : origin.lane };
      } else {
        const end = Math.max(snap((origin.end ?? origin.start) + dt), origin.start + 1);
        last = { ...origin, end };
      }
      setDrag({ key: item.key, ...last });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setDrag(null);
      if (!moved) return;
      if (item.type === "scene") void commitScene(item.node!, last.start, last.end, last.lane !== origin.lane ? last.lane : undefined);
      else
        void commitEvent(item.event!, {
          start: last.start,
          end: last.end,
          ...(last.lane !== origin.lane && { lane: last.lane === NONE ? null : last.lane }),
        });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const startPan = (e: React.PointerEvent) => {
    if (e.button !== 0 || mode !== "chronological") return;
    setSelected(null);
    const x0 = e.clientX;
    const start0 = v.start;
    const onMove = (ev: PointerEvent) => setView((cur) => (cur ? { ...cur, start: start0 - (ev.clientX - x0) / cur.pxPerMin } : cur));
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const pointToTimeLane = (clientX: number, clientY: number) => {
    const body = bodyRef.current!;
    const rect = body.getBoundingClientRect();
    return { time: snap(xToTime(clientX - rect.left - LABEL_W)), lane: laneAt(clientY - rect.top + body.scrollTop - 28) };
  };

  // ---- Reading-order overlay: connects scenes in binder order; backward jumps are flashbacks.
  const firstPlacement = new Map<string, { x: number; y: number; w: number }>();
  for (const l of lanesWithTop) {
    for (const p of l.placed) {
      if (p.item.type !== "scene" || firstPlacement.has(p.item.id)) continue;
      firstPlacement.set(p.item.id, { x: xOf(p.item), y: l.top + LANE_PAD + p.row * ROW + ROW / 2 - 2, w: wOf(p.item) });
    }
  }
  const orderPath = scenesInOrder.map((s) => ({ s, at: firstPlacement.get(s.id) })).filter((p) => p.at);

  const selectedItem = laned.find((i) => i.key === selected);
  const tickList = view && mode === "chronological" ? ticks(calendar, xToTime(-40), xToTime(width + 40), v.pxPerMin) : [];
  const precision = v.pxPerMin * dayMinutes(calendar) >= 30 ? "minute" : v.pxPerMin * yearMinutes(calendar) >= 400 ? "day" : "year";

  return (
    <div className="relative flex h-full flex-col bg-background">
      <Toolbar>
        <ToolbarSelect
          label="Calendar"
          value={calendar.id}
          disabled={!editable}
          options={[...calendars.map((c) => ({ value: c.id, label: c.name })), { value: "__manage", label: "Manage calendars…" }]}
          onChange={(id) => (id === "__manage" ? setCalendarsOpen(true) : saveSettings({ calendarId: id === GREGORIAN_ID ? null : id }))}
        />
        <ToolbarSelect label="Lanes" value={laneMode} options={laneOptions} onChange={(lanes) => saveSettings({ lanes })} />
        <Segmented
          value={mode}
          onChange={(m) => saveSettings({ mode: m })}
          options={[
            { value: "chronological", label: "Chronological" },
            { value: "narrative", label: "Narrative" },
          ]}
        />
        {mode === "chronological" && (
          <ToolButton icon="route-linear" label="Show reading order (flashbacks in orange)" pressed={readingOrder} onClick={() => saveSettings({ readingOrder: !readingOrder })} />
        )}
        <Divider />
        {mode === "chronological" && (
          <>
            <ToolButton icon="magnifer-zoom-out-linear" label="Zoom out (⌘ scroll)" onClick={() => zoom(1 / 1.6)} />
            <ToolButton icon="magnifer-zoom-in-linear" label="Zoom in (⌘ scroll)" onClick={() => zoom(1.6)} />
            <ToolButton icon="full-screen-linear" label="Fit everything" onClick={fit} />
            <Divider />
          </>
        )}
        <ToolButton
          icon="add-square-linear"
          label="Add an event"
          disabled={!editable || mode === "narrative"}
          onClick={() => void createEvent(snap(xToTime(width / 2)), null)}
        >
          Event
        </ToolButton>
        {mode === "narrative" && <span className="ml-auto shrink-0 text-meta text-muted-foreground">Scenes in reading order</span>}
        {!showHint && (
          <span className="ml-auto">
            <ToolButton icon="question-circle-linear" label="How to use the timeline" onClick={() => {
              try {
                localStorage.removeItem(HINT_KEY);
              } catch {}
              hintListeners.forEach((on) => on());
            }} />
          </span>
        )}
      </Toolbar>
      {showHint && (
        <div role="note" className="flex shrink-0 items-start gap-2 border-b bg-sidebar px-3 py-2 text-ui-sm text-muted-foreground">
          <Icon name="info-circle-linear" className="mt-0.5 size-4 shrink-0" />
          <p className="flex-1">
            {mode === "chronological"
              ? "Drag an item to move it, or drag its right edge to change how long it lasts. Double-click empty space to add an event. With the keyboard, Tab to an item and press Enter to see and change its dates."
              : "Scenes are shown in reading order, so a flashback shows up as a date that jumps backwards. Tab to a scene and press Enter to see its dates."}
          </p>
          <IconButton icon="close-linear" size="xs" label="Dismiss this tip" onClick={dismissHint} />
        </div>
      )}

      <div
        ref={bodyRef}
        className={cn("relative min-h-0 flex-1 overflow-y-auto select-none", mode === "narrative" ? "overflow-x-auto" : "overflow-x-hidden")}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(NODE_MIME) && mode === "chronological") {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }
        }}
        onDrop={(e) => {
          const id = e.dataTransfer.getData(NODE_MIME);
          const n = index.byId.get(id);
          if (!n || mode !== "chronological") return;
          e.preventDefault();
          const { time, lane } = pointToTimeLane(e.clientX, e.clientY);
          // A note with a story date is placed by it; anything else becomes an event about it.
          if (hasDef(n.kind, "story-date") && n.actions.includes("edit")) void commitScene(n, time, null, lane);
          else if (editable) void createEvent(time, lane, { title: n.title, nodeId: n.id });
        }}
      >
        {/* Axis */}
        <div className="sticky top-0 z-20 flex h-7 border-b bg-background/95 backdrop-blur" style={{ minWidth: narrativeWidth }}>
          <div style={{ width: LABEL_W }} className="shrink-0 border-r" />
          <div className="relative flex-1 overflow-hidden text-meta text-muted-foreground">
            {mode === "chronological"
              ? tickList.map((t) => (
                  <span key={t.at} className={cn("absolute top-1.5 pl-1 whitespace-nowrap", t.major && "font-semibold text-foreground")} style={{ left: timeToX(t.at) }}>
                    {t.label}
                  </span>
                ))
              : scenesInOrder.map((s, i) => (
                  <span key={s.id} className="absolute top-1.5 truncate pl-3" style={{ left: i * SLOT_W, width: SLOT_W }}>
                    {i + 1}. {formatDate(calendar, s.start, precision === "year" ? "year" : "day")}
                  </span>
                ))}
          </div>
        </div>

        <div className="relative flex" style={{ height: Math.max(totalHeight, 200), minWidth: narrativeWidth }}>
          {/* Lane labels */}
          <div style={{ width: LABEL_W }} className="sticky left-0 z-10 shrink-0 border-r bg-sidebar">
            {lanesWithTop.map(({ lane, top, height }) => (
              <div key={lane.key} style={{ top, height }} className="absolute inset-x-0 flex items-start gap-2 border-b px-3 pt-3 text-ui-sm">
                {lane.color && <span className="mt-1 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: lane.color }} />}
                <span className={cn("truncate", lane.key === NONE && "text-muted-foreground italic")}>{lane.label}</span>
              </div>
            ))}
          </div>

          {/* Canvas */}
          <div
            className="relative min-w-0 flex-1 overflow-hidden"
            onPointerDown={startPan}
            onDoubleClick={(e) => {
              if (!editable || mode !== "chronological" || e.target !== e.currentTarget) return;
              const { time, lane } = pointToTimeLane(e.clientX, e.clientY);
              void createEvent(time, lane);
            }}
          >
            {tickList.map((t) => (
              <div key={t.at} className={cn("pointer-events-none absolute inset-y-0 w-px", t.major ? "bg-border" : "bg-border/50")} style={{ left: timeToX(t.at) }} />
            ))}
            {lanesWithTop.map(({ lane, top, height }) => (
              <div key={lane.key} className="pointer-events-none absolute inset-x-0 border-b" style={{ top, height }} />
            ))}

            {mode === "chronological" && readingOrder && orderPath.length > 1 && (
              <svg className="pointer-events-none absolute inset-0 size-full overflow-visible">
                {orderPath.slice(1).map((p, i) => {
                  const prev = orderPath[i];
                  const back = p.s.start < prev.s.start;
                  const x1 = prev.at!.x + Math.min(prev.at!.w, 40);
                  const x2 = p.at!.x + 6;
                  return (
                    <path
                      key={p.s.id}
                      d={`M ${x1} ${prev.at!.y} C ${x1 + 30} ${prev.at!.y}, ${x2 - 30} ${p.at!.y}, ${x2} ${p.at!.y}`}
                      fill="none"
                      stroke={back ? "var(--ember)" : "var(--muted-foreground)"}
                      strokeOpacity={back ? 0.9 : 0.35}
                      strokeWidth={back ? 1.6 : 1}
                      strokeDasharray={back ? "5 4" : undefined}
                    >
                      <title>{back ? `Flashback: ${prev.s.title} → ${p.s.title}` : `${prev.s.title} → ${p.s.title}`}</title>
                    </path>
                  );
                })}
              </svg>
            )}

            {lanesWithTop.map(({ lane, top, placed }) =>
              placed.map(({ item, row }) => {
                const x = xOf(item);
                const w = wOf(item);
                if (mode === "chronological" && (x + w < -50 || x > width + 50)) return null;
                const canMove = item.type === "event" ? editable : item.node!.actions.includes("edit");
                const isSel = selected === item.key;
                const backwards =
                  mode === "narrative" && item.order !== undefined && (narrativeIndex.get(item.id) ?? 0) > 0
                    ? item.start < scenesInOrder[(narrativeIndex.get(item.id) ?? 1) - 1].start
                    : false;
                const when = `${formatDate(calendar, item.start)}${item.end ? ` to ${formatDate(calendar, item.end)}` : ""}`;
                return (
                  <button
                    type="button"
                    key={`${lane.key}:${item.key}`}
                    data-item={item.key}
                    aria-label={`${item.type === "scene" ? "Scene" : "Event"}: ${item.title}, ${when}${backwards ? ", flashback" : ""}`}
                    aria-pressed={isSel}
                    onClick={(e) => {
                      setSelected(item.key);
                      // A click from the keyboard (Enter or Space) has no pointer position.
                      if (e.detail === 0) setPanelFocus(true);
                    }}
                    onPointerDown={(e) => startDrag(e, item, "move")}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      const target = item.node?.id ?? item.event?.nodeId;
                      if (target) openNode(target, "tab");
                    }}
                    title={`${item.title}\n${formatDate(calendar, item.start)}${item.end ? ` → ${formatDate(calendar, item.end)}` : ""}`}
                    className={cn(
                      "group/item absolute flex h-7 items-center gap-1.5 overflow-hidden rounded-md border pr-2 pl-1.5 text-left text-meta shadow-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60",
                      canMove && mode === "chronological" ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                      isSel ? "ring-2 ring-ember/60" : "",
                      drag?.key === item.key && "opacity-80 shadow-md",
                    )}
                    style={{
                      left: x,
                      top: top + LANE_PAD + row * ROW,
                      width: w,
                      backgroundColor: `color-mix(in oklab, ${item.color} ${item.type === "scene" ? 18 : 12}%, var(--card))`,
                      borderColor: `color-mix(in oklab, ${item.color} 45%, var(--border))`,
                    }}
                  >
                    <span className="h-4 w-1 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                    {item.type === "scene" ? (
                      <Icon name={nodeKindMeta[item.node!.kind].icon} className="size-3.5 shrink-0 opacity-70" />
                    ) : (
                      <Icon name="flag-linear" className="size-3.5 shrink-0 opacity-70" />
                    )}
                    <span className="truncate">{item.title}</span>
                    {backwards && (
                      <span className="ml-auto shrink-0 rounded bg-ember/15 px-1 text-meta font-medium text-ember-ink" title="Earlier in story time than the scene before it">
                        flashback
                      </span>
                    )}
                    {mode === "chronological" && canMove && (
                      <span
                        onPointerDown={(e) => startDrag(e, item, "resize")}
                        aria-hidden
                        className="absolute inset-y-0 right-0 w-2 cursor-ew-resize opacity-0 group-hover/item:opacity-100 group-focus-visible/item:opacity-100 pointer-coarse:w-3 pointer-coarse:opacity-100"
                        style={{ background: `linear-gradient(to right, transparent, color-mix(in oklab, ${item.color} 40%, transparent))` }}
                      />
                    )}
                  </button>
                );
              }),
            )}
          </div>
        </div>

        {items.length === 0 && story && (
          <div className="pointer-events-none absolute inset-x-0 top-10 [&_button]:pointer-events-auto">
            <EmptyState
              icon="calendar-linear"
              title="Nothing on this timeline yet"
              action={editable && mode === "chronological" && { label: "Add an event", onClick: () => void createEvent(snap(xToTime(width / 2)), null) }}
            >
              Give scenes a story date, or set one for the undated scenes below. You can also drag scenes from the binder onto the timeline, or double-click to add an event.
            </EmptyState>
          </div>
        )}
      </div>

      {undated.length > 0 && mode === "chronological" && (
        <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-t bg-sidebar px-3 py-2">
          <span className="shrink-0 pr-1 text-meta text-muted-foreground">Undated scenes · drag onto the timeline, or set a date:</span>
          {undated.map((n) => {
            const canEdit = n.actions.includes("edit");
            return (
              <span
                key={n.id}
                draggable={canEdit}
                onDragStart={(e) => {
                  e.dataTransfer.setData(NODE_MIME, n.id);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                className={cn("flex h-8 shrink-0 items-center rounded border bg-card text-meta", canEdit && "cursor-grab")}
              >
                <button
                  type="button"
                  onClick={() => openNode(n.id, "tab")}
                  aria-label={`Open ${n.title}`}
                  className="flex h-full items-center gap-1 rounded-l px-2 outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <Icon name="clapperboard-text-linear" className="size-3.5 text-muted-foreground" />
                  {n.title}
                </button>
                {canEdit && (
                  <IconButton icon="calendar-add-linear" size="xs" label={`Set a date for ${n.title}…`} onClick={() => void setDateFor(n)} className="mr-0.5" />
                )}
              </span>
            );
          })}
        </div>
      )}

      {selectedItem && (
        <ItemPanel
          key={selectedItem.key}
          item={selectedItem}
          calendar={calendar}
          editable={selectedItem.type === "event" ? editable : selectedItem.node!.actions.includes("edit")}
          laneMode={laneMode}
          lanes={lanes}
          autoFocus={panelFocus}
          onClose={() => {
            const key = selectedItem.key;
            setSelected(null);
            setPanelFocus(false);
            // Back to the item it was opened from, for keyboard users.
            requestAnimationFrame(() => bodyRef.current?.querySelector<HTMLElement>(`[data-item="${CSS.escape(key)}"]`)?.focus());
          }}
          onScene={(patch) => void actions.setProperties(selectedItem.id, patch)}
          onEvent={(patch) => void commitEvent(selectedItem.event!, patch)}
          onDelete={() => void deleteEvent(selectedItem.event!)}
        />
      )}

      {calendarsOpen && (
        <CalendarDialog
          calendars={story?.calendars ?? []}
          canEdit={project.actions.includes("edit")}
          onClose={() => setCalendarsOpen(false)}
          onSaved={(id) => {
            notify(STORY_NOTICE);
            if (id) saveSettings({ calendarId: id });
          }}
        />
      )}
    </div>
  );
}

function ItemPanel({
  item,
  calendar,
  editable,
  laneMode,
  lanes,
  autoFocus,
  onClose,
  onScene,
  onEvent,
  onDelete,
}: {
  autoFocus?: boolean;
  item: Item;
  calendar: Calendar;
  editable: boolean;
  laneMode: LaneMode;
  lanes: Lane[];
  onClose: () => void;
  onScene: (patch: Record<string, unknown>) => void;
  onEvent: (patch: Partial<TimelineEvent>) => void;
  onDelete: () => void;
}) {
  const { binder, openNode } = useWorkspace();
  const words = useVocabulary();
  const { index } = useStore(binder);
  const [dateError, setDateError] = useState(false);
  const linkable = flatten(index).filter((n) => n.kind !== "folder" && n.kind !== "timeline");

  const parseOr = (text: string, apply: (t: number | null) => void) => {
    if (!text.trim()) return apply(null);
    const t = parseStoryDate(calendar, text);
    setDateError(t === null);
    if (t !== null) apply(t);
  };

  return (
    <aside
      aria-label={`${item.type === "scene" ? "Scene" : "Event"}: ${item.title}`}
      onKeyDown={(e) => {
        // Escape in a list opened from here (portalled, but still bubbling through React) closes only that list.
        if (e.key === "Escape" && !e.defaultPrevented && e.currentTarget.contains(e.target as Node)) {
          e.stopPropagation();
          onClose();
        }
      }}
      className="absolute top-14 right-3 z-30 grid w-72 gap-3 rounded-lg border bg-popover p-3 text-ui-sm shadow-lg"
    >
      <div className="flex items-center gap-2">
        <p className="text-meta font-medium text-muted-foreground">{item.type === "scene" ? "Scene" : "Event"}</p>
        <IconButton icon="close-linear" size="xs" label="Close" autoFocus={autoFocus} onClick={onClose} className="ml-auto" />
      </div>
      {item.type === "scene" ? (
        <>
          <button type="button" onClick={() => openNode(item.id, "tab")} className="text-left font-display text-xl leading-tight hover:underline">
            {item.title}
          </button>
          <Field label="Story date">
            <CommitInput
              value={canonicalDate(calendar, item.start)}
              disabled={!editable}
              invalid={dateError}
              onCommit={(text) => parseOr(text, (t) => onScene({ "story-date": t === null ? null : canonicalDate(calendar, t) }))}
            />
          </Field>
          <Field label="Duration">
            <CommitInput
              value={item.end ? formatDuration(calendar, item.end - item.start) : ""}
              placeholder="e.g. 2h, 3 days"
              disabled={!editable}
              onCommit={(text) => onScene({ duration: text.trim() || null })}
            />
          </Field>
          <p className="text-meta text-muted-foreground">{formatDate(calendar, item.start)}{item.end ? ` → ${formatDate(calendar, item.end)}` : ""}</p>
        </>
      ) : (
        <>
          <Field label="Title">
            <CommitInput value={item.title} disabled={!editable} onCommit={(title) => onEvent({ title })} />
          </Field>
          {item.event!.nodeId && index.byId.has(item.event!.nodeId) && (
            <button type="button" onClick={() => openNode(item.event!.nodeId!, "tab")} className="-mt-1 justify-self-start text-meta text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
              Open {index.byId.get(item.event!.nodeId)!.title}
            </button>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Starts">
              <CommitInput
                value={canonicalDate(calendar, item.start)}
                disabled={!editable}
                invalid={dateError}
                onCommit={(text) => parseOr(text, (t) => t !== null && onEvent({ start: t }))}
              />
            </Field>
            <Field label="Ends">
              <CommitInput
                value={item.end ? canonicalDate(calendar, item.end) : ""}
                placeholder="—"
                disabled={!editable}
                onCommit={(text) => parseOr(text, (t) => onEvent({ end: t !== null && t > item.start ? t : null }))}
              />
            </Field>
          </div>
          {laneMode !== "none" && (
            <Field label="Lane">
              <SelectField
                disabled={!editable}
                value={item.lanes[0]}
                onValueChange={(v) => onEvent({ lane: v === NONE ? null : v })}
                className="h-8 rounded-md border border-input bg-transparent px-1.5 text-ui-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {lanes.map((l) => (
                  <option key={l.key} value={l.key}>
                    {l.label}
                  </option>
                ))}
              </SelectField>
            </Field>
          )}
          <Field label="About">
            <SelectField
              disabled={!editable}
              value={item.event!.nodeId ?? ""}
              onValueChange={(v) => onEvent({ nodeId: v || null })}
              className="h-8 rounded-md border border-input bg-transparent px-1.5 text-ui-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <option value="">No linked note</option>
              {linkable.map((n) => (
                <option key={n.id} value={n.id}>
                  {words.label(n.kind)}: {n.title}
                </option>
              ))}
            </SelectField>
          </Field>
          <Field label="Notes">
            <CommitTextarea value={item.event!.description ?? ""} disabled={!editable} onCommit={(description) => onEvent({ description })} />
          </Field>
          {editable && <Swatches value={item.event!.color} onChange={(color) => onEvent({ color })} />}
          {editable && (
            <button type="button" onClick={onDelete} className="flex h-8 items-center justify-center gap-1.5 rounded-md text-destructive outline-none hover:bg-destructive/10 focus-visible:ring-[3px] focus-visible:ring-ring/50">
              <Icon name="trash-bin-minimalistic-linear" className="size-3.5" />
              Delete event
            </button>
          )}
        </>
      )}
    </aside>
  );
}
