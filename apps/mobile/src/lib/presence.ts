import type { Client } from "./api";

// The project's presence room on the collab server, for its notices only:
// "chat:project" when someone posts in a chat, so open chats look again at
// once. It's the same room the web's workspace joins
// (apps/app/components/collab/presence.ts); there, notices travel as
// y-partyserver's custom messages, text frames that start "__YPS:". The phone
// doesn't take part in the room's shared document or awareness (it has no
// Yjs outside the editor), so it ignores every binary frame and doesn't show
// up as someone in the project.
//
// The token for the room lasts ten minutes, and the server checks it on each
// message it gets, so a notice sent on an older connection reconnects first.

const PREFIX = "__YPS:";
const FRESH_MS = 9 * 60_000;
/** The party every room lives in (apps/app/lib/collab/rooms.ts). */
const PARTY = "document";

export type PresenceLink = {
  /** Tells everyone else in the project; quietly dropped when the room can't be reached. */
  notify: (notice: string) => void;
  /** Whether notices are arriving right now. */
  live: () => boolean;
  close: () => void;
};

/** The address of the presence room, from the collab server's own (http or https). */
export function presenceUrl(collabUrl: string, projectId: string, token: string): string {
  const base = new URL(collabUrl);
  const protocol = base.protocol === "https:" || base.protocol === "wss:" ? "wss:" : "ws:";
  return `${protocol}//${base.host}/parties/${PARTY}/${encodeURIComponent(`presence-${projectId}`)}?${new URLSearchParams({ token })}`;
}

/** A notice in a frame, or null for anything else (the room's binary sync and awareness). */
export function noticeIn(data: unknown): string | null {
  return typeof data === "string" && data.startsWith(PREFIX) ? data.slice(PREFIX.length) : null;
}

export function joinPresence(client: Client, projectId: string, onNotice: (notice: string) => void, onLive?: (live: boolean) => void): PresenceLink {
  let socket: WebSocket | null = null;
  let openedAt = 0;
  let closed = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const waiting: string[] = [];
  let isLive = false;
  const setLive = (value: boolean) => {
    if (value === isLive) return;
    isLive = value;
    onLive?.(value);
  };

  const retry = () => {
    if (closed || timer) return;
    // 2 s, 4 s, 8 s… up to a minute: a server without a collab server (local mode) isn't asked every moment.
    const wait = Math.min(60_000, 2000 * 2 ** Math.min(attempt, 5));
    attempt += 1;
    timer = setTimeout(() => {
      timer = null;
      void connect();
    }, wait);
  };

  const connect = async () => {
    if (closed) return;
    let url: string;
    try {
      const seat = await client.collabSeat(projectId, `presence-${projectId}`);
      url = presenceUrl(seat.url, projectId, seat.token);
    } catch {
      retry();
      return;
    }
    if (closed) return;
    const ws = new WebSocket(url);
    socket = ws;
    ws.onopen = () => {
      if (socket !== ws) return;
      openedAt = Date.now();
      attempt = 0;
      setLive(true);
      for (const notice of waiting.splice(0)) ws.send(PREFIX + notice);
    };
    ws.onmessage = (event: { data: unknown }) => {
      const notice = noticeIn(event.data);
      if (notice) onNotice(notice);
    };
    ws.onclose = () => {
      if (socket !== ws) return;
      socket = null;
      setLive(false);
      retry();
    };
    ws.onerror = () => {};
  };

  const reconnect = () => {
    const old = socket;
    socket = null;
    old?.close();
    if (timer) clearTimeout(timer);
    timer = null;
    void connect();
  };

  void connect();

  return {
    notify: (notice) => {
      if (socket?.readyState === WebSocket.OPEN && Date.now() - openedAt < FRESH_MS) socket.send(PREFIX + notice);
      else {
        // Kept for the next connection; only the latest few matter.
        waiting.push(notice);
        waiting.splice(0, Math.max(0, waiting.length - 5));
        if (!socket || socket.readyState === WebSocket.OPEN) reconnect();
      }
    },
    live: () => isLive,
    close: () => {
      closed = true;
      if (timer) clearTimeout(timer);
      const old = socket;
      socket = null;
      old?.close();
      setLive(false);
    },
  };
}
