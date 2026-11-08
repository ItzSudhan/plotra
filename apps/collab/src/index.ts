// Plotra's collab server (plan.md section 3). Deliberately "dumb": it checks
// tokens, syncs Yjs docs and awareness, and persists state. Everything else
// (permissions, text, links, word counts) is decided by the Next app.
//
// Rooms: node-<id> (a document) and presence-<projectId> (awareness only,
// never stored).
//
// Besides WebSockets, a room answers three plain requests from the Next app,
// authenticated with COLLAB_SECRET (the service token). They are how the AI
// agent edits (plan.md 2.11 "How it edits"): the app reads a document's state,
// works out the edit itself, and hands back a Yjs update to merge. The server
// still decides nothing: it doesn't know what a block is.
//   GET  /parties/document/<room>            the document's current state
//   POST /parties/document/<room>            a Yjs update to apply
//   POST /parties/document/<room>?awareness  an awareness update to relay (the agent's presence and cursor)
//   POST /parties/document/<room>?recheck    close every editing connection, so each reconnects with a
//                                            fresh token (the note was locked: most of them lose write access)

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { routePartykitRequest, type Connection, type ConnectionContext, type WSMessage } from "partyserver";
import { YServer } from "y-partyserver";
import { applyAwarenessUpdate } from "y-protocols/awareness";
import * as Y from "yjs";

type Env = {
  Document: DurableObjectNamespace<Document>;
  /** The Next app, for JWKS, seeding and content sync. */
  APP_URL: string;
  /**
   * Where this server reaches the app, when that isn't its public URL: in the
   * self-hosting compose stack the app is `http://app:3000` on the internal
   * network. Tokens are still checked against APP_URL, their issuer.
   */
  APP_INTERNAL_URL?: string;
  /** Shared with the Next app (COLLAB_SECRET there too). */
  COLLAB_SECRET: string;
};

type Role = "editor" | "commenter" | "viewer";
type ConnectionState = { userId: string; role: Role; exp: number };
type CollabClaims = JWTPayload & { room?: string; role?: Role };

const AUDIENCE = "plotra-collab";
const ROOM = /^(node|presence)-[A-Za-z0-9-]{1,64}$/;
// DO SQLite values are capped at 2 MB, so large docs are stored in chunks.
const CHUNK = 1024 * 1024;
// The largest update or awareness message the app may post.
const MAX_UPDATE = 20 * 1024 * 1024;
const MAX_AWARENESS = 16 * 1024;

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

async function verifyToken(token: string, env: Env, room: string) {
  jwks ??= createRemoteJWKSet(new URL("/api/auth/jwks", appOrigin(env)));
  const { payload } = await jwtVerify<CollabClaims>(token, jwks, { audience: AUDIENCE, issuer: env.APP_URL });
  if (!payload.sub || payload.room !== room || !payload.exp) throw new Error("Token is for another room.");
  const role: Role = payload.role === "editor" || payload.role === "commenter" ? payload.role : "viewer";
  return { userId: payload.sub, role, exp: payload.exp };
}

const appOrigin = (env: Env) => env.APP_INTERNAL_URL || env.APP_URL;

const appHeaders = (env: Env) => ({ authorization: `Bearer ${env.COLLAB_SECRET}` });

