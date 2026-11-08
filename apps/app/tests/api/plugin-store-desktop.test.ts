import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

// The desktop app's plugin store (local mode): plotra.ink's store read over
// its public API (lib/plugin-store-remote.ts), and what the desktop's plugin
// actions do with it (lib/plugin-store-actions.ts, lib/plugin-actions.ts).
// plotra.ink is a fake kept in memory behind `globalThis.fetch`. The parsing
// runs here; the actions run on PGlite in local mode, in a process of their own
// (`isLocalMode` is read when its module loads).

const RUN = process.env.PLOTRA_PLUGINS_DESKTOP === "1";
if (RUN) {
  process.env.DATABASE_URL = "pglite:memory";
  process.env.NEXT_PUBLIC_PLOTRA_LOCAL = "1";
  process.env.PLOTRA_STORE_URL = "https://store.test/";
  delete process.env.DATABASE_DRIVER;
}

type FakeRelease = { id: string; version: string; access: "read" | "write"; code: string; notes?: string };
type FakePlugin = { slug: string; name: string; summary: string; category: string; author: string; withdrawn: boolean; blocked: boolean; releases: FakeRelease[] };

/** plotra.ink, in memory: its plugins (releases newest first), and how the network is. */
function fakeStore() {
  const plugins = new Map<string, FakePlugin>();
  const state = { network: "online" as "online" | "offline" | "500", requests: [] as string[] };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const fetch = async (input: string | URL | Request) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    state.requests.push(`${url.pathname}${url.search}`);
    if (state.network === "offline") throw new TypeError("fetch failed");
    if (state.network === "500") return json({ error: "unavailable" }, 503);
    if (url.pathname === "/api/store/plugins") {
      const list = [...plugins.values()].filter((p) => !p.blocked && !p.withdrawn && p.releases.length);
      return json({
        plugins: list.map((p) => ({ slug: p.slug, name: p.name, summary: p.summary, category: p.category, access: p.releases[0].access, author: p.author, version: p.releases[0].version, installs: 1, updatedAt: new Date().toISOString() })),
      });
    }
    const one = /^\/api\/store\/plugins\/([^/]+)$/.exec(url.pathname);
    if (one) {
      const p = plugins.get(one[1]);
      if (!p || p.blocked) return json({ error: "not found" }, 404);
      return json({
        slug: p.slug,
        name: p.name,
        summary: p.summary,
        about: "",
        category: p.category,
        access: p.releases[0]?.access ?? "write",
        author: p.author,
        installs: 1,
        withdrawn: p.withdrawn,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        releases: p.releases.map((r) => ({ id: r.id, version: r.version, notes: r.notes ?? "", access: r.access, size: r.code.length, createdAt: new Date().toISOString() })),
        code: p.releases[0]?.code ?? "",
      });
    }
    if (url.pathname === "/api/store/status") {
      const out: Record<string, unknown> = {};
      for (const slug of (url.searchParams.get("slugs") ?? "").split(",").filter(Boolean)) {
        const p = plugins.get(slug);
        if (!p) out[slug] = { status: "missing", latest: null };
        else if (p.blocked) out[slug] = { status: "blocked", latest: null };
        else {
          const r = p.releases[0];
          out[slug] = { status: p.withdrawn ? "withdrawn" : "available", latest: r ? { id: r.id, version: r.version, access: r.access } : null };
        }
      }
      return json({ plugins: out });
    }
    return json({ error: "not found" }, 404);
  };
  return { plugins, state, fetch };
}

const realFetch = globalThis.fetch;
const fake = fakeStore();
globalThis.fetch = fake.fetch as unknown as typeof fetch;
afterAll(() => {
  globalThis.fetch = realFetch;
});

