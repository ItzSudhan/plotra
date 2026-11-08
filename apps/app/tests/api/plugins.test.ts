import { describe, expect, mock, test } from "bun:test";

// Plugins (lib/plugins.ts): what a plugin says about itself, the frames it
// runs in (lib/plugin-sandbox.ts), the bootstrap's message API run against a
// stand-in for the frame, and the actions on PGlite in a process of their own.

const RUN = process.env.PLOTRA_PLUGINS_DB === "1";
if (RUN) {
  process.env.DATABASE_URL = "pglite:memory";
  delete process.env.DATABASE_DRIVER;
}

if (!RUN) {
  const { cleanDownloadName, cleanDownloadType, cleanPartId, cleanPluginCode, isBrowserMethod, isServerMethod, MAX_PLUGIN_CODE, pluginName, readPluginHeader } = await import("@/lib/plugins");
  const { bootScript, inlineScript, pluginDocument, policy, RELAY } = await import("@/lib/plugin-sandbox");

  const header = `// ==Plotra plugin==
// @name        Word frequency
// @description The words you use most
// @version     1.2
// ==/Plotra plugin==
plotra.registerCommand({ id: "x", title: "X", run() {} });`;

  describe("what a plugin says about itself", () => {
    test("its header gives its name, description and version", () => {
      expect(readPluginHeader(header)).toEqual({ name: "Word frequency", description: "The words you use most", version: "1.2", access: "write" });
      expect(readPluginHeader("console.log(1)")).toEqual({ name: "", description: "", version: "", access: "write" });
    });

    test("@access read makes it a plugin that only reads; anything else, or nothing, reads and writes", () => {
      expect(readPluginHeader(header.replace("// ==/Plotra", "// @access read\n// ==/Plotra")).access).toBe("read");
      expect(readPluginHeader(header.replace("// ==/Plotra", "// @access Read-only\n// ==/Plotra")).access).toBe("read");
      expect(readPluginHeader(header.replace("// ==/Plotra", "// @access everything\n// ==/Plotra")).access).toBe("write");
    });

    test("its name: the header's, else the one given, else the file's", () => {
      expect(pluginName(header, "Given", "file.js")).toBe("Word frequency");
      expect(pluginName("x()", "Given", "file.js")).toBe("Given");
      expect(pluginName("x()", null, "counts.mjs")).toBe("counts");
      expect(pluginName("x()")).toBe("Untitled plugin");
    });

    test("code is kept with the parser's line endings, and refused when empty, binary or too big", () => {
      expect(cleanPluginCode("a()\r\nb()\rc()")).toBe("a()\nb()\nc()");
      expect(() => cleanPluginCode("  ")).toThrow("Add the plugin's code");
      expect(() => cleanPluginCode("a\0b")).toThrow("characters a script can't hold");
      expect(() => cleanPluginCode("x".repeat(MAX_PLUGIN_CODE + 1))).toThrow("more code than a plugin may be");
    });

    test("ids, file names and file kinds a plugin hands over are made safe", () => {
      expect(cleanPartId(" Count-Words ")).toBe("count-words");
      expect(cleanPartId("has space")).toBeNull();
      expect(cleanPartId("a:b")).toBeNull();
      expect(cleanDownloadName("../../etc/passwd")).toBe("-..-etc-passwd");
      expect(cleanDownloadName("")).toBe("plugin-export.txt");
      expect(cleanDownloadType("text/csv")).toBe("text/csv");
      expect(cleanDownloadType("application/json")).toBe("application/json");
      expect(cleanDownloadType("text/html")).toBe("text/html");
      expect(cleanDownloadType("application/x-msdownload\n")).toBe("application/x-msdownload");
      expect(cleanDownloadType("image/svg+xml")).toBe("text/plain;charset=utf-8");
    });
  });

  const sha256 = async (text: string) => Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))).toString("base64");
  const decode = (attribute: string) => attribute.replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  const scripts = (html: string) => [...html.matchAll(/<script(?: type="module")?>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const context = { pluginId: "p1", mode: "background" as const, panel: null, project: { id: "proj", title: "The </script> <!-- night", type: "novel" }, user: { name: "Ana" } };
  const theme = { dark: false, variables: { background: "oklch(1 0 0)", "bad name": "x", foreground: "red;}</style><script>alert(1)" } };

  describe("the plugin store's rules", async () => {
    const { asksForMore, categoryLabel, cleanSlug, cleanText, isPluginCategory, slugFromName } = await import("@/lib/plugin-store");

    test("an address is 3 to 50 lowercase letters, digits and single dashes", () => {
      expect(cleanSlug(" Word-Count ")).toBe("word-count");
      expect(cleanSlug("ab")).toBeNull();
      expect(cleanSlug("-abc")).toBeNull();
      expect(cleanSlug("abc-")).toBeNull();
      expect(cleanSlug("a--b")).toBeNull();
      expect(cleanSlug("a/b")).toBeNull();
      expect(cleanSlug("x".repeat(51))).toBeNull();
      expect(cleanSlug(42)).toBeNull();
    });

    test("an address is suggested from a name", () => {
      expect(slugFromName("Café   Word Count!")).toBe("cafe-word-count");
      expect(slugFromName("—")).toBe("");
      expect(cleanSlug(slugFromName("Character sheet export (CSV)"))).toBe("character-sheet-export-csv");
    });

    test("a page's text loses control characters, keeps paragraphs where asked, and is cut to length", () => {
      expect(cleanText(" a\tb\nc ", 100)).toBe("a b c");
      expect(cleanText("one\r\n\n\n\ntwo\u0007", 100, { lines: true })).toBe("one\n\ntwo");
      expect(cleanText("abcdef", 3)).toBe("abc");
    });

    test("categories, and an update that asks for more", () => {
      expect(isPluginCategory("export")).toBe(true);
      expect(isPluginCategory("nope")).toBe(false);
      expect(categoryLabel("nope")).toBe("Other");
      expect(asksForMore("read", "write")).toBe(true);
      expect(asksForMore("write", "read")).toBe(false);
      expect(asksForMore("write", "write")).toBe(false);
    });
  });

  describe("the frames a plugin runs in", () => {
    test("the relay holds the plugin's frame, sandboxed, and both carry one policy that allows only their scripts", async () => {
      const code = 'const s = "</script><!-- not the end"; plotra.ui.toast(s);';
      const outer = await pluginDocument(code, context, theme);
      const inner = decode(/srcdoc="([^"]*)"/.exec(outer)![1]);
      expect(outer).toContain('<iframe id="p" sandbox="allow-scripts"');
      const csp = (html: string) => decode(/Content-Security-Policy" content="([^"]*)"/.exec(html)![1]);
      expect(csp(outer)).toBe(csp(inner));
      const policyText = csp(outer);
      for (const part of ["default-src 'none'", "connect-src 'none'", "frame-src 'none'", "form-action 'none'", "base-uri 'none'", "worker-src 'none'"]) expect(policyText).toContain(part);
      expect(policyText).not.toContain("unsafe-eval");

      // Exactly three scripts run: the relay's, the bootstrap and the plugin's, each by hash.
      const [relay] = scripts(outer);
      const [boot, main] = scripts(inner);
      expect(relay).toBe(RELAY);
      expect(main).toBe(inlineScript(code));
      expect(scripts(inner)).toHaveLength(2);
      for (const script of [relay, boot, main]) expect(policyText).toContain(`'sha256-${await sha256(script)}'`);
      expect(policyText).toBe(policy([await sha256(relay), await sha256(boot), await sha256(main)]));

      // Nothing in a script can end its element early or open a comment.
      for (const script of [boot, main]) {
        expect(script).not.toMatch(/<\/script/i);
        expect(script).not.toContain("<!--");
      }
      // The theme can't break out of its style either.
      expect(inner).not.toContain("alert(1)</");
      expect(inner).not.toContain("bad name");
      expect(inner).toContain("--plotra-background:oklch(1 0 0)");
    });

    test("escaped code means what it meant", () => {
      const code = 'var a = "</script>"; var b = /<\\/script/; var c = "<!--";';
      const values = new Function(`${inlineScript(code)}; return [a, b.source, c];`)() as string[];
      expect(values).toEqual(["</script>", "<\\/script", "<!--"]);
    });
  });

  /** The bootstrap, run against a stand-in for its frame: what it posts, and a way to answer. */
  function frame(mode: "background" | "panel", panel: string | null = null) {
    const sent: Array<Record<string, unknown>> = [];
    const listeners: Record<string, Array<(event: unknown) => void>> = {};
    const parent = { postMessage: (message: Record<string, unknown>) => sent.push(message) };
    const win: Record<string, unknown> = { RTCPeerConnection: class {} };
    const body = { drawn: "" };
    const run = new Function("parent", "addEventListener", "window", "document", bootScript({ ...context, mode, panel }));
    run(parent, (type: string, fn: (event: unknown) => void) => (listeners[type] ??= []).push(fn), win, { body });
    const deliver = (data: unknown) => listeners.message.forEach((fn) => fn({ source: parent, data }));
    const plotra = win.plotra as {
      project: { title: string };
      registerCommand: (spec: unknown) => void;
      registerExport: (spec: unknown) => void;
      registerPanel: (spec: unknown) => void;
      registerTheme: (spec: unknown) => void;
      notes: { read: (id: string) => Promise<unknown>; list: () => Promise<unknown> };
    };
    return { sent, deliver, plotra, win, body, listeners };
  }
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

  describe("the plugin's side of the messages", () => {
    test("registering sends the app what to list, and the app's run comes back done", async () => {
      const { sent, deliver, plotra, win } = frame("background");
      expect(plotra.project.title).toBe("The </script> <!-- night");
      expect(win.RTCPeerConnection).toBeUndefined();
      plotra.registerCommand({ id: "Count", title: " Count words ", run: () => 42 });
      plotra.registerExport({ id: "csv", title: "CSV", extension: ".csv", run: () => "a,b" });
      expect(sent).toEqual([
        { plotra: 1, type: "register", what: "command", name: "count", title: "Count words" },
        { plotra: 1, type: "register", what: "export", name: "csv", title: "CSV", extension: "csv" },
      ]);
      expect(() => plotra.registerCommand({ id: "has space", title: "X", run() {} })).toThrow("letters, digits");
      expect(() => plotra.registerCommand({ id: "x", title: "X" })).toThrow("must be a function");

      deliver({ plotra: 1, type: "run", id: 7, what: "command", name: "count" });
      deliver({ plotra: 1, type: "run", id: 8, what: "command", name: "missing" });
      await tick();
      expect(sent.slice(2)).toEqual([
        { plotra: 1, type: "done", id: 7, ok: true, value: 42 },
        { plotra: 1, type: "done", id: 8, ok: false, error: "This plugin no longer has that." },
      ]);
    });

    test("a call is a promise the app's answer settles; messages from elsewhere are ignored", async () => {
      const { sent, deliver, plotra, listeners } = frame("background");
      const read = plotra.notes.read("n1");
      const list = plotra.notes.list();
      expect(sent).toEqual([
        { plotra: 1, type: "call", id: 1, method: "notes.read", args: ["n1"] },
        { plotra: 1, type: "call", id: 2, method: "notes.list", args: [] },
      ]);
      // Something other than the app can't answer for it.
      listeners.message.forEach((fn) => fn({ source: {}, data: { plotra: 1, type: "result", id: 1, ok: true, value: "forged" } }));
      deliver({ plotra: 1, type: "result", id: 1, ok: true, value: { title: "Romeo" } });
      deliver({ plotra: 1, type: "result", id: 2, ok: false, error: "No access." });
      expect(await read).toEqual({ title: "Romeo" });
      await expect(list).rejects.toThrow("No access.");
    });

    test("a theme registers its colours and CSS", () => {
      const { sent, plotra } = frame("background");
      plotra.registerTheme({ id: "Harbour", title: "Harbour", light: { background: "#eef4f8", size: 3 }, dark: { background: "#0b1d2a" }, css: "a { color: red }" });
      expect(sent).toEqual([{ plotra: 1, type: "register", what: "theme", name: "harbour", title: "Harbour", light: { background: "#eef4f8" }, dark: { background: "#0b1d2a" }, css: "a { color: red }" }]);
      expect(() => plotra.registerTheme({ id: "empty", title: "Empty" })).toThrow("colours for light, dark, or both");
      expect(() => plotra.registerTheme({ id: "bad", title: "Bad", light: "#fff" })).toThrow("object of colours");
    });

    test("a panel's frame draws its own panel and registers nothing", () => {
      const { sent, plotra, body } = frame("panel", "words");
      plotra.registerCommand({ id: "x", title: "X", run() {} });
      plotra.registerPanel({ id: "other", title: "Other", render: (el: { drawn: string }) => (el.drawn = "other") });
      plotra.registerPanel({ id: "words", title: "Words", render: (el: { drawn: string }) => (el.drawn = "words") });
      expect(sent).toEqual([]);
      expect(body.drawn).toBe("words");
    });
  });

  describe("events and storage, on the plugin's side", () => {
    type Plotra = {
      on: (name: string, handler: (data: unknown) => void) => () => void;
      storage: { get: (k: string) => Promise<unknown>; set: (k: string, v: unknown) => Promise<unknown>; delete: (k: string) => Promise<unknown>; keys: () => Promise<unknown> };
    };
    test("plotra.on asks the app once per event, hears it, and stops when told", () => {
      const { sent, deliver, plotra } = frame("panel", "words");
      const p = plotra as unknown as Plotra;
      const heard: unknown[] = [];
      const stop = p.on("notes.change", (data) => heard.push(["a", data]));
      p.on("notes.change", (data) => heard.push(["b", data]));
      p.on("note.open", (data) => heard.push(["open", data]));
      expect(sent).toEqual([
        { plotra: 1, type: "subscribe", name: "notes.change" },
        { plotra: 1, type: "subscribe", name: "note.open" },
      ]);
      expect(() => p.on("note.delete", () => {})).toThrow("listens for one of: note.open, notes.change");
      expect(() => p.on("note.open", "nope" as never)).toThrow("must be a function");
      deliver({ plotra: 1, type: "event", name: "notes.change", data: { changed: ["n1"], removed: [] } });
      stop();
      deliver({ plotra: 1, type: "event", name: "notes.change", data: { changed: ["n2"], removed: [] } });
      deliver({ plotra: 1, type: "event", name: "note.open", data: { id: "n2" } });
      expect(heard).toEqual([
        ["a", { changed: ["n1"], removed: [] }],
        ["b", { changed: ["n1"], removed: [] }],
        ["b", { changed: ["n2"], removed: [] }],
        ["open", { id: "n2" }],
      ]);
    });

    test("a handler that throws is reported, and the others still hear it", () => {
      const { sent, deliver, plotra } = frame("background");
      const p = plotra as unknown as Plotra;
      const heard: unknown[] = [];
      p.on("note.open", () => {
        throw new Error("boom");
      });
      p.on("note.open", (data) => heard.push(data));
      deliver({ plotra: 1, type: "event", name: "note.open", data: { id: null } });
      expect(heard).toEqual([{ id: null }]);
      expect(sent).toContainEqual({ plotra: 1, type: "error", message: "boom" });
    });

    test("storage calls go to the app", () => {
      const { sent, plotra } = frame("background");
      const p = plotra as unknown as Plotra;
      void p.storage.set("goal", 500);
      void p.storage.get("goal");
      void p.storage.delete("goal");
      void p.storage.keys();
      expect(sent.map((m) => [m.method, m.args])).toEqual([
        ["storage.set", ["goal", 500]],
        ["storage.get", ["goal"]],
        ["storage.delete", ["goal"]],
        ["storage.keys", []],
      ]);
    });

    test("storage keys and values are checked before they're kept", async () => {
      const { cleanStorageKey, storageValue, MAX_STORAGE_VALUE } = await import("@/lib/plugins");
      expect(cleanStorageKey("days:p1")).toBe("days:p1");
      expect(() => cleanStorageKey("")).toThrow("1 to 200");
      expect(() => cleanStorageKey(4)).toThrow("1 to 200");
      expect(() => cleanStorageKey("a\nb")).toThrow("1 to 200");
      expect(storageValue({ a: [1, "b", null] })).toBe('{"a":[1,"b",null]}');
      expect(() => storageValue(undefined)).toThrow("storage.delete");
      expect(() => storageValue(() => 1)).toThrow("storage.delete");
      const loop: Record<string, unknown> = {};
      loop.self = loop;
      expect(() => storageValue(loop)).toThrow("what JSON can hold");
      expect(() => storageValue("x".repeat(MAX_STORAGE_VALUE))).toThrow("too much");
    });
  });

  describe("Plotra's own plugins", async () => {
    const { officialPlugins, isOfficialSlug } = await import("@/lib/official-plugins");
    const { cleanSlug, isPluginCategory } = await import("@/lib/plugin-store");

    test("each has a whole header, a store page, and an address of its own", () => {
      expect(officialPlugins.length).toBeGreaterThanOrEqual(8);
      expect(new Set(officialPlugins.map((p) => p.slug)).size).toBe(officialPlugins.length);
      for (const p of officialPlugins) {
        expect(cleanSlug(p.slug)).toBe(p.slug);
        expect(isOfficialSlug(p.slug)).toBe(true);
        expect(isPluginCategory(p.category)).toBe(true);
        expect(p.name.length).toBeGreaterThan(2);
        expect(p.version).toMatch(/^\d+\.\d+/);
        expect(readPluginHeader(p.code).description.length).toBeGreaterThan(10);
        expect(p.summary.length).toBeLessThanOrEqual(160);
        expect(p.about.length).toBeGreaterThan(p.summary.length);
        expect(cleanPluginCode(p.code)).toBe(p.code);
        expect(Number.isNaN(p.releasedAt.getTime())).toBe(false);
      }
    });

    test("each one's store page says the access its header asks for", () => {
      for (const p of officialPlugins) {
        const says = p.about.includes("It only reads your notes");
        expect([p.slug, says]).toEqual([p.slug, p.access === "read"]);
      }
    });

    test("each one starts in a background frame and registers what it adds, without errors", async () => {
      const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (...args: string[]) => (...args: unknown[]) => Promise<unknown>;
      for (const p of officialPlugins) {
        const { sent, plotra, body } = frame("background");
        const started = new AsyncFunction("plotra", "document", p.code)(plotra, { body, createElement: () => ({}) });
        started.catch((error) => sent.push({ type: "thrown", message: String(error) }));
        await tick();
        const registered = sent.filter((m) => m.type === "register");
        expect([p.slug, registered.length > 0]).toEqual([p.slug, true]);
        expect([p.slug, sent.filter((m) => m.type === "thrown" || m.type === "error")]).toEqual([p.slug, []]);
        // It calls only what the API has.
        const methods = new Set(sent.filter((m) => m.type === "call").map((m) => String(m.method)));
        for (const method of methods) expect(isServerMethod(method) || isBrowserMethod(method)).toBe(true);
      }
    });
  });

  test("the plugin actions, on PGlite in a process of their own", () => {
    const run = Bun.spawnSync([process.execPath, "test", import.meta.path], {
      cwd: `${import.meta.dir}/../..`,
      env: { ...process.env, PLOTRA_PLUGINS_DB: "1", DATABASE_URL: "pglite:memory" },
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = `${run.stdout.toString()}\n${run.stderr.toString()}`;
    if (run.exitCode !== 0) console.error(output);
    expect(run.exitCode).toBe(0);
    expect(output).toContain(" 0 fail");
  }, 120_000);
} else {
  const people = {
    ana: { user: { id: "ana", name: "Ana", email: "ana@example.com" }, session: { id: "s-ana" } },
    ben: { user: { id: "ben", name: "Ben", email: "ben@example.com" }, session: { id: "s-ben" } },
    cy: { user: { id: "cy", name: "Cy", email: "cy@example.com" }, session: { id: "s-cy" } },
    dee: { user: { id: "dee", name: "Dee", email: "dee@example.com" }, session: { id: "s-dee" } },
  };
  let session = people.ana;
  const workspaces = [{ id: "org-ana", name: "Ana's", slug: "ws-ana", logo: null, role: "owner" }];
  mock.module("@/lib/data", () => ({
    getSession: async () => session,
    requireSession: async () => session,
    listWorkspaces: async () => (session === people.ana ? workspaces : []),
    requireWorkspace: async () => workspaces[0],
    isApiRequest: () => false,
    runAsApiUser: <T,>(_session: unknown, fn: () => Promise<T>) => fn(),
  }));

  const { db, schema } = await import("@plotra/db");
  const actions = await import("@/lib/plugin-actions");
  const store = await import("@/lib/plugin-store-actions");
  const { getStoreListing, listStore } = await import("@/lib/plugin-store-read");
  const { withUser } = await import("@plotra/db/rls");
  const { eq } = await import("drizzle-orm");
  const { createImported } = await import("@/lib/io/import");
  const { transaction } = await import("@/lib/request-cache");
  const { MAX_PLUGINS } = await import("@/lib/plugins");

  const now = new Date();
  const { user, organization, member, project } = schema;
  await db.insert(user).values([
    { id: "ana", name: "Ana", email: "ana@example.com", createdAt: now, updatedAt: now },
    { id: "ben", name: "Ben", email: "ben@example.com", createdAt: now, updatedAt: now },
    { id: "cy", name: "Cy", email: "cy@example.com", createdAt: now, updatedAt: now },
    { id: "dee", name: "Dee", email: "dee@example.com", createdAt: now, updatedAt: now },
  ]);
  await db.insert(organization).values({ id: "org-ana", name: "Ana's", slug: "ws-ana", createdAt: now });
  await db.insert(member).values({ id: "m-ana", organizationId: "org-ana", userId: "ana", role: "owner", createdAt: now });
  await db.insert(project).values({ id: "p1", organizationId: "org-ana", slug: "verona", title: "Verona" });
  await transaction(() => createImported("p1", null, [{ parent: null, kind: "note", title: "Romeo", tags: [], value: [] }]));

  const code = `// ==Plotra plugin==
// @name Counter
// @version 1
// ==/Plotra plugin==
plotra.registerCommand({ id: "count", title: "Count", run() {} });`;

  describe("a person's plugins", () => {
    test("added, listed without code, changed, switched off, and loaded only when on", async () => {
      session = people.ana;
      const added = await actions.addPlugin({ code, fileName: "ignored.js" });
      expect(added).toMatchObject({ name: "Counter", version: "1", enabled: true, size: code.length });
      const unnamed = await actions.addPlugin({ code: "plotra.ui.toast('hi')", fileName: "hello.js" });
      expect(unnamed.name).toBe("hello");

      const listed = await actions.listPlugins();
      expect(listed.map((p) => p.name)).toEqual(["Counter", "hello"]);
      expect(listed[0]).not.toHaveProperty("code");
      expect(await actions.getPluginCode(added.id)).toBe(code);

      const renamed = await actions.updatePluginCode(added.id, code.replace("@name Counter", "@name Tally").replace("@version 1", "@version 2"));
      expect(renamed).toMatchObject({ name: "Tally", version: "2" });
      await actions.setPluginEnabled(unnamed.id, false);
      expect((await actions.loadPlugins()).map((p) => p.name)).toEqual(["Tally"]);
    });

    test("are no one else's: another person sees none of them and can't change them", async () => {
      session = people.ana;
      const [mine] = await actions.listPlugins();
      session = people.ben;
      expect(await actions.listPlugins()).toEqual([]);
      expect(await actions.loadPlugins()).toEqual([]);
      await expect(actions.getPluginCode(mine.id)).rejects.toThrow("gone");
      await expect(actions.setPluginEnabled(mine.id, false)).rejects.toThrow("gone");
      await actions.removePlugin(mine.id);
      session = people.ana;
      expect((await actions.listPlugins()).map((p) => p.id)).toContain(mine.id);
    });

    test(`a person keeps at most ${MAX_PLUGINS}`, async () => {
      session = people.ben;
      for (let i = 0; i < MAX_PLUGINS; i++) await actions.addPlugin({ code: `// ${i}`, fileName: `p${i}.js` });
      await expect(actions.addPlugin({ code: "// one more" })).rejects.toThrow(`That's ${MAX_PLUGINS} plugins`);
    });
  });

  describe("a plugin's calls", () => {
    test("act on the open project as the person, and say what went wrong", async () => {
      session = people.ana;
      const { id: plugin } = await actions.addPlugin({ code: "// a caller", fileName: "caller.js" });
      const list = await actions.pluginCall("p1", plugin, "notes.list", []);
      expect(list.ok).toBe(true);
      const notes = (list as { value: Array<{ title: string; updatedAt: unknown }> }).value;
      expect(notes.map((n) => n.title)).toEqual(["Romeo"]);
      // Dates arrive as text a frame can be sent.
      expect(typeof notes[0].updatedAt).toBe("string");

      expect(await actions.pluginCall("p1", plugin, "notes.delete", [])).toEqual({ ok: false, error: "Plugins can't call notes.delete." });
      expect(await actions.pluginCall("p1", plugin, "notes.read", [42])).toMatchObject({ ok: false, error: expect.stringContaining("note's id") });

      const made = await actions.pluginCall("p1", plugin, "notes.create", [{ title: "Juliet", markdown: "A Capulet." }]);
      expect(made).toMatchObject({ ok: true, value: { title: "Juliet", kind: "note" } });
      const kinds = await actions.pluginCall("p1", plugin, "kinds.add", [{ name: "Spell" }]);
      expect(kinds).toMatchObject({ ok: true, value: { name: "Spell", plural: "Spells" } });
      await actions.removePlugin(plugin);
    });

    test("a plugin whose header says @access read may look but not change anything", async () => {
      session = people.ana;
      const { id: plugin, access } = await actions.addPlugin({ code: "// ==Plotra plugin==\n// @access read\n// ==/Plotra plugin==\n", fileName: "reader.js" });
      expect(access).toBe("read");
      expect((await actions.pluginCall("p1", plugin, "notes.list", [])).ok).toBe(true);
      for (const method of ["notes.create", "notes.update", "notes.write", "kinds.add"]) {
        expect(await actions.pluginCall("p1", plugin, method, [{ title: "Tybalt" }])).toMatchObject({ ok: false, error: expect.stringContaining("only allowed to read your notes") });
      }
      await actions.removePlugin(plugin);
    });

    test("can't reach a project the person can't open, nor call as someone else's plugin", async () => {
      session = people.ana;
      const { id: anas } = await actions.addPlugin({ code: "// ana's", fileName: "anas.js" });
      session = people.ben;
      const [bens] = await actions.listPlugins();
      expect((await actions.pluginCall("p1", bens.id, "notes.list", [])).ok).toBe(false);
      expect(await actions.pluginCall("p1", anas, "notes.list", [])).toMatchObject({ ok: false, error: expect.stringContaining("removed") });
      session = people.ana;
      await actions.removePlugin(anas);
    });
  });

  describe("a plugin's own storage", () => {
    test("keeps JSON under keys, for that plugin alone, even one that only reads notes", async () => {
      session = people.ana;
      const { id: plugin } = await actions.addPlugin({ code: "// ==Plotra plugin==\n// @access read\n// ==/Plotra plugin==\n", fileName: "keeper.js" });
      const call = (method: string, ...args: unknown[]) => actions.pluginCall("p1", plugin, method, args);
      expect(await call("storage.get", "goal")).toEqual({ ok: true, value: null });
      expect(await call("storage.keys")).toEqual({ ok: true, value: [] });
      expect(await call("storage.set", "goal", 500)).toEqual({ ok: true, value: true });
      expect(await call("storage.set", "days:p1", { "2026-11-08": { start: 10, written: 20 } })).toEqual({ ok: true, value: true });
      expect(await call("storage.set", "goal", 750)).toEqual({ ok: true, value: true });
      expect(await call("storage.get", "goal")).toEqual({ ok: true, value: 750 });
      expect(await call("storage.get", "days:p1")).toEqual({ ok: true, value: { "2026-11-08": { start: 10, written: 20 } } });
      expect(await call("storage.keys")).toEqual({ ok: true, value: ["days:p1", "goal"] });
      expect(await call("storage.set", "nothing")).toMatchObject({ ok: false, error: expect.stringContaining("storage.delete") });
      expect(await call("storage.delete", "goal")).toEqual({ ok: true, value: true });
      expect(await call("storage.keys")).toEqual({ ok: true, value: ["days:p1"] });

      // Someone else can't read or write it through their own session.
      session = people.ben;
      expect(await actions.pluginCall("p1", plugin, "storage.get", ["days:p1"])).toMatchObject({ ok: false, error: expect.stringContaining("removed") });
      expect(await actions.pluginCall("p1", plugin, "storage.set", ["x", 1])).toMatchObject({ ok: false });
      session = people.ana;
      await actions.removePlugin(plugin);
    });

    test("is refused once it's full", async () => {
      session = people.ana;
      const { MAX_STORAGE, MAX_STORAGE_VALUE } = await import("@/lib/plugins");
      const { id: plugin } = await actions.addPlugin({ code: "// big", fileName: "big.js" });
      const chunk = "x".repeat(MAX_STORAGE_VALUE - 10);
      let refused: unknown = null;
      for (let i = 0; i < Math.ceil(MAX_STORAGE / chunk.length) + 1; i++) {
        const result = await actions.pluginCall("p1", plugin, "storage.set", [`k${i}`, chunk]);
        if (!result.ok) {
          refused = result;
          break;
        }
      }
      expect(refused).toMatchObject({ ok: false, error: expect.stringContaining("storage is full") });
      await actions.removePlugin(plugin);
    });
  });

  describe("Plotra's own plugins, installed", () => {
    test("install as a plugin of the person's, once, and run", async () => {
      session = people.dee;
      const { name } = await store.installPlugin("word-count-by-chapter");
      expect(name).toBe("Word count by chapter");
      await expect(store.installPlugin("word-count-by-chapter")).rejects.toThrow("already");
      const mine = (await actions.listPlugins()).find((p) => p.name === name)!;
      expect(mine.access).toBe("read");
      expect(mine.store).toMatchObject({ slug: "word-count-by-chapter", own: false, update: false, blocked: false });
      expect((await actions.loadPlugins()).map((p) => p.name)).toContain(name);
      // They're not in the database's store: the pages add them (lib/plugin-store-source.ts).
      expect((await listStore()).some((e) => e.slug === "word-count-by-chapter")).toBe(false);
    });

    test("an older copy shows an update, which keeps what it stored", async () => {
      session = people.dee;
      const mine = (await actions.listPlugins()).find((p) => p.store?.slug === "word-count-by-chapter")!;
      await db.update(schema.userPlugin).set({ version: "0.9", code: "// old" }).where(eq(schema.userPlugin.id, mine.id));
      await actions.pluginCall("p1", mine.id, "storage.set", ["kept", true]);
      const old = (await actions.listPlugins()).find((p) => p.id === mine.id)!;
      expect(old.store).toMatchObject({ update: true, latest: { version: "1.0" } });
      expect(await store.updateInstalledPlugin(mine.id)).toEqual({ version: "1.0" });
      const now = (await actions.listPlugins()).find((p) => p.id === mine.id)!;
      expect(now.store?.update).toBe(false);
      expect(await actions.getPluginCode(mine.id)).toContain("Word count by chapter");
      expect(await actions.pluginCall("p1", mine.id, "storage.get", ["kept"])).toEqual({ ok: true, value: true });
    });

    test("can't be published by anyone else, as itself or at its address", async () => {
      session = people.dee;
      const mine = (await actions.listPlugins()).find((p) => p.store?.slug === "word-count-by-chapter")!;
      await expect(store.publishPlugin({ pluginId: mine.id, slug: "my-counter", summary: "Mine now" })).rejects.toThrow("came from the store");
      const { id: own } = await actions.addPlugin({ code: "// ==Plotra plugin==\n// @version 1\n// ==/Plotra plugin==\n", fileName: "own.js" });
      await expect(store.publishPlugin({ pluginId: own, slug: "daily-word-goal", summary: "Taken?" })).rejects.toThrow("one of Plotra's own");
      await actions.removePlugin(own);
    });

    test("editing one makes it the person's own copy", async () => {
      session = people.dee;
      const mine = (await actions.listPlugins()).find((p) => p.store?.slug === "word-count-by-chapter")!;
      await actions.updatePluginCode(mine.id, "// ==Plotra plugin==\n// @name Counter of mine\n// ==/Plotra plugin==\n");
      expect((await actions.listPlugins()).find((p) => p.id === mine.id)?.store).toBeNull();
      await actions.removePlugin(mine.id);
    });
  });

  describe("the plugin store", () => {
    const tally = (version: string, extra = "") => `// ==Plotra plugin==
// @name Tally
// @version ${version}
${extra}// ==/Plotra plugin==
plotra.registerCommand({ id: "tally", title: "Tally", run() {} });`;
    let source = "";

    test("an author publishes one of their plugins, with a version, at an address of its own", async () => {
      session = people.ana;
      const unversioned = await actions.addPlugin({ code: "// no header", fileName: "bare.js" });
      await expect(store.publishPlugin({ pluginId: unversioned.id, slug: "bare", summary: "Bare" })).rejects.toThrow("Give it a version first");
      await expect(store.publishPlugin({ pluginId: unversioned.id, slug: "x", summary: "Bare" })).rejects.toThrow("Its address takes");
      await actions.removePlugin(unversioned.id);

      source = (await actions.addPlugin({ code: tally("1", "// @access read\n") })).id;
      await expect(store.publishPlugin({ pluginId: source, slug: "tally", summary: "  " })).rejects.toThrow("Say in a line");
      expect(await store.publishPlugin({ pluginId: source, slug: "tally", summary: "Counts things", about: "Long\n\ntext", category: "stats" })).toBe("tally");
      await expect(store.publishPlugin({ pluginId: source, slug: "tally-2", summary: "Again" })).rejects.toThrow("already in the store");

      const mine = (await actions.listPlugins()).find((p) => p.id === source);
      expect(mine?.store).toMatchObject({ slug: "tally", own: true, update: false, changed: false, blocked: false, page: { summary: "Counts things", category: "stats" } });

      const entries = await listStore();
      expect(entries).toEqual([expect.objectContaining({ slug: "tally", name: "Tally", author: "Ana", version: "1", access: "read", installs: 1, category: "stats" })]);
      expect(await listStore({ query: "count" })).toHaveLength(1);
      expect(await listStore({ category: "export" })).toHaveLength(0);
    });

    test("an address can't be taken twice", async () => {
      session = people.ben;
      const [bens] = await actions.listPlugins();
      await actions.updatePluginCode(bens.id, tally("9"));
      await expect(store.publishPlugin({ pluginId: bens.id, slug: "tally", summary: "Mine" })).rejects.toThrow("That address is taken");
    });

    test("anyone installs it as a plugin of their own, once, and it runs", async () => {
      session = people.cy;
      const { id } = await store.installPlugin("tally");
      await expect(store.installPlugin("tally")).rejects.toThrow("You have this plugin already");
      await expect(store.installPlugin("nope")).rejects.toThrow("no such plugin");
      const [row] = await actions.listPlugins();
      expect(row).toMatchObject({ id, name: "Tally", version: "1", access: "read", description: "Counts things", store: { slug: "tally", own: false, update: false } });
      expect((await actions.loadPlugins()).map((p) => p.id)).toEqual([id]);
      // Installed from a read-only release, it stays read-only.
      expect(await actions.pluginCall("p1", id, "notes.create", [{ title: "x" }])).toMatchObject({ ok: false });

      const page = await getStoreListing("tally", "cy");
      expect(page).toMatchObject({ installs: 2, mine: false, installed: { pluginId: id }, about: "Long\n\ntext" });
      expect(page?.code).toContain("@version 1");
    });

    test("only its author changes it: its page, its versions, whether it's in the store", async () => {
      session = people.cy;
      const [copy] = await actions.listPlugins();
      await expect(store.editListing({ slug: "tally", summary: "Hijacked" })).rejects.toThrow("Only its author");
      await expect(store.setListingWithdrawn("tally", true)).rejects.toThrow("Only its author");
      await expect(store.publishVersion({ pluginId: copy.id })).rejects.toThrow("Only a plugin you published");
      // Not even by going around the app: row-level security and the columns granted.
      await withUser("cy", (tx) => tx.update(schema.pluginListing).set({ summary: "Hijacked" }).where(eq(schema.pluginListing.slug, "tally")));
      const [listing] = await db.select({ id: schema.pluginListing.id }).from(schema.pluginListing).where(eq(schema.pluginListing.slug, "tally"));
      await expect(withUser("cy", (tx) => tx.insert(schema.pluginRelease).values({ listingId: listing.id, version: "evil", code: "x" }))).rejects.toThrow();
      expect((await getStoreListing("tally", null))?.summary).toBe("Counts things");
    });

    test("a new version reaches those who have it, who are asked first when it wants more", async () => {
      session = people.ana;
      await expect(store.publishVersion({ pluginId: source })).rejects.toThrow("Nothing has changed");
      await actions.updatePluginCode(source, tally("1", "// changed\n"));
      expect((await actions.listPlugins()).find((p) => p.id === source)?.store).toMatchObject({ own: true, changed: true });
      await expect(store.publishVersion({ pluginId: source })).rejects.toThrow("Version 1 is already published");
      await actions.updatePluginCode(source, tally("2"));
      expect(await store.publishVersion({ pluginId: source, notes: "Writes now." })).toEqual({ slug: "tally", version: "2" });
      expect((await actions.listPlugins()).find((p) => p.id === source)?.store).toMatchObject({ changed: false, latest: { version: "2", access: "write" } });

      session = people.cy;
      const [before] = await actions.listPlugins();
      expect(before.store).toMatchObject({ update: true, latest: { version: "2", access: "write" } });
      expect(before.access).toBe("read");
      expect(await store.updateInstalledPlugin(before.id)).toEqual({ version: "2" });
      const [after] = await actions.listPlugins();
      expect(after).toMatchObject({ version: "2", access: "write", store: { update: false } });
      expect(await actions.getPluginCode(after.id)).toBe(tally("2"));

      const page = await getStoreListing("tally", null);
      expect(page?.releases.map((r) => [r.version, r.notes, r.access])).toEqual([
        ["2", "Writes now.", "write"],
        ["1", "", "read"],
      ]);
    });

    test("an author can withdraw it: no new installs, while copies keep working", async () => {
      session = people.ana;
      await store.setListingWithdrawn("tally", true);
      expect(await listStore()).toEqual([]);
      session = people.ben;
      const [bens] = await actions.listPlugins();
      await actions.removePlugin(bens.id);
      await expect(store.installPlugin("tally")).rejects.toThrow("took this plugin out");
      session = people.cy;
      expect(await actions.loadPlugins()).toHaveLength(1);
      session = people.ana;
      await store.setListingWithdrawn("tally", false);
      expect(await listStore()).toHaveLength(1);
    });

    test("taken down by whoever runs the server, it leaves the store and stops running everywhere but its author's", async () => {
      await db.update(schema.pluginListing).set({ blockedAt: new Date() }).where(eq(schema.pluginListing.slug, "tally"));
      expect(await listStore()).toEqual([]);
      expect(await getStoreListing("tally", null)).toBeNull();
      expect(await getStoreListing("tally", "ana")).toMatchObject({ mine: true, withdrawn: true });

      session = people.cy;
      expect(await actions.loadPlugins()).toEqual([]);
      const [copy] = await actions.listPlugins();
      expect(copy.store).toMatchObject({ blocked: true });
      await expect(store.updateInstalledPlugin(copy.id)).rejects.toThrow("isn't in the store");
      session = people.ben;
      await expect(store.installPlugin("tally")).rejects.toThrow("no such plugin");

      session = people.ana;
      expect((await actions.loadPlugins()).map((p) => p.id)).toContain(source);
      await expect(store.publishVersion({ pluginId: source })).rejects.toThrow();
      await expect(store.editListing({ slug: "tally", summary: "Back" })).rejects.toThrow("Only its author");
      // Its author can't lift it.
      await expect(withUser("ana", (tx) => tx.update(schema.pluginListing).set({ blockedAt: null }).where(eq(schema.pluginListing.slug, "tally")))).rejects.toThrow();
      await db.update(schema.pluginListing).set({ blockedAt: null }).where(eq(schema.pluginListing.slug, "tally"));
    });

    test("editing an installed plugin makes it the person's own copy", async () => {
      session = people.cy;
      const [copy] = await actions.listPlugins();
      await actions.updatePluginCode(copy.id, tally("2-mine"));
      const [own] = await actions.listPlugins();
      expect(own.store).toBeNull();
      expect((await getStoreListing("tally", "cy"))?.installed).toBeNull();
    });
  });
}
