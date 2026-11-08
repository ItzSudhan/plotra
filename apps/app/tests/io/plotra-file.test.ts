import { describe, expect, mock, test } from "bun:test";
import * as Y from "yjs";

// The `.plotra` project file (local-mode-plan.md, phase 6; lib/io/plotra-file.ts).
//
// The first part needs no database: how ids are rewritten, in JSON, in text and
// inside Yjs documents, and which tables the file carries. The round trip
// (export a project with its world, import it, check the copy) runs on PGlite.
// `bun test` keeps one module registry for every file, and the database driver
// is picked once, when @plotra/db is first loaded, so the round trip runs in a
// process of its own: this same file, run again with PLOTRA_FILE_ROUNDTRIP=1.

const ROUNDTRIP = process.env.PLOTRA_FILE_ROUNDTRIP === "1";
if (ROUNDTRIP) {
  process.env.DATABASE_URL = "pglite:memory";
  delete process.env.DATABASE_DRIVER;
  for (const key of ["S3_ENDPOINT", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_BUCKET"]) delete process.env[key];
}

const uuid = () => crypto.randomUUID();

if (!ROUNDTRIP) {
  const { remapper, rewriteYdoc, includedTables, excludedTables } = await import("@/lib/io/plotra-file");
  const { valueToYdoc, ydocToValue } = await import("@/lib/collab/ydoc");
  const { schema } = await import("@plotra/db");
  const { getTableColumns, getTableName, is } = await import("drizzle-orm");
  const { PgTable } = await import("drizzle-orm/pg-core");

  describe("rewriting ids", () => {
    const a = uuid();
    const b = uuid();
    const ids = new Map([[a, b]]);
    const remap = remapper(ids);

    test("replaces a whole id, and ids inside text, and leaves the rest alone", () => {
      expect(remap.text(a)).toBe(b);
      expect(remap.text(`${a}:blk1`)).toBe(`${b}:blk1`);
      expect(remap.text(`/api/files/${a.toUpperCase()}`)).toBe(`/api/files/${b}`);
      const other = uuid();
      expect(remap.text(other)).toBe(other);
      expect(remap.text("plain")).toBe("plain");
    });

    test("rewrites JSON values and keys, and keeps the same object when nothing changes", () => {
      const value = { home: a, list: [a, "x"], [a]: 1, nested: { deep: [{ id: a }] } };
      expect(remap.json(value)).toEqual({ home: b, list: [b, "x"], [b]: 1, nested: { deep: [{ id: b }] } });
      const untouched = { title: "Hamlet", tags: ["a"] };
      expect(remap.json(untouched)).toBe(untouched);
    });
  });

  describe("rewriting a Yjs document", () => {
    const oldTarget = uuid();
    const newTarget = uuid();
    const remap = remapper(new Map([[oldTarget, newTarget]]));

    test("a wikilink's target changes in place, and a comment anchor still resolves", () => {
      const value = [
        { type: "p", id: "blk1", children: [{ text: "To be, " }, { type: "wikilink", nodeId: oldTarget, children: [{ text: "" }] }, { text: " or not." }] },
        { type: "p", id: "blk2", children: [{ text: "That is the question.", comment: oldTarget }] },
      ];
      const state = valueToYdoc(value);
      // An anchor made on the original, as comment threads keep them.
      const before = new Y.Doc();
      Y.applyUpdate(before, state);
      const paragraph = (before.get("content", Y.XmlText).toDelta() as Array<{ insert: Y.XmlText }>)[0].insert;
      const anchor = Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(paragraph, 3));

      const rewritten = rewriteYdoc(state, remap);
      const out = ydocToValue(rewritten);
      expect((out[0].children as Array<Record<string, unknown>>)[1]).toMatchObject({ type: "wikilink", nodeId: newTarget });
      expect((out[1].children as Array<Record<string, unknown>>)[0]).toMatchObject({ text: "That is the question.", comment: newTarget });

      const after = new Y.Doc();
      Y.applyUpdate(after, rewritten);
      const resolved = Y.createAbsolutePositionFromRelativePosition(Y.decodeRelativePosition(anchor), after);
      expect(resolved?.index).toBe(3);
      expect(resolved?.type).toBe((after.get("content", Y.XmlText).toDelta() as Array<{ insert: Y.XmlText }>)[0].insert);
    });

    test("a canvas card's note and a map's picture are rewritten; a document without ids is returned as it was", () => {
      const doc = new Y.Doc();
      doc.getMap("cards").set("card1", { type: "note", x: 0, y: 0, nodeId: oldTarget });
      doc.getMap("map").set("fileId", oldTarget);
      const out = new Y.Doc();
      Y.applyUpdate(out, rewriteYdoc(Y.encodeStateAsUpdate(doc), remap));
      expect(out.getMap("cards").get("card1")).toEqual({ type: "note", x: 0, y: 0, nodeId: newTarget });
      expect(out.getMap("map").get("fileId")).toBe(newTarget);

      const plain = valueToYdoc([{ type: "p", children: [{ text: "Nothing to change." }] }]);
      expect(rewriteYdoc(plain, remap)).toBe(plain);
    });
  });

  test("every table holding a project's rows is either carried or left out on purpose", () => {
    const carried = new Set(includedTables.map((t) => getTableName(t)));
    const left = new Set(excludedTables);
    const projectScoped = Object.values(schema)
      .filter((value) => is(value, PgTable))
      .filter((table) => "projectId" in getTableColumns(table as InstanceType<typeof PgTable>))
      .map((table) => getTableName(table as InstanceType<typeof PgTable>));
    for (const name of projectScoped) expect({ name, classified: carried.has(name) || left.has(name) }).toEqual({ name, classified: true });
    for (const name of carried) expect(left.has(name)).toBe(false);
  });

  test("the round trip, in a process of its own on PGlite", () => {
    const run = Bun.spawnSync([process.execPath, "test", import.meta.path], {
      cwd: `${import.meta.dir}/../..`,
      env: { ...process.env, PLOTRA_FILE_ROUNDTRIP: "1", DATABASE_URL: "pglite:memory" },
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = `${run.stdout.toString()}\n${run.stderr.toString()}`;
    if (run.exitCode !== 0) console.error(output);
    expect(run.exitCode).toBe(0);
    expect(output).toContain(" 0 fail");
  }, 180_000);
} else {
  // ---- The round trip ----------------------------------------------------------------------

  const session = { user: { id: "ana", name: "Ana", email: "ana@example.com" }, session: { id: "s" } };
  const workspaces = [{ id: "org-ana", name: "Ana's", slug: "ws-ana", logo: null, role: "owner" }];
  mock.module("@/lib/data", () => ({
    getSession: async () => session,
    requireSession: async () => session,
    listWorkspaces: async () => workspaces,
    requireWorkspace: async (slug: string) => {
      const found = workspaces.find((w) => w.slug === slug);
      if (!found) throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
      return found;
    },
    isApiRequest: () => false,
    runAsApiUser: <T,>(_session: unknown, fn: () => Promise<T>) => fn(),
  }));

  const { db, schema } = await import("@plotra/db");
  const { eq, inArray } = await import("drizzle-orm");
  const { buildPlotraFile, buildPublicCopyFile, importPlotraFile, readPlotraFile } = await import("@/lib/io/plotra-file");
  const { readOnly, transaction } = await import("@/lib/request-cache");
  const { valueToYdoc, ydocToValue } = await import("@/lib/collab/ydoc");
  const { unzipSync, strFromU8 } = await import("fflate");

  const now = new Date();
  const ids = {
    world: uuid(),
    book: uuid(),
    elsinore: uuid(),
    folder: uuid(),
    scene: uuid(),
    hamlet: uuid(),
    research: uuid(),
    canvas: uuid(),
    release: uuid(),
    file: uuid(),
    version: uuid(),
    thread: uuid(),
  };
  const sceneValue = [
    {
      type: "p",
      id: "blk1",
      children: [{ text: "Ask " }, { type: "wikilink", nodeId: ids.hamlet, children: [{ text: "" }] }, { text: " about " }, { type: "wikilink", nodeId: ids.elsinore, children: [{ text: "" }] }, { text: "." }],
    },
    { type: "img", id: "blk2", url: `/api/files/${ids.file}`, children: [{ text: "" }] },
  ];
  const sceneState = valueToYdoc(sceneValue);
  const pixels = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4]);
  const anchorOf = (state: Uint8Array) => {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, state);
    const paragraph = (doc.get("content", Y.XmlText).toDelta() as Array<{ insert: Y.XmlText }>)[0].insert;
    return Buffer.from(Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(paragraph, 2))).toString("base64");
  };

  const { user, organization, member, project, node, link, release, version, attachment, commentThread, comment, translation } = schema;
  await db.insert(user).values({ id: "ana", name: "Ana", email: "ana@example.com", createdAt: now, updatedAt: now });
  await db.insert(organization).values({ id: "org-ana", name: "Ana's", slug: "ws-ana", createdAt: now });
  await db.insert(member).values({ id: "m-ana", organizationId: "org-ana", userId: "ana", role: "owner", createdAt: now });
  await db.insert(project).values([
    { id: ids.world, organizationId: "org-ana", slug: "denmark", title: "Denmark", type: "franchise" },
    { id: ids.book, organizationId: "org-ana", slug: "hamlet", title: "Hamlet", type: "stage_play", worldId: ids.world, settings: { labels: [{ id: "l1", name: "Cut?", color: "#f00" }] } },
  ]);
  await db.insert(release).values({ id: ids.release, projectId: ids.book, title: "Act 1", position: "a0" });
  await db.insert(node).values([
    { id: ids.elsinore, projectId: ids.world, kind: "location", title: "Elsinore", position: "a0" },
    { id: ids.folder, projectId: ids.book, kind: "folder", title: "Act 1", position: "a0", revealReleaseId: ids.release },
    { id: ids.scene, projectId: ids.book, parentId: ids.folder, kind: "scene", title: "The ramparts", position: "a0", ydoc: sceneState, text: "Ask about .", createdById: "ana" },
    { id: ids.hamlet, projectId: ids.book, kind: "character", title: "Hamlet", position: "a1", properties: { home: ids.elsinore } },
    { id: ids.research, projectId: ids.book, kind: "research", title: "Sources", position: "a2" },
    {
      id: ids.canvas,
      projectId: ids.book,
      kind: "canvas",
      title: "Board",
      position: "a3",
      ydoc: (() => {
        const doc = new Y.Doc();
        doc.getMap("cards").set("c1", { type: "note", x: 0, y: 0, nodeId: ids.hamlet });
        return Y.encodeStateAsUpdate(doc);
      })(),
    },
  ]);
  await db.update(release).set({ nodeId: ids.folder }).where(eq(release.id, ids.release));
  await db.insert(link).values([
    { projectId: ids.book, sourceNodeId: ids.scene, targetNodeId: ids.hamlet, kind: "wiki", context: `Ask \u0001${ids.hamlet}\u0002 about`, ordinal: 0 },
    { projectId: ids.book, sourceNodeId: ids.scene, targetNodeId: ids.elsinore, kind: "wiki", ordinal: 1 },
  ]);
  await db.insert(version).values({ id: ids.version, projectId: ids.book, nodeId: ids.scene, name: "First draft", snapshot: sceneState, size: sceneState.length, createdById: "ana" });
  await db.insert(attachment).values({ id: ids.file, projectId: ids.book, nodeId: ids.research, name: "map.png", contentType: "image/png", size: pixels.length, data: pixels, createdById: "ana" });
  await db.insert(commentThread).values({ id: ids.thread, projectId: ids.book, nodeId: ids.scene, anchor: { start: anchorOf(sceneState), end: anchorOf(sceneState) }, quote: "Ask", createdById: "ana" });
  await db.insert(comment).values({ projectId: ids.book, threadId: ids.thread, authorId: "ana", body: "Sharper?" });
  await db.insert(translation).values({ projectId: ids.book, unitKey: `${ids.scene}:blk1`, locale: "fr", text: "Demandez à Hamlet." });

  describe("a .plotra file", () => {
    let file: Awaited<ReturnType<typeof buildPlotraFile>>;

    test("carries the project, its world, the documents, versions and files", async () => {
      file = await readOnly(() => buildPlotraFile(ids.book));
      expect(file.name).toBe("hamlet.plotra");
      const entries = unzipSync(file.data);
      const manifest = JSON.parse(strFromU8(entries["plotra.json"]));
      expect(manifest).toMatchObject({ format: "plotra", version: 1, project: { id: ids.book, title: "Hamlet" }, world: { id: ids.world, title: "Denmark" } });
      expect(manifest.migration).toMatch(/^\d{4}_/);
      const nodes = JSON.parse(strFromU8(entries["tables/node.json"])) as Array<Record<string, unknown>>;
      expect(nodes.length).toBe(6);
      const scene = nodes.find((n) => n.id === ids.scene)!;
      expect(scene.ydoc).toEqual({ $blob: `blobs/node/${ids.scene}.ydoc` });
      expect(scene.createdById).toBe("someone");
      expect(entries[`blobs/node/${ids.scene}.ydoc`]).toEqual(sceneState);
      expect(entries[`blobs/attachment/${ids.file}.data`]).toEqual(pixels);
      expect(entries[`blobs/version/${ids.version}.snapshot`]).toEqual(sceneState);
      expect(readPlotraFile(file.data).tables.get("project")!.length).toBe(2);
    });

    test("imports as a new project and a new world, every id fresh and every reference following", async () => {
      const created = await transaction(() => importPlotraFile("ws-ana", file.data));
      expect(created.projectId).not.toBe(ids.book);
      expect(created.slug).toBe("hamlet-2");
      expect(created.href).toBe("/w/ws-ana/p/hamlet-2");
      expect(created.notes).toBe(5);

      const [book] = await db.select().from(project).where(eq(project.id, created.projectId));
      expect(book).toMatchObject({ title: "Hamlet", type: "stage_play", organizationId: "org-ana", createdById: "ana" });
      expect(book.settings.labels?.[0]?.name).toBe("Cut?");
      expect(book.worldId).toBe(created.worldId);
      expect(book.worldId).not.toBe(ids.world);
      const [world] = await db.select().from(project).where(eq(project.id, book.worldId!));
      expect(world).toMatchObject({ title: "Denmark", slug: "denmark-2", worldId: null });

      const nodes = await db.select().from(node).where(inArray(node.projectId, [book.id, world.id]));
      expect(nodes.length).toBe(6);
      const byTitle = new Map(nodes.map((n) => [n.title, n]));
      for (const n of nodes) expect(Object.values(ids)).not.toContain(n.id);
      const scene = byTitle.get("The ramparts")!;
      const hamlet = byTitle.get("Hamlet")!;
      const elsinore = byTitle.get("Elsinore")!;
      const folder = byTitle.get("Act 1")!;
      expect(elsinore.projectId).toBe(world.id);
      expect(scene.parentId).toBe(folder.id);
      expect(scene.createdById).toBe("ana");
      expect(hamlet.properties).toEqual({ home: elsinore.id });

      // The text, with its links pointing at the new notes and its picture at the new file.
      const value = ydocToValue(scene.ydoc!);
      const inline = value[0].children as Array<Record<string, unknown>>;
      expect(inline.map((c) => c.text ?? c.nodeId)).toEqual(["Ask ", hamlet.id, " about ", elsinore.id, "."]);
      const [file2] = await db.select().from(attachment).where(eq(attachment.projectId, book.id));
      expect(file2.id).not.toBe(ids.file);
      expect(file2.data).toEqual(pixels);
      expect(file2.createdById).toBe("ana");
      expect(value[1]).toMatchObject({ type: "img", url: `/api/files/${file2.id}` });

      const links = await db.select().from(link).where(eq(link.projectId, book.id));
      expect(links.map((l) => [l.sourceNodeId, l.targetNodeId]).sort()).toEqual([[scene.id, hamlet.id], [scene.id, elsinore.id]].sort());
      expect(links.find((l) => l.targetNodeId === hamlet.id)!.context).toBe(`Ask \u0001${hamlet.id}\u0002 about`);

      // The canvas card follows its note.
      const board = new Y.Doc();
      Y.applyUpdate(board, byTitle.get("Board")!.ydoc!);
      expect(board.getMap("cards").get("c1")).toMatchObject({ nodeId: hamlet.id });

      // The release and the folder it ships still point at each other.
      const [act] = await db.select().from(release).where(eq(release.projectId, book.id));
      expect(act.nodeId).toBe(folder.id);
      expect(folder.revealReleaseId).toBe(act.id);

      // Version history came along, its snapshot's links rewritten too.
      const [named] = await db.select().from(version).where(eq(version.projectId, book.id));
      expect(named).toMatchObject({ name: "First draft", nodeId: scene.id, createdById: "ana" });
      expect((ydocToValue(named.snapshot!)[0].children as Array<Record<string, unknown>>)[1].nodeId).toBe(hamlet.id);

      // The comment's anchor still points at the same place in the text.
      const [thread] = await db.select().from(commentThread).where(eq(commentThread.projectId, book.id));
      expect(thread.nodeId).toBe(scene.id);
      const doc = new Y.Doc();
      Y.applyUpdate(doc, scene.ydoc!);
      const resolved = Y.createAbsolutePositionFromRelativePosition(Y.decodeRelativePosition(Buffer.from(thread.anchor!.start, "base64")), doc);
      expect(resolved?.index).toBe(2);
      const [reply] = await db.select().from(comment).where(eq(comment.threadId, thread.id));
      expect(reply).toMatchObject({ body: "Sharper?", authorId: "ana" });

      const [unit] = await db.select().from(translation).where(eq(translation.projectId, book.id));
      expect(unit.unitKey).toBe(`${scene.id}:blk1`);

      // The original is untouched.
      expect((await db.select().from(node).where(eq(node.projectId, ids.book))).length).toBe(5);
    });

    test("refuses a workspace the person isn't in, and a file that isn't one", async () => {
      await expect(transaction(() => importPlotraFile("ws-ben", file.data))).rejects.toThrow();
      expect(() => readPlotraFile(new TextEncoder().encode("not a zip"))).toThrow("isn't a Plotra project file");
    });
  });

  describe("a copy from a public link", () => {
    test("carries what the link shows and the story tools; not history, comments, the trash, the world or the template mark", async () => {
      const trashedFolder = uuid();
      await db.insert(node).values([
        { id: trashedFolder, projectId: ids.book, kind: "folder", title: "Cut scenes", position: "a8", deletedAt: new Date() },
        // Not deleted itself, but inside a folder that is: in the trash too.
        { id: uuid(), projectId: ids.book, parentId: trashedFolder, kind: "scene", title: "The second ghost", position: "a0" },
      ]);
      await db.update(project).set({ settings: { labels: [{ id: "l1", name: "Cut?", color: "#f00" }], template: true } }).where(eq(project.id, ids.book));

      const copy = await buildPublicCopyFile(ids.book);
      const manifest = JSON.parse(strFromU8(unzipSync(copy.data)["plotra.json"]));
      expect(manifest.world).toBeNull();
      const created = await transaction(() => importPlotraFile("ws-ana", copy.data));
      expect(created.worldId).toBeNull();

      const [book] = await db.select().from(project).where(eq(project.id, created.projectId));
      expect(book).toMatchObject({ title: "Hamlet", worldId: null, createdById: "ana" });
      expect(book.settings.template).toBeUndefined();
      expect(book.settings.labels?.[0]?.name).toBe("Cut?");

      const nodes = await db.select().from(node).where(eq(node.projectId, book.id));
      expect(nodes.map((n) => n.title).sort()).toEqual(["Act 1", "Board", "Hamlet", "Sources", "The ramparts"]);
      expect(await db.$count(version, eq(version.projectId, book.id))).toBe(0);
      expect(await db.$count(commentThread, eq(commentThread.projectId, book.id))).toBe(0);
      expect(await db.$count(attachment, eq(attachment.projectId, book.id))).toBe(1);
      // The link into the world went with the world; the one inside the project stayed, pointing at the copy's Hamlet.
      const links = await db.select().from(link).where(eq(link.projectId, book.id));
      expect(links.map((l) => l.targetNodeId)).toEqual([nodes.find((n) => n.title === "Hamlet")!.id]);
    });
  });
}
