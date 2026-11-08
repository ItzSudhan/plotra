import { describe, expect, test } from "bun:test";
import path from "node:path";
import { LibraryInUseError } from "../src/library";
import { backupSaved, describeError, fileManager, folderName, FriendlyError, libraryLabels, switchQuestion } from "../src/messages";

describe("problems in plain words", () => {
  test("a friendly error keeps its words, with the technical part apart", () => {
    const problem = describeError(new FriendlyError("The library took too long to open.", { detail: "exit 1", log: "/logs/server.log" }), "Couldn't open the library");
    expect(problem).toEqual({ title: "Couldn't open the library", message: "The library took too long to open.", detail: "exit 1", log: "/logs/server.log" });
  });

  test("the library's own errors are shown as they are", () => {
    expect(describeError(new LibraryInUseError("This library is already open in Plotra."), "Couldn't open the library").message).toBe("This library is already open in Plotra.");
  });

  test("file-system codes become a next step, the code goes behind details", () => {
    const error = Object.assign(new Error("EACCES: permission denied, mkdir '/x'"), { code: "EACCES" });
    const problem = describeError(error, "Couldn't make the library there");
    expect(problem.message).toMatch(/isn't allowed to use that folder/);
    expect(problem.message).not.toMatch(/EACCES/);
    expect(problem.detail).toMatch(/EACCES/);
  });

  test("anything else gets a calm fallback", () => {
    const problem = describeError("boom", "Couldn't back up the library");
    expect(problem.message).toMatch(/Try again/);
    expect(problem.detail).toBe("boom");
  });
});

describe("library names", () => {
  test("a library is called by its folder's name", () => {
    expect(folderName(path.join("/Users", "sam", "My Library"))).toBe("My Library");
  });

  test("two libraries with one name are told apart by their parent folder", () => {
    const labels = libraryLabels([path.join("/a", "Novel"), path.join("/b", "Novel"), path.join("/c", "Poems")]).map((entry) => entry.label);
    expect(labels).toEqual(["Novel (a)", "Novel (b)", "Poems"]);
  });

  test("switching asks in words", () => {
    expect(switchQuestion("‘My Library’", "Plotra Cloud")).toBe("Close ‘My Library’ and switch to Plotra Cloud?");
  });
});

test("the backup message names the time", () => {
  expect(backupSaved(new Date(2026, 9, 20, 15, 42), "en-GB")).toBe("A copy of your library from 15:42 is in the Snapshots folder.");
  expect(fileManager("darwin")).toBe("Finder");
  expect(fileManager("win32")).toBe("Explorer");
});
