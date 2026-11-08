import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import manifest from "@/app/manifest";
import { keptNodes } from "@/components/offline/keep-offline";
import type { BinderNode } from "@/lib/tree";

// Installing Plotra and working offline (beat-the-competitors.md, step 2).

const app = path.join(import.meta.dir, "../..");

describe("the install manifest", () => {
  test("opens Plotra in its own window, with icons that exist", () => {
    const m = manifest();
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/");
    const sizes = (m.icons ?? []).map((icon) => `${icon.sizes} ${icon.purpose}`);
    expect(sizes).toEqual(["192x192 any", "512x512 any", "512x512 maskable"]);
    for (const icon of m.icons ?? []) expect(existsSync(path.join(app, "public", icon.src))).toBe(true);
  });
});

describe("the service worker", () => {
  const sw = readFileSync(path.join(app, "public/sw.js"), "utf8");

  test("never answers for anything but GET", () => {
    expect(sw).toContain('if (request.method !== "GET") return;');
  });

  test("keeps copies only of workspace, project and settings pages", () => {
    const pageable = new Function(`${sw.match(/const pageable = [^;]+;/)![0]} return pageable;`)() as (path: string) => boolean;
    for (const yes of ["/", "/w/alex", "/w/alex/p/romeo", "/settings", "/workspaces"]) expect(pageable(yes)).toBe(true);
    for (const no of ["/sign-in", "/sign-up", "/api/collab/token", "/p/token", "/share/x", "/invite/x", "/start"]) expect(pageable(no)).toBe(false);
  });

  test("its page-copy cache is the one sign-out deletes", () => {
    const helper = readFileSync(path.join(app, "components/offline/service-worker.tsx"), "utf8");
    const name = sw.match(/const PAGES = "([^"]+)"/)![1];
    expect(helper).toContain(`const PAGE_COPIES = "${name}"`);
  });

  test("is fetched without the sign-in check", () => {
    const proxy = readFileSync(path.join(app, "proxy.ts"), "utf8");
    expect(proxy).toContain("manifest.webmanifest|sw.js|");
  });
});

describe("keeping a project on this device", () => {
  const node = (id: string, kind: BinderNode["kind"], deleted = false) => ({ id, kind, deletedAt: deleted ? new Date() : null }) as unknown as BinderNode;

  test("fetches every note with a document, and nothing in the trash", () => {
    const nodes = [node("a", "scene"), node("b", "folder"), node("c", "canvas"), node("d", "dialogue"), node("e", "timeline"), node("f", "scene", true), node("g", "entity")];
    expect(keptNodes(nodes).map((n) => n.id)).toEqual(["a", "b", "c", "d", "g"]);
  });
});
