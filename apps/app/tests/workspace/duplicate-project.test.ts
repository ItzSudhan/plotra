import { describe, expect, mock, test } from "bun:test";

// "Duplicate" on a project card (lib/duplicate-actions.ts) and the projects
// page's search box. The title and the filter need no database; the duplicate
// itself runs on PGlite in a process of its own, like the other database tests
// (tests/io/plotra-file.test.ts).

const RUN = process.env.PLOTRA_DUPLICATE === "1";
if (RUN) {
  process.env.DATABASE_URL = "pglite:memory";
  delete process.env.DATABASE_DRIVER;
  for (const key of ["S3_ENDPOINT", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_BUCKET"]) delete process.env[key];
}

if (!RUN) {
  const { duplicateTitle } = await import("@/lib/duplicate");
  const { filterProjects } = await import("@/app/w/[workspace]/(home)/(projects)/project-filter");

  describe("a duplicate's title", () => {
    test("says it's a copy", () => {
      expect(duplicateTitle("Hamlet")).toBe("Hamlet (copy)");
      expect(duplicateTitle("  ")).toBe("Untitled (copy)");
    });
    test("a long title is cut, never the “(copy)”, and stays within 120 characters", () => {
      const title = duplicateTitle("x".repeat(120));
      expect(title.length).toBe(120);
      expect(title.endsWith(" (copy)")).toBe(true);
    });
  });

  describe("searching projects", () => {
    const projects = [{ title: "Les Misérables" }, { title: "Hamlet" }, { title: "ÉCRIT sur l'eau" }];
    test("ignores case and accents", () => {
      expect(filterProjects(projects, "miserables").map((p) => p.title)).toEqual(["Les Misérables"]);
      expect(filterProjects(projects, "ecrit").map((p) => p.title)).toEqual(["ÉCRIT sur l'eau"]);
      expect(filterProjects(projects, "HAM").map((p) => p.title)).toEqual(["Hamlet"]);
    });
    test("blank shows everything; no match shows nothing", () => {
      expect(filterProjects(projects, "  ")).toBe(projects);
      expect(filterProjects(projects, "zzz")).toEqual([]);
    });
  });

  test("the duplicate, in a process of its own on PGlite", () => {
    const run = Bun.spawnSync([process.execPath, "test", import.meta.path], {
      cwd: `${import.meta.dir}/../..`,
      env: { ...process.env, PLOTRA_DUPLICATE: "1", DATABASE_URL: "pglite:memory" },
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = `${run.stdout.toString()}\n${run.stderr.toString()}`;
    if (run.exitCode !== 0) console.error(output);
    expect(run.exitCode).toBe(0);
    expect(output).toContain(" 0 fail");
  }, 180_000);
} else {
  const session = { user: { id: "ana", name: "Ana", email: "ana@example.com", image: null }, session: { id: "s" } };
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
  const { eq } = await import("drizzle-orm");
  const { duplicateProject } = await import("@/lib/duplicate-actions");
  const { valueToYdoc, ydocToValue } = await import("@/lib/collab/ydoc");

  const uuid = () => crypto.randomUUID();
  const now = new Date();
  const ids = { world: uuid(), book: uuid(), other: uuid(), elsinore: uuid(), scene: uuid(), hamlet: uuid(), trashed: uuid() };
  const { user, organization, member, project, node, propertyDef } = schema;
  await db.insert(user).values({ id: "ana", name: "Ana", email: "ana@example.com", createdAt: now, updatedAt: now });
  await db.insert(organization).values([
    { id: "org-ana", name: "Ana's", slug: "ws-ana", createdAt: now },
    { id: "org-ben", name: "Ben's", slug: "ws-ben", createdAt: now },
  ]);
  await db.insert(member).values({ id: "m-ana", organizationId: "org-ana", userId: "ana", role: "owner", createdAt: now });
  await db.insert(project).values([
    { id: ids.world, organizationId: "org-ana", slug: "denmark", title: "Denmark", type: "franchise" },
    { id: ids.book, organizationId: "org-ana", slug: "hamlet", title: "Hamlet", type: "stage_play", worldId: ids.world, settings: { labels: [{ id: "l1", name: "Cut?", color: "#f00" }], template: true } },
    { id: ids.other, organizationId: "org-ben", slug: "secret", title: "Secret", type: "novel" },
  ]);
  await db.insert(propertyDef).values({ projectId: ids.book, nodeKind: "character", key: "age", label: "Age", type: "number", position: "a0" });
  await db.insert(node).values([
    { id: ids.elsinore, projectId: ids.world, kind: "location", title: "Elsinore", position: "a0" },
    {
      id: ids.scene,
      projectId: ids.book,
      kind: "scene",
      title: "The ramparts",
      position: "a0",
      ydoc: valueToYdoc([{ type: "p", id: "b1", children: [{ text: "Ask " }, { type: "wikilink", nodeId: ids.hamlet, children: [{ text: "" }] }, { text: " at " }, { type: "wikilink", nodeId: ids.elsinore, children: [{ text: "" }] }] }]),
    },
    { id: ids.hamlet, projectId: ids.book, kind: "character", title: "Hamlet", position: "a1", properties: { age: 30 } },
    { id: ids.trashed, projectId: ids.book, kind: "scene", title: "Cut", position: "a2", deletedAt: now },
  ]);

  describe("duplicating a project", () => {
    test("makes ‘<title> (copy)’ in the same workspace with the notes, documents, properties and settings, sharing the world", async () => {
      const { href, title } = await duplicateProject("ws-ana", ids.book);
      expect(title).toBe("Hamlet (copy)");
      expect(href).toBe("/w/ws-ana/p/hamlet-copy");

      const [copy] = await db.select().from(project).where(eq(project.slug, "hamlet-copy"));
      expect(copy).toMatchObject({ title: "Hamlet (copy)", organizationId: "org-ana", worldId: ids.world, type: "stage_play", createdById: "ana" });
      expect(copy.id).not.toBe(ids.book);
      expect(copy.settings.labels?.[0]?.name).toBe("Cut?");
      expect(copy.settings.template).toBeUndefined();

      const notes = await db.select().from(node).where(eq(node.projectId, copy.id));
      expect(notes.map((n) => n.title).sort()).toEqual(["Hamlet", "The ramparts"]);
      const hamlet = notes.find((n) => n.title === "Hamlet")!;
      expect(hamlet.properties).toEqual({ age: 30 });
      expect(await db.$count(propertyDef, eq(propertyDef.projectId, copy.id))).toBe(1);

      // The document came along, its link pointing at the copy's Hamlet and its world link still at the shared world.
      const scene = notes.find((n) => n.title === "The ramparts")!;
      const text = JSON.stringify(ydocToValue(scene.ydoc!));
      expect(text).toContain(hamlet.id);
      expect(text).not.toContain(ids.hamlet);
      expect(text).toContain(ids.elsinore);

      // The original is untouched.
      const [original] = await db.select().from(project).where(eq(project.id, ids.book));
      expect(original.title).toBe("Hamlet");
    });

    test("a second duplicate gets an address of its own", async () => {
      const { href } = await duplicateProject("ws-ana", ids.book);
      expect(href).toBe("/w/ws-ana/p/hamlet-copy-2");
    });

    test("not a project from another workspace", async () => {
      await expect(duplicateProject("ws-ana", ids.other)).rejects.toThrow();
      await expect(duplicateProject("ws-ben", ids.book)).rejects.toThrow();
    });
  });
}
