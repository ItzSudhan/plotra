import { expect, test } from "bun:test";
import { chunks, goneTokens, isExpoToken, messagesFor, type PushNotice } from "@/lib/push-message";

const notice: PushNotice = {
  id: "n1",
  userId: "u1",
  type: "mention",
  projectId: "p1",
  nodeId: "x1",
  payload: { title: "Chapter One", threadId: "t1" },
  actorName: "Ana",
  projectTitle: "The Long Road",
};

test("a push says what the bell says, under the project's title, and points at the thread", () => {
  const [m] = messagesFor(notice, ["ExponentPushToken[abc]"], 3);
  expect(m.title).toBe("The Long Road");
  expect(m.body).toBe("Ana mentioned you in a comment on “Chapter One” in The Long Road.");
  expect(m.data).toEqual({ notificationId: "n1", projectId: "p1", nodeId: "x1", threadId: "t1" });
  expect(m.badge).toBe(3);
  expect(m.channelId).toBe("default");
});

test("chat mentions carry chat, and there's one message per phone", () => {
  const ms = messagesFor({ ...notice, type: "chat_mention", nodeId: null, payload: { chat: true } }, ["ExpoPushToken[a]", "ExpoPushToken[b]"]);
  expect(ms.map((m) => m.to)).toEqual(["ExpoPushToken[a]", "ExpoPushToken[b]"]);
  expect(ms[0].data).toEqual({ notificationId: "n1", projectId: "p1", nodeId: null, chat: true });
  expect(ms[0].badge).toBeUndefined();
});

test("no project means Plotra as the title", () => {
  expect(messagesFor({ ...notice, type: "invite_accepted", projectId: null, projectTitle: null, payload: { workspace: "Ink" } }, ["ExpoPushToken[a]"])[0].title).toBe("Plotra");
});

test("batches of a hundred", () => {
  expect(chunks(Array.from({ length: 250 }, (_, i) => i)).map((c) => c.length)).toEqual([100, 100, 50]);
});

test("phones Expo says are gone are found by ticket, in order", () => {
  const sent = [{ to: "ExpoPushToken[a]" }, { to: "ExpoPushToken[b]" }, { to: "ExpoPushToken[c]" }];
  const answer = {
    data: [
      { status: "ok", id: "1" },
      { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } },
      { status: "error", message: "too big", details: { error: "MessageTooBig" } },
    ],
  };
  expect(goneTokens(sent, answer)).toEqual(["ExpoPushToken[b]"]);
  expect(goneTokens(sent, { errors: [{ code: "x" }] })).toEqual([]);
});

test("only Expo push tokens are taken", () => {
  expect(isExpoToken("ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]")).toBe(true);
  expect(isExpoToken("hello")).toBe(false);
  expect(isExpoToken(42)).toBe(false);
});
