import { ApiError, body, json, withApi } from "@/lib/api/handler";
import { createTimelineEvent, getTimelineEvents } from "@/lib/story-actions";

type Context = { params: Promise<{ project: string; timeline: string }> };

type EventBody = { title?: string; description?: string | null; start?: number; end?: number | null; lane?: string | null; color?: string | null; nodeId?: string | null };

// GET  /api/mobile/views/<project>/timeline/<timeline>: the timeline's own events (scenes come from their Story date).
// POST /api/mobile/views/<project>/timeline/<timeline> { title, start, end?, lane?, color?, description?, nodeId? }: adds one.
// Dates are minutes in the timeline's calendar (lib/calendar.ts).
export async function GET(request: Request, { params }: Context) {
  const { project, timeline } = await params;
  return withApi(request, "read", async () => json({ events: await getTimelineEvents(project, timeline) }));
}

export async function POST(request: Request, { params }: Context) {
  const { project, timeline } = await params;
  return withApi(request, "write", async () => {
    const input = await body<EventBody>(request);
    if (typeof input.start !== "number") throw new ApiError(400, "Send when it happens (start).");
    return json({ event: await createTimelineEvent(project, timeline, { ...input, start: input.start }) }, 201);
  });
}
