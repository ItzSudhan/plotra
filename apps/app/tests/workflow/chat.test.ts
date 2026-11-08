import { describe, expect, test } from "bun:test";
import { notificationTypes } from "@plotra/db/schema";
import { inspectorPanels, inspectorTabs } from "@/lib/shell-prefs";
import { describe as say } from "@/lib/notify-text";
import { chatNotice } from "@/lib/chat";

// Chat beside the page (beat-the-competitors.md, step 8).

describe("chat", () => {
  test("a mention in a chat says where, never what", () => {
    expect(notificationTypes).toContain("chat_mention");
    expect(say({ type: "chat_mention", payload: { chat: true, title: "The Balcony" }, actorName: "Priya", projectTitle: null })).toBe("Priya mentioned you in the chat on “The Balcony”.");
    expect(say({ type: "chat_mention", payload: { chat: true }, actorName: "Priya", projectTitle: "Verona" })).toBe("Priya mentioned you in the project chat in Verona.");
  });

  test("has a tab of its own in the inspector, which can be hidden", () => {
    const every = new Set(inspectorPanels);
    expect(inspectorTabs({}, every).map((t) => t.id)).toContain("chat");
    expect(inspectorTabs({ inspector: { hidden: ["chat"] } }, every).map((t) => t.id)).not.toContain("chat");
  });

  test("the project's chat and each note's refresh on their own notices", () => {
    expect(chatNotice(null)).toBe("chat:project");
    expect(chatNotice("n1")).toBe("chat:n1");
  });
});
