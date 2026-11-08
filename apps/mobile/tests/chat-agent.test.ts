import { describe, expect, test } from "bun:test";
import { insertNote, matchNotes, noteMentionAt, splitLines, stillMentioned, upsert } from "../src/lib/agent-text";
import { chatNotice, joinsPrevious, mergeMessages, type ChatMessage } from "../src/lib/chat-api";
import { noticeIn, presenceUrl } from "../src/lib/presence";
import type { Note } from "../src/lib/types";

const msg = (id: string, at: string, authorId = "a"): ChatMessage => ({ id, authorId, body: id, createdAt: at, mine: false });

describe("chat", () => {
  test("older pages go in front, without repeats, oldest first", () => {
    const latest = [msg("3", "2026-11-01T10:03:00Z"), msg("4", "2026-11-01T10:04:00Z")];
    const older = [msg("1", "2026-11-01T10:01:00Z"), msg("3", "2026-11-01T10:03:00Z")];
    expect(mergeMessages(older, latest).map((m) => m.id)).toEqual(["1", "3", "4"]);
  });

  test("messages a few minutes apart from the same person sit together", () => {
    const a = msg("1", "2026-11-01T10:00:00Z");
    expect(joinsPrevious(msg("2", "2026-11-01T10:02:00Z"), a)).toBe(true);
    expect(joinsPrevious(msg("2", "2026-11-01T10:05:00Z"), a)).toBe(false);
    expect(joinsPrevious(msg("2", "2026-11-01T10:01:00Z", "b"), a)).toBe(false);
    expect(joinsPrevious(a, undefined)).toBe(false);
  });

  test("the notice is the web's", () => {
    expect(chatNotice(null)).toBe("chat:project");
    expect(chatNotice("n1")).toBe("chat:n1");
  });
});

describe("presence", () => {
  test("joins the project's room on the collab server, secure when it is", () => {
    expect(presenceUrl("https://collab.plotra.ink", "p1", "t.k")).toBe("wss://collab.plotra.ink/parties/document/presence-p1?token=t.k");
    expect(presenceUrl("http://192.168.1.4:8787", "p1", "x")).toBe("ws://192.168.1.4:8787/parties/document/presence-p1?token=x");
  });

  test("hears notices and nothing else", () => {
    expect(noticeIn("__YPS:chat:project")).toBe("chat:project");
    expect(noticeIn("binder")).toBeNull();
    expect(noticeIn(new ArrayBuffer(4))).toBeNull();
  });
});

const note = (id: string, title: string, over: Partial<Note> = {}): Note => ({
  id,
  parentId: null,
  kind: "scene",
  title,
  synopsis: null,
  tags: [],
  aliases: [],
  status: null,
  wordCount: 0,
  updatedAt: "",
  canEdit: true,
  revealReleaseId: null,
  ...over,
});

describe("asking the AI", () => {
  test("reads whole lines and keeps the rest", () => {
    expect(splitLines('{"a":1}\n{"b"')).toEqual({ lines: ['{"a":1}'], rest: '{"b"' });
    expect(splitLines('{"a":1}\n\n')).toEqual({ lines: ['{"a":1}'], rest: "" });
  });

  test("keeps each snapshot in its message's place", () => {
    const list = [{ id: "u", v: 1 }, { id: "a", v: 1 }];
    expect(upsert(list, { id: "a", v: 2 })).toEqual([{ id: "u", v: 1 }, { id: "a", v: 2 }]);
    expect(upsert(list, { id: "b", v: 1 }).map((m) => m.id)).toEqual(["u", "a", "b"]);
  });

  test("points at notes with @, as the web does", () => {
    expect(noteMentionAt("Where is @Let", 13)).toBe("Let");
    expect(noteMentionAt("mail@x", 6)).toBeNull();
    const notes = [note("1", "The letter"), note("2", "Letters home"), note("3", "Archive", { kind: "folder" }), note("4", "Mara", { aliases: ["the letter-writer"] })];
    expect(matchNotes(notes, "let").map((n) => n.id)).toEqual(["2", "1", "4"]);
    expect(insertNote("Where is @Let", 13, "The letter")).toEqual({ text: "Where is @The letter ", caret: 21 });
    expect(stillMentioned("About @Mara only", [{ id: "4", title: "Mara" }, { id: "1", title: "The letter" }])).toEqual([{ id: "4", title: "Mara" }]);
  });
});