const header = (name: string, version: string, access?: "read") => `// ==Plotra plugin==
// @name ${name}
// @version ${version}
${access ? `// @access ${access}\n` : ""}// ==/Plotra plugin==
plotra.registerCommand({ id: "go", title: "${name} ${version}", run() {} });`;

if (!RUN) {
  const remote = await import("@/lib/plugin-store-remote");
  const { parseEntry, parseListing, parseStatus } = remote;

  beforeEach(() => {
    fake.plugins.clear();
    fake.state.network = "online";
    fake.state.requests.length = 0;
  });

  describe("what plotra.ink says is checked field by field", () => {
    test("an entry with an address that isn't one is dropped", () => {
      for (const slug of ["ab", "a/b", "-abc", "a--b", "../x", 42, null, undefined, "x".repeat(51)]) expect(parseEntry({ slug, name: "X" })).toBeNull();
      expect(parseEntry(null)).toBeNull();
      expect(parseEntry("tally")).toBeNull();
      expect(parseEntry([{ slug: "tally" }])).toBeNull();
    });

    test("access other than \"read\" is \"write\"; a category it doesn't know is \"other\"; the rest is typed and cut to length", () => {
      const entry = parseEntry({ slug: " Tally ", name: "", summary: 7, category: "malware", access: "READ", author: { evil: true }, version: 2, installs: -5, updatedAt: "not a date" });
      expect(entry).toEqual({ slug: "tally", name: "tally", summary: "", category: "other", access: "write", author: "", version: null, installs: 0, updatedAt: new Date(0) });
      expect(parseEntry({ slug: "tally", access: "read", category: "stats", installs: 3.7 })).toMatchObject({ access: "read", category: "stats", installs: 3 });
      expect(parseEntry({ slug: "tally", access: "none" })?.access).toBe("write");
      expect(parseEntry({ slug: "tally", name: "n".repeat(500) })?.name).toHaveLength(80);
    });

    test("a page keeps only releases with an id and a version, and code only as text", () => {
      const listing = parseListing({
        slug: "tally",
        withdrawn: "true",
        releases: [{ id: "r2", version: "2", access: "read" }, { id: "", version: "1" }, { id: "r0" }, "junk", null, { id: "r1", version: "1", access: "admin" }],
        code: { toString: () => "evil()" },
      });
      expect(listing?.releases.map((r) => [r.id, r.version, r.access])).toEqual([
        ["r2", "2", "read"],
        ["r1", "1", "write"],
      ]);
      expect(listing?.withdrawn).toBe(false);
      expect(listing?.code).toBe("");
      expect(parseListing({ slug: "a" })).toBeNull();
      expect(parseListing({ slug: "tally", releases: "nope" })?.releases).toEqual([]);
    });

    test("a status: a blocked plugin has no latest release; anything unknown is \"missing\"", () => {
      expect(parseStatus({ status: "blocked", latest: { id: "r1", version: "1", access: "read" } })).toEqual({ status: "blocked", latest: null });
      expect(parseStatus({ status: "available", latest: { id: "r1", version: "1", access: "read" } })).toEqual({ status: "available", latest: { id: "r1", version: "1", access: "read" } });
      expect(parseStatus({ status: "withdrawn", latest: { id: "r1", version: "1", access: "everything" } })).toEqual({ status: "withdrawn", latest: { id: "r1", version: "1", access: "write" } });
      expect(parseStatus({ status: "available", latest: { id: "r1" } })).toEqual({ status: "available", latest: null });
      expect(parseStatus({ status: "deleted" })).toEqual({ status: "missing", latest: null });
      expect(parseStatus(null)).toEqual({ status: "missing", latest: null });
      expect(parseStatus("available")).toEqual({ status: "missing", latest: null });
    });
  });

  describe("asking plotra.ink", () => {
    test("the store's address can be pointed elsewhere, without a trailing slash", () => {
      const before = process.env.PLOTRA_STORE_URL;
      process.env.PLOTRA_STORE_URL = "https://store.test//";
      expect(remote.storeUrl()).toBe("https://store.test");
      delete process.env.PLOTRA_STORE_URL;
      expect(remote.storeUrl()).toBe("https://app.plotra.ink");
      if (before !== undefined) process.env.PLOTRA_STORE_URL = before;
    });

    test("a junk body is an empty store, an unknown plugin or no status", async () => {
      const junk = async () => new Response("<html>not json</html>", { status: 200 });
      globalThis.fetch = junk as unknown as typeof fetch;
      try {
        expect(await remote.remoteListStore({})).toEqual([]);
        expect(await remote.remoteListing("tally")).toBeNull();
        remote.clearStatusCache();
        expect([...(await remote.remoteStatus(["tally"]))]).toEqual([]);
        globalThis.fetch = (async () => Response.json({ plugins: { tally: "nonsense", other: { status: "available" } } })) as unknown as typeof fetch;
        expect(await remote.remoteListStore({})).toEqual([]);
        expect((await remote.remoteStatus(["tally"], { fresh: true })).get("tally")).toEqual({ status: "missing", latest: null });
        globalThis.fetch = (async () => Response.json({ plugins: [{ slug: "ok-one" }, { slug: "no" }, "junk"] })) as unknown as typeof fetch;
        expect((await remote.remoteListStore({})).map((e) => e.slug)).toEqual(["ok-one"]);
      } finally {
        globalThis.fetch = fake.fetch as unknown as typeof fetch;
      }
    });

    test("the front page passes on what was asked, and a bad address isn't even asked about", async () => {
      fake.plugins.set("tally", { slug: "tally", name: "Tally", summary: "Counts", category: "stats", author: "Ana", withdrawn: false, blocked: false, releases: [{ id: "r1", version: "1", access: "read", code: header("Tally", "1") }] });
      expect(await remote.remoteListStore({ query: "count", category: "stats", sort: "new" })).toEqual([expect.objectContaining({ slug: "tally", access: "read", version: "1" })]);
      expect(fake.state.requests.at(-1)).toBe("/api/store/plugins?q=count&category=stats&sort=new");
      fake.state.requests.length = 0;
      expect(await remote.remoteListing("../admin")).toBeNull();
      expect(fake.state.requests).toEqual([]);
    });

    test("offline, a 500 or a 429 is StoreUnreachable; a 404 is no such plugin", async () => {
      expect(await remote.remoteListing("nope-nope")).toBeNull();
      fake.state.network = "offline";
      await expect(remote.remoteListing("tally")).rejects.toBeInstanceOf(remote.StoreUnreachable);
      await expect(remote.remoteListStore({})).rejects.toThrow("Couldn't reach the plugin store");
      await expect(remote.remoteListing("tally")).rejects.not.toBeInstanceOf(remote.StoreBusy);
      fake.state.network = "500";
      await expect(remote.remoteListing("tally")).rejects.toBeInstanceOf(remote.StoreUnreachable);
      // A store that answers but is struggling isn't "you're offline".
      await expect(remote.remoteListing("tally")).rejects.toBeInstanceOf(remote.StoreBusy);
      globalThis.fetch = (async () => new Response("", { status: 429 })) as unknown as typeof fetch;
      try {
        await expect(remote.remoteListing("tally")).rejects.toBeInstanceOf(remote.StoreUnreachable);
        await expect(remote.remoteListing("tally")).rejects.toThrow("busy");
      } finally {
        globalThis.fetch = fake.fetch as unknown as typeof fetch;
      }
    });

    // StoreUnreachable is a UserError, so the desktop app (a production build)
    // says what happened rather than "Something went wrong."
    test("offline, its message reaches the person in a production build", async () => {
      const { publicMessage } = await import("@/lib/errors");
      expect(publicMessage(new remote.StoreUnreachable())).toContain("Couldn't reach the plugin store");
    });
  });

  test("the desktop actions, on PGlite in local mode in a process of their own", () => {
    const run = Bun.spawnSync([process.execPath, "test", import.meta.path], {
      cwd: `${import.meta.dir}/../..`,
      env: { ...process.env, PLOTRA_PLUGINS_DESKTOP: "1", NEXT_PUBLIC_PLOTRA_LOCAL: "1", DATABASE_URL: "pglite:memory" },
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = `${run.stdout.toString()}\n${run.stderr.toString()}`;
    if (run.exitCode !== 0) console.error(output);
    expect(run.exitCode).toBe(0);
    expect(output).toContain(" 0 fail");
  }, 120_000);
} else {
  const ana = { user: { id: "ana", name: "Ana", email: "ana@example.com" }, session: { id: "s-ana" } };
  const workspaces = [{ id: "org-ana", name: "Ana's", slug: "ws-ana", logo: null, role: "owner" }];
  mock.module("@/lib/data", () => ({
    getSession: async () => ana,
    requireSession: async () => ana,
    listWorkspaces: async () => workspaces,
    requireWorkspace: async () => workspaces[0],
    isApiRequest: () => false,
    runAsApiUser: <T,>(_session: unknown, fn: () => Promise<T>) => fn(),
  }));

  const { db, schema } = await import("@plotra/db");
  const { eq } = await import("drizzle-orm");
  const { isLocalMode } = await import("@/lib/local-mode");
  const actions = await import("@/lib/plugin-actions");
  const store = await import("@/lib/plugin-store-actions");
  const { clearStatusCache } = await import("@/lib/plugin-store-remote");

  const now = new Date();
  await db.insert(schema.user).values({ id: "ana", name: "Ana", email: "ana@example.com", createdAt: now, updatedAt: now });
  await db.insert(schema.organization).values({ id: "org-ana", name: "Ana's", slug: "ws-ana", createdAt: now });
  await db.insert(schema.member).values({ id: "m-ana", organizationId: "org-ana", userId: "ana", role: "owner", createdAt: now });
  await db.insert(schema.project).values({ id: "p1", organizationId: "org-ana", slug: "verona", title: "Verona" });

  const publish = (slug: string, name: string, release: FakeRelease, extra: Partial<FakePlugin> = {}) =>
    fake.plugins.set(slug, { slug, name, summary: `${name}, from plotra.ink`, category: "stats", author: "Ben", withdrawn: false, blocked: false, releases: [release], ...extra });
  const row = async (id: string) => (await db.select().from(schema.userPlugin).where(eq(schema.userPlugin.id, id)))[0];
  const listed = async (id: string) => (await actions.listPlugins()).find((p) => p.id === id);
  const loaded = async () => (await actions.loadPlugins()).map((p) => p.id);

  beforeEach(() => {
    fake.state.network = "online";
    clearStatusCache();
  });

  test("this process is the desktop app", () => {
    expect(isLocalMode).toBe(true);
  });

  describe("installing from plotra.ink", () => {
    let tally = "";

    test("copies the latest release, with its slug and release there and the release's access", async () => {
      publish("tally", "Tally", { id: "r1", version: "1", access: "read", code: header("Tally", "1", "read") });
      // An older release, listed after the newest.
      fake.plugins.get("tally")!.releases.push({ id: "r0", version: "0.9", access: "write", code: header("Tally", "0.9") });
      const made = await store.installPlugin("tally");
      tally = made.id;
      expect(made.name).toBe("Tally");
      expect(await row(tally)).toMatchObject({
        userId: "ana",
        name: "Tally",
        description: "Tally, from plotra.ink",
        version: "1",
        access: "read",
        code: header("Tally", "1", "read"),
        remoteSlug: "tally",
        remoteReleaseId: "r1",
        listingId: null,
        releaseId: null,
        enabled: true,
      });
      expect(await listed(tally)).toMatchObject({ access: "read", store: { slug: "tally", own: false, update: false, blocked: false, withdrawn: false, latest: { id: "r1", version: "1" } } });
      expect(await loaded()).toContain(tally);
    });

    test("a read-only release can't change the project", async () => {
      expect((await actions.pluginCall("p1", tally, "notes.list", [])).ok).toBe(true);
      for (const method of ["notes.create", "notes.update", "notes.write", "kinds.add"]) {
        expect(await actions.pluginCall("p1", tally, method, [{ title: "Tybalt" }])).toMatchObject({ ok: false, error: expect.stringContaining("only allowed to read your notes") });
      }
    });

    test("installing it twice is refused", async () => {
      await expect(store.installPlugin("tally")).rejects.toThrow("You have this plugin already");
      await expect(store.installPlugin(" TALLY ")).rejects.toThrow("You have this plugin already");
    });

    test("a withdrawn plugin, a 404 and an address that isn't one are refused", async () => {
      publish("gone", "Gone", { id: "g1", version: "1", access: "write", code: header("Gone", "1") }, { withdrawn: true });
      await expect(store.installPlugin("gone")).rejects.toThrow("Its author took this plugin out of the store.");
      await expect(store.installPlugin("nobody-has-this")).rejects.toThrow("There's no such plugin in the store.");
      publish("banned", "Banned", { id: "b1", version: "1", access: "write", code: header("Banned", "1") }, { blocked: true });
      await expect(store.installPlugin("banned")).rejects.toThrow("There's no such plugin in the store.");
      await expect(store.installPlugin("../etc")).rejects.toThrow("There's no such plugin in the store.");
      publish("empty", "Empty", { id: "e1", version: "1", access: "write", code: "x" });
      fake.plugins.get("empty")!.releases = [];
      await expect(store.installPlugin("empty")).rejects.toThrow("no version to install");
      const names = (await actions.listPlugins()).map((p) => p.name);
      expect(names).toEqual(["Tally"]);
    });

    test("offline, or with plotra.ink down, it says the store can't be reached and installs nothing", async () => {
      publish("words", "Words", { id: "w1", version: "1", access: "write", code: header("Words", "1") });
      fake.state.network = "offline";
      await expect(store.installPlugin("words")).rejects.toThrow("Couldn't reach the plugin store");
      fake.state.network = "500";
      await expect(store.installPlugin("words")).rejects.toThrow("having trouble");
      fake.state.network = "online";
      expect((await actions.listPlugins()).map((p) => p.name)).toEqual(["Tally"]);
    });
  });

  describe("updates", () => {
    test("a new release on plotra.ink shows as an update, which brings its code, version and access across", async () => {
      const [tally] = await actions.listPlugins();
      expect(tally.store).toMatchObject({ update: false });
      fake.plugins.get("tally")!.releases.unshift({ id: "r2", version: "2", access: "write", code: header("Tally", "2") });
      const before = await listed(tally.id);
      expect(before?.store).toMatchObject({ update: true, latest: { id: "r2", version: "2", access: "write" } });
      expect(before?.access).toBe("read");

      expect(await store.updateInstalledPlugin(tally.id)).toEqual({ version: "2" });
      expect(await row(tally.id)).toMatchObject({ version: "2", access: "write", code: header("Tally", "2"), remoteReleaseId: "r2", remoteSlug: "tally" });
      expect((await listed(tally.id))?.store).toMatchObject({ update: false });
      // Up to date already: nothing changes.
      expect(await store.updateInstalledPlugin(tally.id)).toEqual({ version: "2" });
    });

    test("a plugin of the person's own has no updates; offline, an update can't be fetched", async () => {
      const own = await actions.addPlugin({ code: header("Mine", "1"), fileName: "mine.js" });
      await expect(store.updateInstalledPlugin(own.id)).rejects.toThrow("isn't from the store");
      await expect(store.updateInstalledPlugin("no-such-id")).rejects.toThrow("That plugin is gone.");
      await actions.removePlugin(own.id);

      const [tally] = await actions.listPlugins();
      fake.plugins.get("tally")!.releases.unshift({ id: "r3", version: "3", access: "write", code: header("Tally", "3") });
      fake.state.network = "offline";
      await expect(store.updateInstalledPlugin(tally.id)).rejects.toThrow("Couldn't reach the plugin store");
      expect((await row(tally.id)).version).toBe("2");
      fake.state.network = "online";
      expect(await store.updateInstalledPlugin(tally.id)).toEqual({ version: "3" });
    });
  });

  describe("takedowns", () => {
    test("a plugin plotra.ink blocked stops running once the store is asked", async () => {
      const [tally] = await actions.listPlugins();
      expect(await loaded()).toContain(tally.id);
      fake.plugins.get("tally")!.blocked = true;
      // Asked a minute ago, the answer then still stands.
      expect(await loaded()).toContain(tally.id);
      clearStatusCache();
      expect(await loaded()).not.toContain(tally.id);
      expect((await listed(tally.id))?.store).toMatchObject({ blocked: true, latest: null, update: false });
      await expect(store.updateInstalledPlugin(tally.id)).rejects.toThrow("isn't in the store any more");
    });

    test("offline, a plugin runs as it is, unless an answer from before says it was blocked", async () => {
      // Nothing known (cache cleared) and the store can't be asked: it runs.
      fake.state.network = "offline";
      const [tally] = await actions.listPlugins();
      expect(await loaded()).toContain(tally.id);
      expect((await listed(tally.id))?.store).toMatchObject({ blocked: false, latest: null, update: false });

      // Asked while online (blocked), then offline: the answer from before stands, even when asked fresh.
      fake.state.network = "online";
      expect((await listed(tally.id))?.store).toMatchObject({ blocked: true });
      fake.state.network = "offline";
      expect((await listed(tally.id))?.store).toMatchObject({ blocked: true });
      expect(await loaded()).not.toContain(tally.id);
      fake.state.network = "500";
      expect(await loaded()).not.toContain(tally.id);
    });

    test("withdrawn by its author, it keeps running and shows as withdrawn", async () => {
      const t = fake.plugins.get("tally")!;
      t.blocked = false;
      t.withdrawn = true;
      const [tally] = await actions.listPlugins();
      expect(tally.store).toMatchObject({ withdrawn: true, blocked: false });
      expect(await loaded()).toContain(tally.id);
      t.withdrawn = false;
    });
  });

  describe("the person's own copy", () => {
    test("editing an installed plugin's code unlinks it from plotra.ink", async () => {
      const [tally] = await actions.listPlugins();
      const edited = await actions.updatePluginCode(tally.id, header("Tally", "3-mine"));
      expect(edited.store).toBeNull();
      expect((await listed(tally.id))?.store).toBeNull();
      expect(await row(tally.id)).toMatchObject({ remoteSlug: null, remoteReleaseId: null, version: "3-mine" });
      // Blocked on plotra.ink now or not, the person's own copy runs.
      fake.plugins.get("tally")!.blocked = true;
      expect(await loaded()).toContain(tally.id);
      await expect(store.updateInstalledPlugin(tally.id)).rejects.toThrow("isn't from the store");
      // And it can be installed again, alongside.
      fake.plugins.get("tally")!.blocked = false;
      const again = await store.installPlugin("tally");
      expect((await row(again.id)).remoteSlug).toBe("tally");
    });
  });

  describe("publishing is for Plotra Cloud", () => {
    test("each publishing action refuses in the desktop app, naming Plotra Cloud", async () => {
      const own = await actions.addPlugin({ code: header("Mine", "1"), fileName: "mine.js" });
      await expect(store.publishPlugin({ pluginId: own.id, slug: "mine", summary: "Mine" })).rejects.toThrow("Plotra Cloud");
      await expect(store.publishVersion({ pluginId: own.id })).rejects.toThrow("Plotra Cloud");
      await expect(store.editListing({ slug: "mine", summary: "Mine" })).rejects.toThrow("Plotra Cloud");
      await expect(store.setListingWithdrawn("mine", true)).rejects.toThrow("Plotra Cloud");
      expect(await db.select().from(schema.pluginListing)).toEqual([]);
    });
  });
}
