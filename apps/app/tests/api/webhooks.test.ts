import { describe, expect, mock, test } from "bun:test";
import { createHmac } from "node:crypto";

// Webhooks (lib/webhooks.ts). The first part needs no database: signatures and
// which URLs are taken. The deliveries (to a server started here, recorded on
// the hook) run on PGlite, in a process of their own like the .plotra round
// trip (tests/io/plotra-file.test.ts), because the database driver is picked
// once per process.

const DELIVERIES = process.env.PLOTRA_WEBHOOK_DELIVERIES === "1";
if (DELIVERIES) {
  process.env.DATABASE_URL = "pglite:memory";
  delete process.env.DATABASE_DRIVER;
  // The receiver is on this machine.
  process.env.WEBHOOK_ALLOW_PRIVATE_URLS = "true";
}

if (!DELIVERIES) {
  const { parseWebhookUrl, signature, verbEvents } = await import("@/lib/webhooks");
  const { activityVerbs, webhookEvents } = await import("@plotra/db/schema");

  describe("webhooks", () => {
    test("a signature is the HMAC of the timestamp and the body", () => {
      const body = JSON.stringify({ type: "ping" });
      const expected = createHmac("sha256", "whsec_x").update(`1700000000.${body}`).digest("hex");
      expect(signature("whsec_x", body, 1700000000)).toBe(`t=1700000000,v1=${expected}`);
    });

    test("only https, no credentials, nothing private on a public server", () => {
      delete process.env.WEBHOOK_ALLOW_PRIVATE_URLS;
      expect(parseWebhookUrl("https://example.com/hook#x").toString()).toBe("https://example.com/hook");
      expect(() => parseWebhookUrl("http://example.com/hook")).toThrow("https://");
      expect(() => parseWebhookUrl("https://me:pw@example.com/")).toThrow("name and password");
      expect(() => parseWebhookUrl("https://localhost:3000/")).toThrow("private network");
      expect(() => parseWebhookUrl("https://10.0.0.5/")).toThrow("private network");
      expect(() => parseWebhookUrl("not a url")).toThrow("doesn't look like a URL");
      process.env.WEBHOOK_ALLOW_PRIVATE_URLS = "true";
      expect(parseWebhookUrl("http://localhost:5678/webhook").host).toBe("localhost:5678");
      delete process.env.WEBHOOK_ALLOW_PRIVATE_URLS;
    });

    test("every activity raises an event a webhook can ask for", () => {
      for (const verb of activityVerbs) expect(webhookEvents).toContain(verbEvents[verb]);
    });

    test("deliveries, in a process of their own on PGlite", () => {
      const run = Bun.spawnSync([process.execPath, "test", import.meta.path], {
        cwd: `${import.meta.dir}/../..`,
        env: { ...process.env, PLOTRA_WEBHOOK_DELIVERIES: "1", DATABASE_URL: "pglite:memory" },
        stdout: "pipe",
        stderr: "pipe",
      });
      const output = `${run.stdout.toString()}\n${run.stderr.toString()}`;
      if (run.exitCode !== 0) console.error(output);
      expect(run.exitCode).toBe(0);
      expect(output).toContain(" 0 fail");
    }, 120_000);
  });
} else {
  mock.module("next/server", () => ({ after: () => { throw new Error("outside a request"); } }));
  const { db, schema } = await import("@plotra/db");
  const { eq } = await import("drizzle-orm");
  const { deliver, emitWebhook, signature, MAX_FAILURES } = await import("@/lib/webhooks");

  const received: Array<{ headers: Headers; body: string }> = [];
  let answer = 200;
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      received.push({ headers: request.headers, body: await request.text() });
      return new Response("ok", { status: answer });
    },
  });
  const url = `http://localhost:${server.port}/hook`;

  const now = new Date();
  const { user, organization, project, node, webhook } = schema;
  await db.insert(user).values({ id: "ana", name: "Ana", email: "ana@example.com", createdAt: now, updatedAt: now });
  await db.insert(organization).values({ id: "org", name: "Org", slug: "org", createdAt: now });
  await db.insert(project).values({ id: "p1", organizationId: "org", slug: "hamlet", title: "Hamlet" });
  await db.insert(node).values({ id: "n1", projectId: "p1", kind: "scene", title: "The ramparts", position: "a0" });
  await db.insert(webhook).values([
    { id: "h1", projectId: "p1", url, secret: "whsec_test", events: [] },
    { id: "h2", projectId: "p1", url, secret: "whsec_other", events: ["comment.added"] },
  ]);
  const until = async (count: number) => {
    for (let i = 0; i < 100 && received.length < count; i++) await Bun.sleep(20);
  };

  describe("delivering", () => {
    test("an event goes, signed, to every hook that asked for it, and is recorded", async () => {
      await emitWebhook("p1", "note.created", { nodeId: "n1", actorId: "ana", data: { title: "The ramparts" } });
      await until(1);
      await Bun.sleep(50);
      // h2 only asked for comments.
      expect(received).toHaveLength(1);
      const [{ headers, body }] = received;
      const payload = JSON.parse(body);
      expect(payload).toMatchObject({ type: "note.created", project: { id: "p1", title: "Hamlet" }, note: { id: "n1", title: "The ramparts", kind: "scene" }, actor: { id: "ana", name: "Ana" } });
      expect(headers.get("plotra-event")).toBe("note.created");
      expect(headers.get("plotra-delivery")).toBe(payload.id);
      const t = Number(/t=(\d+)/.exec(headers.get("plotra-signature")!)![1]);
      expect(headers.get("plotra-signature")).toBe(signature("whsec_test", body, t));
      const [hook] = await db.select().from(webhook).where(eq(webhook.id, "h1"));
      expect(hook).toMatchObject({ lastStatus: 200, lastError: null, failures: 0, enabled: true });
    });

    test("a note's saves are told at most once in a while", async () => {
      received.length = 0;
      await emitWebhook("p1", "note.updated", { nodeId: "n1", data: { words: 10 } });
      await emitWebhook("p1", "note.updated", { nodeId: "n1", data: { words: 12 } });
      await until(1);
      await Bun.sleep(50);
      expect(received).toHaveLength(1);
      expect(JSON.parse(received[0].body)).toMatchObject({ type: "note.updated", actor: null, data: { words: 10 } });
    });

    test("failures are counted, and enough of them in a row switch the hook off", async () => {
      answer = 500;
      const result = await deliver({ id: "h1", url, secret: "whsec_test" }, { id: "x", type: "ping", createdAt: now.toISOString(), project: { id: "p1", title: "Hamlet" }, note: null, actor: null, data: {} }, { retries: false });
      expect(result).toMatchObject({ ok: false, status: 500 });
      let [hook] = await db.select().from(webhook).where(eq(webhook.id, "h1"));
      expect(hook).toMatchObject({ failures: 1, lastStatus: 500, enabled: true });

      await db.update(webhook).set({ failures: MAX_FAILURES - 1 }).where(eq(webhook.id, "h1"));
      await deliver({ id: "h1", url, secret: "whsec_test" }, { id: "y", type: "ping", createdAt: now.toISOString(), project: { id: "p1", title: "Hamlet" }, note: null, actor: null, data: {} }, { retries: false });
      [hook] = await db.select().from(webhook).where(eq(webhook.id, "h1"));
      expect(hook).toMatchObject({ failures: MAX_FAILURES, enabled: false });

      // Switched off, it hears of nothing more.
      received.length = 0;
      answer = 200;
      await emitWebhook("p1", "note.renamed", { nodeId: "n1" });
      await Bun.sleep(100);
      expect(received).toHaveLength(0);
      server.stop(true);
    });
  });
}
