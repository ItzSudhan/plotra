import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import path from "node:path";
import { createLibrary, DEFAULT_LIBRARY_NAME, isLibrary, libraryFolderName, LibraryInUseError, lockLibrary, LOCK_STALE_MS, newLibraryPath, NotALibraryError, openLibrary, setDailySnapshots, takesDailySnapshots } from "../src/library";
import { rememberLibrary } from "../src/settings";

const root = mkdtempSync(path.join(tmpdir(), "plotra-library-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const dir = (name: string) => path.join(root, name);

describe("libraries", () => {
  test("an empty folder becomes the library, with its own secrets", () => {
    const library = createLibrary(dir("empty"));
    expect(library.dir).toBe(dir("empty"));
    expect(isLibrary(library.dir)).toBe(true);
    expect(library.manifest.authSecret.length).toBeGreaterThan(30);
    expect(library.manifest.authSecret).not.toBe(library.manifest.aiKeySecret);
    expect(openLibrary(library.dir).manifest).toEqual(library.manifest);
  });

  test("a folder with other things in it gets a library folder inside it", () => {
    mkdirSync(dir("documents"));
    writeFileSync(path.join(dir("documents"), "letter.txt"), "hi");
    const library = createLibrary(dir("documents"));
    expect(library.dir).toBe(path.join(dir("documents"), "Plotra Library"));
  });

  test("making a library where one is opens it instead", () => {
    const first = createLibrary(dir("again"));
    expect(createLibrary(dir("again")).manifest.authSecret).toBe(first.manifest.authSecret);
  });

  test("a named library goes in a folder of its name, or the next free one", () => {
    mkdirSync(dir("parent"));
    expect(newLibraryPath(dir("parent"), "My Novel")).toBe(path.join(dir("parent"), "My Novel"));
    mkdirSync(path.join(dir("parent"), "Taken"));
    writeFileSync(path.join(dir("parent"), "Taken", "notes.txt"), "hi");
    expect(newLibraryPath(dir("parent"), "Taken")).toBe(path.join(dir("parent"), "Taken 2"));
    // An empty folder of that name is used as it is.
    mkdirSync(path.join(dir("parent"), "Empty"));
    expect(newLibraryPath(dir("parent"), "Empty")).toBe(path.join(dir("parent"), "Empty"));
    // A library of that name is opened, not doubled.
    const existing = createLibrary(path.join(dir("parent"), "Journal"));
    expect(newLibraryPath(dir("parent"), "Journal")).toBe(existing.dir);
  });

  test("library names are made fit for a folder", () => {
    expect(libraryFolderName("  Book: one / two?  ")).toBe("Book one two");
    expect(libraryFolderName("...")).toBe(DEFAULT_LIBRARY_NAME);
    expect(libraryFolderName("")).toBe(DEFAULT_LIBRARY_NAME);
    expect(libraryFolderName("con")).toBe(DEFAULT_LIBRARY_NAME);
    expect(libraryFolderName("trailing dot.")).toBe("trailing dot");
  });

  test("a folder that isn't a library won't open", () => {
    mkdirSync(dir("plain"));
    expect(() => openLibrary(dir("plain"))).toThrow(NotALibraryError);
  });

  test("a library from a newer Plotra won't open", () => {
    const library = createLibrary(dir("newer"));
    const file = path.join(library.dir, "plotra-library.json");
    writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, "utf8")), format: 99 }));
    expect(() => openLibrary(library.dir)).toThrow(/newer Plotra/);
  });
});

describe("the library lock", () => {
  test("stops a second app on this computer while the first has it open", () => {
    const library = createLibrary(dir("locked"));
    const lockFile = path.join(library.dir, ".plotra-lock");
    // Another process on this computer that is still running: this test's parent.
    writeFileSync(lockFile, JSON.stringify({ pid: process.ppid, host: hostname(), at: Date.now() }));
    expect(() => lockLibrary(library.dir)).toThrow(LibraryInUseError);
  });

  test("takes over a lock left by an app that isn't running any more", () => {
    const library = createLibrary(dir("stale"));
    writeFileSync(path.join(library.dir, ".plotra-lock"), JSON.stringify({ pid: 2 ** 22 + 12345, host: hostname(), at: Date.now() }));
    const unlock = lockLibrary(library.dir);
    unlock();
  });

  test("trusts another computer's lock until it goes stale", () => {
    const library = createLibrary(dir("synced"));
    const lockFile = path.join(library.dir, ".plotra-lock");
    writeFileSync(lockFile, JSON.stringify({ pid: 1, host: "other-laptop", at: Date.now() }));
    expect(() => lockLibrary(library.dir)).toThrow(/other-laptop/);
    writeFileSync(lockFile, JSON.stringify({ pid: 1, host: "other-laptop", at: Date.now() - LOCK_STALE_MS - 1000 }));
    lockLibrary(library.dir)();
  });

  test("gives the lock back", () => {
    const library = createLibrary(dir("released"));
    lockLibrary(library.dir)();
    lockLibrary(library.dir)();
  });
});

describe("settings", () => {
  test("remember the libraries most recent first, without repeats", () => {
    let settings = { recent: [], ports: {} } as Parameters<typeof rememberLibrary>[0];
    settings = rememberLibrary(settings, "/a");
    settings = rememberLibrary(settings, "/b");
    settings = rememberLibrary(settings, "/a");
    expect(settings.recent).toEqual(["/a", "/b"]);
    expect(settings.mode).toBe("local");
  });
});

describe("daily snapshots", () => {
  test("a new library takes none unless asked to", () => {
    expect(takesDailySnapshots(createLibrary(dir("quiet")).manifest)).toBe(false);
    expect(takesDailySnapshots(createLibrary(dir("daily"), { dailySnapshots: true }).manifest)).toBe(true);
  });

  test("turning them on or off is saved in the library", () => {
    const library = setDailySnapshots(createLibrary(dir("toggled")), true);
    expect(takesDailySnapshots(library.manifest)).toBe(true);
    expect(openLibrary(library.dir).manifest.dailySnapshots).toBe(true);
    expect(openLibrary(library.dir).manifest.authSecret).toBe(library.manifest.authSecret);
    expect(openLibrary(setDailySnapshots(library, false).dir).manifest.dailySnapshots).toBe(false);
  });

  test("a library from before it was asked keeps taking them", () => {
    const library = createLibrary(dir("older"));
    const { dailySnapshots: _, ...older } = library.manifest;
    writeFileSync(path.join(library.dir, "plotra-library.json"), JSON.stringify(older));
    expect(takesDailySnapshots(openLibrary(library.dir).manifest)).toBe(true);
  });
});