/** Whether a request carries the service token. Compared in constant time. */
function isApp(request: Request, env: Env) {
  if (!env.COLLAB_SECRET) return false;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${env.COLLAB_SECRET}`;
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export class Document extends YServer<Env> {
  static callbackOptions = { debounceWait: 2000, debounceMaxWait: 10000, timeout: 10000 };

  private get isPresence() {
    return this.name.startsWith("presence-");
  }

  async onLoad() {
    if (this.isPresence) return;
    const sql = this.ctx.storage.sql;
    sql.exec("CREATE TABLE IF NOT EXISTS ydoc (chunk INTEGER PRIMARY KEY, data BLOB NOT NULL)");
    const chunks = [...sql.exec<{ data: ArrayBuffer }>("SELECT data FROM ydoc ORDER BY chunk")].map(
      (row) => new Uint8Array(row.data),
    );
    if (chunks.length) {
      Y.applyUpdate(this.document, concat(chunks));
      return;
    }
    // First open: seed from the app (last snapshot, Phase 1 JSON content, or an empty paragraph).
    const res = await fetch(new URL(`/api/collab/doc?room=${encodeURIComponent(this.name)}`, appOrigin(this.env)), {
      headers: appHeaders(this.env),
    });
    if (!res.ok) throw new Error(`Couldn't seed ${this.name}: ${res.status}`);
    const state = new Uint8Array(await res.arrayBuffer());
    Y.applyUpdate(this.document, state);
    this.store(state);
  }

  private store(state: Uint8Array) {
    const sql = this.ctx.storage.sql;
    this.ctx.storage.transactionSync(() => {
      sql.exec("DELETE FROM ydoc");
      for (let i = 0; i * CHUNK < state.length; i++) {
        sql.exec("INSERT INTO ydoc (chunk, data) VALUES (?, ?)", i, state.subarray(i * CHUNK, (i + 1) * CHUNK));
      }
    });
  }

  async onSave() {
    if (this.isPresence) return;
    const state = Y.encodeStateAsUpdate(this.document);
    this.store(state);
    // Push the snapshot back so the app can index text, links and word counts.
    const res = await fetch(new URL(`/api/collab/sync?room=${encodeURIComponent(this.name)}`, appOrigin(this.env)), {
      method: "POST",
      headers: { ...appHeaders(this.env), "content-type": "application/octet-stream" },
      body: state,
    });
    if (!res.ok) console.error(`sync ${this.name} failed: ${res.status}`);
  }

  /**
   * The app's service requests (see the top of this file). Only the Worker
   * below lets a request in here, after checking the service token.
   */
  async onRequest(request: Request): Promise<Response> {
    const params = new URL(request.url).searchParams;
    const awareness = params.has("awareness");
    if (request.method === "POST" && params.has("recheck")) {
      // The app has changed who may write here. A connection's role is fixed when it opens, so closing
      // it is how the change reaches an open editor; its token is fetched again, and permissions with it.
      for (const connection of this.getConnections<ConnectionState>()) {
        if (connection.state?.role === "editor") connection.close(4003, "Access changed");
      }
      return new Response(null, { status: 204 });
    }
    if (request.method === "GET" && !this.isPresence) {
      return new Response(Y.encodeStateAsUpdate(this.document), { headers: { "content-type": "application/octet-stream", "cache-control": "no-store" } });
    }
    if (request.method !== "POST") return new Response("Not found", { status: 404 });
    const body = new Uint8Array(await request.arrayBuffer());
    if (!body.length || body.length > (awareness ? MAX_AWARENESS : MAX_UPDATE)) return new Response("Bad request", { status: 400 });
    try {
      if (awareness) {
        // A null origin is what makes the server relay it to every connection.
        applyAwarenessUpdate(this.document.awareness, body, null);
        return new Response(null, { status: 204 });
      }
      if (this.isPresence) return new Response("Not found", { status: 404 });
      // Merged like anyone's edit: open editors get it at once, and the usual
      // debounced save pushes text and links back to the app.
      Y.applyUpdate(this.document, body, "app");
      // Stored now as well, so an edit to a document nobody has open can't be lost before that save.
      this.store(Y.encodeStateAsUpdate(this.document));
      return new Response(null, { status: 204 });
    } catch {
      return new Response("Bad request", { status: 400 });
    }
  }

  onConnect(connection: Connection<ConnectionState>, ctx: ConnectionContext) {
    // Set by onBeforeConnect below, after the token was verified. Clients can't
    // reach a Durable Object except through this Worker.
    const h = ctx.request.headers;
    connection.setState({
      userId: h.get("x-plotra-user") ?? "",
      role: (h.get("x-plotra-role") as Role) ?? "viewer",
      exp: Number(h.get("x-plotra-exp") ?? 0),
    });
    super.onConnect(connection, ctx);
  }

  isReadOnly(connection: Connection<ConnectionState>) {
    return connection.state?.role !== "editor";
  }

  /**
   * Presence rooms relay small notices between clients ("binder changed"), so
   * everyone's binder refreshes from the app when someone adds or moves a note.
   * The notice carries no content; clients refetch with their own permissions.
   */
  onCustomMessage(connection: Connection<ConnectionState>, message: string) {
    if (!this.isPresence || message.length > 200) return;
    this.broadcastCustomMessage(message, connection);
  }

  onMessage(connection: Connection<ConnectionState>, message: WSMessage) {
    // Tokens are short-lived; when one expires the client reconnects with a
    // fresh one, which re-checks permissions in the app.
    if (!connection.state || connection.state.exp * 1000 < Date.now()) {
      connection.close(4001, "Token expired");
      return;
    }
    super.onMessage(connection, message);
  }
}

function concat(chunks: Uint8Array[]) {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

const isLocal = (url: string) => /^(localhost|127\.0\.0\.1|\[::1\])$/.test(new URL(url).hostname);

/**
 * GET /health, for the uptime check (.github/workflows/uptime.yml). It touches
 * no Durable Object. 503 when the worker can't do its job: no secret, or a
 * deployed worker still pointing at a local app (a deploy without
 * `--env production`), which would reject every token.
 */
function health(request: Request, env: Env) {
  let ok = false;
  try {
    ok = Boolean(env.COLLAB_SECRET) && (!isLocal(env.APP_URL) || isLocal(request.url));
  } catch {
    // APP_URL is missing or isn't a URL.
  }
  return Response.json({ ok }, { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "GET" && new URL(request.url).pathname === "/health") return health(request, env);
    const response = await routePartykitRequest(request, env, {
      onBeforeConnect: async (req, lobby) => {
        if (!ROOM.test(lobby.name)) return new Response("Unknown room", { status: 404 });
        const token = new URL(req.url).searchParams.get("token");
        if (!token) return new Response("Missing token", { status: 401 });
        try {
          const claims = await verifyToken(token, env, lobby.name);
          const headers = new Headers(req.headers);
          headers.set("x-plotra-user", claims.userId);
          headers.set("x-plotra-role", claims.role);
          headers.set("x-plotra-exp", String(claims.exp));
          return new Request(req, { headers });
        } catch {
          return new Response("Invalid token", { status: 401 });
        }
      },
      // Besides WebSocket upgrades, only the app's own requests are allowed into rooms.
      onBeforeRequest: (req, lobby) => {
        if (!ROOM.test(lobby.name) || !isApp(req, env)) return new Response("Not found", { status: 404 });
        return req;
      },
    });
    return response ?? new Response("Plotra collab server", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
