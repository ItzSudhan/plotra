import { localRoomAccess, toBase64 } from "@/lib/collab/local-access";
import { listenToRoom, type HubEvent } from "@/lib/collab/local-hub";
import { isLocalMode } from "@/lib/local-mode";

// GET /api/collab/local/events?project&room&client: changes made to a room
// somewhere else (another window, the agent) as Server-Sent Events, for as
// long as the window keeps it open (local-mode-plan.md, phase 3).

const KEEPALIVE_MS = 25_000;

function encode(event: HubEvent): string {
  switch (event.type) {
    case "update":
      return `event: update\ndata: ${toBase64(event.data)}\n\n`;
    case "awareness":
      return `event: awareness\ndata: ${toBase64(event.data)}\n\n`;
    case "message":
      return `event: message\ndata: ${JSON.stringify(event.data)}\n\n`;
    case "recheck":
      return "event: recheck\ndata: {}\n\n";
  }
}

export async function GET(request: Request) {
  if (!isLocalMode) return new Response("Not found", { status: 404 });
  const access = await localRoomAccess(request);
  if (!access) return new Response("Forbidden", { status: 403 });

  const encoder = new TextEncoder();
  let stop: (() => void) | null = null;
  let keepalive: ReturnType<typeof setInterval> | null = null;
  const close = () => {
    stop?.();
    stop = null;
    if (keepalive) clearInterval(keepalive);
    keepalive = null;
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (text: string) => controller.enqueue(encoder.encode(text));
      try {
        stop = await listenToRoom(access.room, { id: access.client ?? crypto.randomUUID(), send: (event) => send(encode(event)) });
      } catch {
        controller.close();
        return;
      }
      send(`event: ready\ndata: ${JSON.stringify({ role: access.role })}\n\n`);
      keepalive = setInterval(() => {
        try {
          send(": keepalive\n\n");
        } catch {
          close();
        }
      }, KEEPALIVE_MS);
      request.signal.addEventListener("abort", () => {
        close();
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      });
    },
    cancel: close,
  });

  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-store, no-transform", connection: "keep-alive" },
  });
}
