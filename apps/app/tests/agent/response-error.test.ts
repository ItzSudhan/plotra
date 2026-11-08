import { describe, expect, test } from "bun:test";
import { aiMessage, responseMessage } from "@/components/agent/response-error";

// Failed responses reach people as sentences, never as HTML, JSON or status codes.
describe("responseMessage", () => {
  test("keeps a route's own sentence", () => {
    expect(responseMessage(400, "That note doesn't exist, or you can't edit it.", "Fallback.")).toBe("That note doesn't exist, or you can't edit it.");
  });
  test("turns bodies that aren't sentences into words for the status", () => {
    expect(responseMessage(413, "<html><body>Request Entity Too Large</body></html>", "Fallback.")).toBe("That file is too large.");
    expect(responseMessage(404, "Not found", "Fallback.")).toBe("That couldn't be found. It may have been deleted.");
    expect(responseMessage(500, '{"error":"boom"}', "Fallback.")).toContain("Plotra had a problem");
  });
  test("uses the fallback for an empty or bare bad request", () => {
    expect(responseMessage(400, "", "The import didn't work.")).toBe("The import didn't work.");
    expect(responseMessage(400, "Bad request", "The import didn't work.")).toBe("The import didn't work.");
  });
});

describe("aiMessage", () => {
  test("says where to fix a rejected key", () => {
    expect(aiMessage(400, "The provider didn't accept the key. Check it in Settings → AI.", "Fallback.")).toBe("Your AI key was rejected. Check it in Settings → AI.");
  });
  test("leaves other AI messages alone", () => {
    expect(aiMessage(401, "Sign in again to use AI here.", "Fallback.")).toBe("Sign in again to use AI here.");
  });
});
