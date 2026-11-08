import { describe, expect, test } from "bun:test";
import { parseBoardChange } from "@/app/api/mobile/maps/rooms";

// What the phone app may change on a board (app/api/mobile/maps/board): checked before the room is touched.

describe("board changes from the phone", () => {
  test("moving a card rounds where it goes", () => {
    expect(parseBoardChange({ action: "move", id: "c1", x: 10.6, y: -3.2 })).toEqual({ action: "move", id: "c1", x: 11, y: -3 });
  });

  test("adding and changing text cards", () => {
    expect(parseBoardChange({ action: "add-text", text: "Idea", x: 0, y: 0 })).toEqual({ action: "add-text", text: "Idea", x: 0, y: 0 });
    expect(parseBoardChange({ action: "set-text", id: "c1", text: "" })).toEqual({ action: "set-text", id: "c1", text: "" });
  });

  test("turns down anything else", () => {
    expect(() => parseBoardChange({ action: "delete", id: "c1" })).toThrow("Send action");
    expect(() => parseBoardChange({ action: "move", id: "c1", x: "1", y: 2 })).toThrow("numbers");
    expect(() => parseBoardChange({ action: "move", id: "c1", x: Number.NaN, y: 2 })).toThrow("numbers");
    expect(() => parseBoardChange({ action: "move", id: "c1", x: 1e9, y: 2 })).toThrow("numbers");
    expect(() => parseBoardChange({ action: "move", x: 1, y: 2 })).toThrow("Say which card");
    expect(() => parseBoardChange({ action: "add-text", text: "x".repeat(4001), x: 0, y: 0 })).toThrow("too much");
  });
});
