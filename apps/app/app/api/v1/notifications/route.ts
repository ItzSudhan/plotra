import { body, json, withApi } from "@/lib/api/handler";
import { listNotifications, markNotificationsRead } from "@/lib/notify-actions";

// GET  /api/v1/notifications: your latest notifications, in every project, and how many are unread.
// POST /api/v1/notifications { id: "…" | null }: marks one read, or all of them with null.
export function GET(request: Request) {
  return withApi(request, "read", async () => json(await listNotifications()));
}

export function POST(request: Request) {
  return withApi(request, "read", async () => {
    const { id } = await body<{ id?: unknown }>(request);
    await markNotificationsRead(typeof id === "string" ? id : null);
    return json({ ok: true });
  });
}
