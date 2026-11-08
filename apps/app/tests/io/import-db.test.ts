import { describe, expect, mock, test } from "bun:test";

// Writing an import (lib/io/import.ts) on PGlite, in a process of its own like
// the .plotra round trip (tests/io/plotra-file.test.ts): a vault's front
// matter becomes typed properties, and the pictures its notes show are reported.

const RUN = process.env.PLOTRA_IMPORT_DB === "1";
if (RUN) {
  process.env.DATABASE_URL = "pglite:memory";
  delete process.env.DATABASE_DRIVER;
}

if (!RUN) {
  test("an import written to the database, in a process of its own on PGlite", () => {
    const run = Bun.spawnSync([process.execPath, "test", import.meta.path], {
      cwd: `${import.meta.dir}/../..`,
      env: { ...process.env, PLOTRA_IMPORT_DB: "1", DATABASE_URL: "pglite:memory" },
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = `${run.stdout.toString()}\n${run.stderr.toString()}`;
    if (run.exitCode !== 0) console.error(output);
    expect(run.exitCode).toBe(0);
    expect(output).toContain(" 0 fail");
  }, 120_000);
} else {
  const session = { user: { id: "ana", name: "Ana", email: "ana@example.com" }, session: { id: "s" } };
  const workspaces = [{ id: "org-ana", name: "Ana's", slug: "ws-ana", logo: null, role: "owner" }];
  mock.module("@/lib/data", () => ({
    getSession: async () => session,
    requireSession: async () => session,
    listWorkspaces: async () => workspaces,
    requireWorkspace: async () => workspaces[0],
    isApiRequest: () => false,
    runAsApiUser: <T,>(_session: unknown, fn: () => Promise<T>) => fn(),
  }));

  const { db, schema } = await import("@plotra/db");
  const { eq } = await import("drizzle-orm");
  const { createImported } = await import("@/lib/io/import");
  const { createNode } = await import("@/lib/binder-actions");
  const { getNodeLinks } = await import("@/lib/knowledge-actions");
  const { readOnly } = await import("@/lib/request-cache");
  const { valueToYdoc, ydocToValue } = await import("@/lib/collab/ydoc");
  const { planImport } = await import("@/lib/io/upload");
  const { transaction } = await import("@/lib/request-cache");

  const now = new Date();
  const { user, organization, member, project, node, propertyDef } = schema;
  await db.insert(user).values({ id: "ana", name: "Ana", email: "ana@example.com", createdAt: now, updatedAt: now });
  await db.insert(organization).values({ id: "org-ana", name: "Ana's", slug: "ws-ana", createdAt: now });
  await db.insert(member).values({ id: "m-ana", organizationId: "org-ana", userId: "ana", role: "owner", createdAt: now });
  await db.insert(project).values({ id: "p1", organizationId: "org-ana", slug: "verona", title: "Verona" });
  // The project already has an "age" property for notes, as a number.
  await db.insert(propertyDef).values({ projectId: "p1", nodeKind: "note", key: "age", label: "Age", type: "number", position: "a0" });

  const file = (path: string, text: string) => {
    const parts = path.split("/");
    return { name: parts.at(-1)!, folder: parts.slice(0, -1), bytes: new TextEncoder().encode(text) };
  };

  describe("importing a vault", () => {
    test("front matter becomes typed properties, links to notes, and the pictures shown are reported", async () => {
      const outline = await planImport(
        [
          file("Romeo.md", "---\nage: 16\nhome: \"[[Verona city]]\"\nalive: true\nfactions: [Montague]\n---\n![[romeo.png]]\n\nA Montague."),
          file("Juliet.md", "---\nage: 13\nhome: \"[[Verona city]]\"\nalive: false\nfactions:\n  - Capulet\n  - Nurse's\n---\nA Capulet."),
          file("Verona city.md", "A city."),
        ],
        { split: "file", breaks: false, kind: "note", lines: "keep" },
        ["Attachments/romeo.png"],
      );
      let pictures: Array<{ path: string; nodeIds: string[] }> = [];
      const created = await transaction(() => createImported("p1", null, outline, [], { onPictures: (found) => (pictures = found) }));
      const romeo = created.find((n) => n.title === "Romeo")!;
      const city = created.find((n) => n.title === "Verona city")!;
      expect(pictures).toEqual([{ path: "Attachments/romeo.png", nodeIds: [romeo.id] }]);

      const defs = await db.select().from(propertyDef).where(eq(propertyDef.projectId, "p1"));
      const byKey = Object.fromEntries(defs.map((d) => [d.key, d]));
      expect(Object.keys(byKey).sort()).toEqual(["age", "alive", "factions", "home"]);
      // The project's own type wins over what the import would have guessed.
      expect(byKey.age.type).toBe("number");
      expect(byKey.home).toMatchObject({ type: "node", label: "Home" });
      expect(byKey.alive.type).toBe("checkbox");
      expect(byKey.factions.type).toBe("multi_select");
      expect(byKey.factions.options.choices?.toSorted()).toEqual(["Capulet", "Montague", "Nurse's"]);

      const [row] = await db.select({ properties: node.properties }).from(node).where(eq(node.id, romeo.id));
      expect(row.properties).toEqual({ age: 16, home: city.id, alive: true, factions: ["Montague"] });
    });
  });

  describe("a note template", () => {
    test("a new note of its kind starts as a copy: its text without block ids, its fields and tags", async () => {
      const template = crypto.randomUUID();
      await db.insert(node).values({
        id: template,
        projectId: "p1",
        kind: "scene",
        title: "Scene template",
        position: "z0",
        tags: ["draft"],
        properties: { pov: "Romeo" },
        ydoc: valueToYdoc([
          { type: "h2", id: "blk1", children: [{ text: "Goal" }] },
          { type: "p", id: "blk2", children: [{ text: "What does the POV character want?" }] },
        ]),
      });
      await db.update(project).set({ settings: { noteTemplates: { scene: template } } }).where(eq(project.id, "p1"));

      const made = await transaction(() => createNode("p1", { parentId: null, kind: "scene", title: "The balcony", position: "z1" }));
      const [row] = await db.select().from(node).where(eq(node.id, made.id));
      const value = ydocToValue(row.ydoc!);
      expect(value.map((n) => (n.children as Array<{ text: string }>)[0].text)).toEqual(["Goal", "What does the POV character want?"]);
      expect(value.some((n) => "id" in n)).toBe(false);
      expect(row).toMatchObject({ title: "The balcony", properties: { pov: "Romeo" }, tags: ["draft"], wordCount: 7 });
      expect(row.settings).toMatchObject({ fromTemplate: true });

      // Other kinds start as they always did.
      const note = await transaction(() => createNode("p1", { parentId: null, kind: "note", title: "A note", position: "z2" }));
      const [plain] = await db.select().from(node).where(eq(node.id, note.id));
      expect(plain.ydoc).toBeNull();
    });
  });

  describe("a shared world", () => {
    test("an entry lists the notes that link to it from the projects using the world", async () => {
      const entry = crypto.randomUUID();
      const scene = crypto.randomUUID();
      await db.insert(project).values([
        { id: "w1", organizationId: "org-ana", slug: "denmark", title: "Denmark", type: "franchise" },
        { id: "b1", organizationId: "org-ana", slug: "hamlet", title: "Hamlet", worldId: "w1" },
      ]);
      await db.insert(node).values([
        { id: entry, projectId: "w1", kind: "location", title: "Elsinore", position: "a0" },
        { id: scene, projectId: "b1", kind: "scene", title: "The ramparts", position: "a0" },
      ]);
      await db.insert(schema.link).values({ projectId: "b1", sourceNodeId: scene, targetNodeId: entry, kind: "wiki", context: "On the walls of Elsinore", ordinal: 0 });

      const links = await readOnly(() => getNodeLinks("w1", entry));
      expect(links.backlinks).toEqual([]);
      expect(links.fromSharers).toEqual([
        expect.objectContaining({ sourceNodeId: scene, sourceTitle: "The ramparts", projectId: "b1", projectTitle: "Hamlet", href: `/w/ws-ana/p/hamlet?open=${scene}` }),
      ]);
      // A project that doesn't use this world isn't counted, whatever it links to.
      await db.update(project).set({ worldId: null }).where(eq(project.id, "b1"));
      expect((await readOnly(() => getNodeLinks("w1", entry))).fromSharers).toEqual([]);
    });
  });
}
