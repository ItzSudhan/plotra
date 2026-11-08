import type { Client } from "./api";
import { invalidate, useResource } from "./cache";
import { useClient } from "./session";
import type { CalendarDefinition } from "./story-calendar";
import type { Note } from "./types";

// The story views' calls (apps/app/app/api/mobile/views, built on the web's
// own server functions in apps/app/lib/api/mobile-views.ts): the timeline,
// the corkboard, the plot grid and the codex. Kept on the phone through the
// cache, so they open offline.

export type PropertyType = "text" | "number" | "date" | "select" | "multi_select" | "node" | "checkbox" | "url";
export type PropertyValue = string | number | boolean | string[] | null;
export type CanonStatus = "canon" | "draft" | "speculative" | "retconned" | "non_canon";

/** A note with its fields and board settings. */
export type ViewNode = Note & {
  position: string;
  properties: Record<string, PropertyValue>;
  settings: Record<string, string | number | boolean | null>;
  entityTypeId: string | null;
  canon: CanonStatus;
  label: { name: string; color: string } | null;
};

export type PlotThread = { id: string; name: string; color: string; position: string; closedNodeId: string | null };
export type SceneThreadCell = { nodeId: string; threadId: string; note: string };
export type CalendarRow = { id: string; name: string; definition: CalendarDefinition };
export type PropertyDef = { id: string; nodeKind: string; key: string; label: string; type: PropertyType; options: { choices?: string[] }; position: string };
export type EntityField = { key: string; label: string; type: PropertyType; options?: { choices?: string[] } };
export type EntityType = { id: string; name: string; plural: string; icon: string; color: string; schema: EntityField[]; position: string };

export type ViewsData = {
  nodes: ViewNode[];
  threads: PlotThread[];
  cells: SceneThreadCell[];
  calendars: CalendarRow[];
  propertyDefs: PropertyDef[];
  entityTypes: EntityType[];
  canEditProject: boolean;
};

export type TimelineEvent = { id: string; nodeId: string | null; title: string; description: string | null; start: number; end: number | null; lane: string | null; color: string | null };
export type EventInput = Partial<Omit<TimelineEvent, "id">>;
export type Backlink = { id: string; context: string | null };

export const viewKeys = {
  views: (projectId: string) => `views:${projectId}`,
  events: (projectId: string, timelineId: string) => `views-events:${projectId}:${timelineId}`,
  links: (projectId: string, noteId: string) => `views-links:${projectId}:${noteId}`,
};

const v = (projectId: string) => `/api/mobile/views/${encodeURIComponent(projectId)}`;
const t = (projectId: string, timelineId: string) => `${v(projectId)}/timeline/${encodeURIComponent(timelineId)}`;
const nt = (projectId: string, noteId: string) => `${v(projectId)}/notes/${encodeURIComponent(noteId)}`;

export const viewsApi = {
  views: (c: Client, projectId: string) => c.request<ViewsData>(v(projectId)),
  events: (c: Client, projectId: string, timelineId: string) => c.request<{ events: TimelineEvent[] }>(t(projectId, timelineId)).then((r) => r.events),
  createEvent: (c: Client, projectId: string, timelineId: string, input: EventInput & { start: number }) =>
    c.request<{ event: TimelineEvent }>(t(projectId, timelineId), { method: "POST", body: input }).then((r) => r.event),
  updateEvent: (c: Client, projectId: string, timelineId: string, id: string, patch: EventInput) =>
    c.request<{ event: TimelineEvent }>(`${t(projectId, timelineId)}/${encodeURIComponent(id)}`, { method: "PATCH", body: patch }).then((r) => r.event),
  deleteEvent: (c: Client, projectId: string, timelineId: string, id: string) => c.request<{ ok: true }>(`${t(projectId, timelineId)}/${encodeURIComponent(id)}`, { method: "DELETE" }),
  createThread: (c: Client, projectId: string, name: string) => c.request<{ thread: PlotThread }>(`${v(projectId)}/threads`, { method: "POST", body: { name } }).then((r) => r.thread),
  updateThread: (c: Client, projectId: string, id: string, patch: { name?: string; color?: string; closedNodeId?: string | null }) =>
    c.request<{ thread: PlotThread }>(`${v(projectId)}/threads/${encodeURIComponent(id)}`, { method: "PATCH", body: patch }).then((r) => r.thread),
  deleteThread: (c: Client, projectId: string, id: string) => c.request<{ ok: true }>(`${v(projectId)}/threads/${encodeURIComponent(id)}`, { method: "DELETE" }),
  /** A plot grid cell: an empty note keeps the scene in the thread, null takes it out. */
  setCell: (c: Client, projectId: string, nodeId: string, threadId: string, note: string | null) =>
    c.request<{ ok: true }>(`${v(projectId)}/cells`, { method: "PUT", body: { nodeId, threadId, note } }),
  setProperties: (c: Client, projectId: string, noteId: string, patch: Record<string, PropertyValue>) =>
    c.request<{ node: ViewNode }>(`${nt(projectId, noteId)}/properties`, { method: "PATCH", body: patch }).then((r) => r.node),
  /** Puts a card right after `afterId` among its siblings, or first. */
  move: (c: Client, projectId: string, noteId: string, afterId: string | null) =>
    c.request<{ node: ViewNode }>(`${nt(projectId, noteId)}/move`, { method: "POST", body: { afterId } }).then((r) => r.node),
  backlinks: (c: Client, projectId: string, noteId: string) => c.request<{ backlinks: Backlink[] }>(`${nt(projectId, noteId)}/links`).then((r) => r.backlinks),
};

/** The views' data for a project, cached for offline. */
export function useViews(projectId: string) {
  const client = useClient();
  return useResource(viewKeys.views(projectId), () => viewsApi.views(client, projectId));
}

/** After a change made here: the views, and the binder (titles, order) that other screens show. */
export function refreshViews(projectId: string) {
  invalidate(viewKeys.views(projectId));
  invalidate(`notes:${projectId}`);
}
