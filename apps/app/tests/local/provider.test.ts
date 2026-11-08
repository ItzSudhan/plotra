import { afterAll, describe, expect, mock, test } from "bun:test";
import * as Y from "yjs";

// Local mode's room connection (components/collab/local-provider.ts) against
// the in-app hub (lib/collab/local-hub.ts), with fetch and EventSource wired
// straight to the hub instead of over HTTP.

const stored = new Map<string, Uint8Array>();
mock.module("@/lib/collab/sync", () => ({
  loadRoomState: async (room: string) => stored.get(room) ?? Y.encodeStateAsUpdate(new Y.Doc()),
  syncRoomState: async (room: string, state: Uint8Array) => {
    stored.set(room, state);
    return true;
  },
}));

const hub = await import("@/lib/collab/local-hub");
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
const unb64 = (text: string) => new Uint8Array(Buffer.from(text, "base64"));

/** Whether the app can be reached; off, every request fails like a dropped connection. */
let online = true;

class FakeEventSource {
  static CLOSED = 2;
  readyState = 1;
  onerror: ((event: Event) => void) | null = null;
  private handlers = new Map<string, Array<(event: { data: string }) => void>>();
  private stop: (() => void) | null = null;
  constructor(url: string) {
    const params = new URL(url, "http://app").searchParams;
    const room = params.get("room")!;
    void hub
      .listenToRoom(room, {
        id: params.get("client")!,
        send: (event) => {
          if (!online) return;
          if (event.type === "update") this.fire("update", b64(event.data));
          if (event.type === "message") this.fire("message", JSON.stringify(event.data));
        },
      })
      .then((stop) => {
        this.stop = stop;
        this.fire("ready", JSON.stringify({ role: "editor" }));
      });
  }
  addEventListener(name: string, handler: (event: { data: string }) => void) {
    this.handlers.set(name, [...(this.handlers.get(name) ?? []), handler]);
  }
  fire(name: string, data: string) {
    for (const handler of this.handlers.get(name) ?? []) handler({ data });
  }
  close() {
    this.readyState = 2;
    this.stop?.();
  }
}

const realFetch = globalThis.fetch;
const realEventSource = globalThis.EventSource;
afterAll(() => {
  globalThis.fetch = realFetch;
  globalThis.EventSource = realEventSource;
});

globalThis.EventSource = FakeEventSource as unknown as typeof EventSource;
globalThis.fetch = (async (input: string, init?: RequestInit) => {
  if (!online) throw new TypeError("Failed to fetch");
  const url = new URL(input, "http://app");
  const room = url.searchParams.get("room")!;
  const client = url.searchParams.get("client");
  if ((init?.method ?? "GET") === "GET") {
    const sv = url.searchParams.get("sv");
    const { update, stateVector } = await hub.roomDiff(room, sv ? unb64(sv) : undefined);
    return new Response(Buffer.from(update), { headers: { "x-plotra-role": "editor", "x-plotra-sv": b64(stateVector) } });
  }
  if (url.searchParams.has("message")) {
    await hub.relayMessage(room, String(init?.body), client);
    return new Response(null, { status: 204 });
  }
  await hub.applyRoomUpdate(room, init!.body as Uint8Array, client);
  return new Response(null, { status: 204 });
}) as typeof fetch;

const { LocalProvider } = await import("@/components/collab/local-provider");

const tick = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));

function open(room: string) {
  const doc = new Y.Doc();
  const provider = new LocalProvider(doc, { projectId: "p1", room });
  return { doc, provider, text: () => doc.getText("t").toString() };
}

describe("local mode's room connection", () => {
  test("two windows on one note see each other's typing", async () => {
    const a = open("node-n1");
    const b = open("node-n1");
    await tick(50);
    expect(a.provider.synced && b.provider.synced).toBe(true);
    a.doc.getText("t").insert(0, "Hello");
    await tick();
    expect(b.text()).toBe("Hello");
    b.doc.getText("t").insert(5, ", world");
    await tick();
    expect(a.text()).toBe("Hello, world");
    a.provider.destroy();
    b.provider.destroy();
    await hub.flushLocalRooms();
  });

  test("a window opening later gets what was written", async () => {
    const late = open("node-n1");
    await tick(50);
    expect(late.text()).toBe("Hello, world");
    late.provider.destroy();
  });

  test("what's written while the app can't be reached goes up when it's back", async () => {
    const a = open("node-n2");
    const b = open("node-n2");
    await tick(50);
    online = false;
    a.doc.getText("t").insert(0, "Offline words");
    await tick();
    expect(b.text()).toBe("");
    online = true;
    // The stream reopening brings the copies level.
    (a.provider as unknown as { resync: () => Promise<void> }).resync();
    await tick();
    expect(b.text()).toBe("Offline words");
    a.provider.destroy();
    b.provider.destroy();
    await hub.flushLocalRooms();
  });

  test("notices reach the project's other windows", async () => {
    const a = open("presence-p1");
    const b = open("presence-p1");
    await tick(50);
    const got: string[] = [];
    b.provider.on("custom-message", ((message: string) => got.push(message)) as never);
    a.provider.sendMessage("binder");
    await tick(50);
    expect(got).toEqual(["binder"]);
    a.provider.destroy();
    b.provider.destroy();
  });
});
