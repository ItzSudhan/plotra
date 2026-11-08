import { describe, expect, mock, test } from "bun:test";
import * as Y from "yjs";

// The in-app room hub that stands in for the collab server in local mode
// (lib/collab/local-hub.ts). Saving is stubbed: what's tested is merging,
// handing changes on, and when a save happens.

const saved: Array<{ room: string; text: string }> = [];
const stored = new Map<string, Uint8Array>();
const textOf = (state: Uint8Array) => {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, state);
  return doc.getText("t").toString();
};

mock.module("@/lib/collab/sync", () => ({
  loadRoomState: async (room: string) => (room === "node-missing" ? null : (stored.get(room) ?? Y.encodeStateAsUpdate(new Y.Doc()))),
  syncRoomState: async (room: string, state: Uint8Array) => {
    stored.set(room, state);
    saved.push({ room, text: textOf(state) });
    return true;
  },
}));

const hub = await import("@/lib/collab/local-hub");

function edit(text: string, base?: Uint8Array) {
  const doc = new Y.Doc();
  if (base) Y.applyUpdate(doc, base);
  const before = Y.encodeStateVector(doc);
  doc.getText("t").insert(doc.getText("t").length, text);
  return Y.encodeStateAsUpdate(doc, before);
}

describe("the local room hub", () => {
  test("merges a change and hands it to the other windows, not back to its own", async () => {
    const a: string[] = [];
    const b: string[] = [];
    const stopA = await hub.listenToRoom("node-a1", { id: "a", send: (e) => a.push(e.type) });
    const stopB = await hub.listenToRoom("node-a1", { id: "b", send: (e) => b.push(e.type) });
    await hub.applyRoomUpdate("node-a1", edit("Hello"), "a");
    expect(a).toEqual([]);
    expect(b).toEqual(["update"]);
    expect(textOf(await hub.roomState("node-a1"))).toBe("Hello");
    stopA();
    stopB();
    await hub.flushLocalRooms();
  });

  test("waits for a pause before saving, and saves what's waiting when the app quits", async () => {
    saved.length = 0;
    await hub.applyRoomUpdate("node-b1", edit("One"), "a");
    expect(saved).toEqual([]);
    await hub.flushLocalRooms();
    expect(saved).toEqual([{ room: "node-b1", text: "One" }]);
  });

  test("saves the app's own changes at once", async () => {
    saved.length = 0;
    await hub.applyRoomUpdate("node-c1", edit("Agent"), null, true);
    expect(saved).toEqual([{ room: "node-c1", text: "Agent" }]);
  });

  test("tells a window what its copy lacks", async () => {
    const base = await hub.roomState("node-d1");
    await hub.applyRoomUpdate("node-d1", edit("Abc", base), null, true);
    const stale = new Y.Doc();
    Y.applyUpdate(stale, base);
    const { update } = await hub.roomDiff("node-d1", Y.encodeStateVector(stale));
    Y.applyUpdate(stale, update);
    expect(stale.getText("t").toString()).toBe("Abc");
  });

  test("relays notices in presence rooms", async () => {
    const got: unknown[] = [];
    const stop = await hub.listenToRoom("presence-p1", { id: "b", send: (e) => got.push(e) });
    await hub.relayMessage("presence-p1", "binder", "a");
    expect(got).toEqual([{ type: "message", data: "binder", from: "a" }]);
    stop();
  });

  test("refuses rooms that don't exist", async () => {
    await expect(hub.roomState("node-missing")).rejects.toThrow();
    await expect(hub.roomState("nonsense")).rejects.toThrow();
  });
});
