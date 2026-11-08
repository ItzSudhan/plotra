import { expect, test } from "bun:test";
import { targetOf } from "../src/lib/push-target";

test("a push opens the chat, the thread, the note, the project or Inbox", () => {
  expect(targetOf({ projectId: "p1", nodeId: "n1", chat: true }) as string).toBe("/project/p1/chat?note=n1");
  expect(targetOf({ projectId: "p1", chat: true }) as string).toBe("/project/p1/chat");
  expect(targetOf({ projectId: "p1", nodeId: "n1", threadId: "t 1" }) as string).toBe("/project/p1/comments/n1?thread=t%201");
  expect(targetOf({ projectId: "p1", nodeId: "n1" }) as string).toBe("/project/p1/note/n1");
  expect(targetOf({ projectId: "p1", nodeId: null }) as string).toBe("/project/p1");
  expect(targetOf({}) as string).toBe("/inbox");
});
