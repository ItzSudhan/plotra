import { STORE_CACHE, storeApi } from "@/lib/plugin-store-api";
import { listStore } from "@/lib/plugin-store-read";

// GET /api/store/plugins?q=&category=&sort=popular|new: the plugins anyone may
// install from this server's store, as the /plugins page lists them. No
// sign-in; the desktop app browses the cloud store with it.
export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  return storeApi("list the store", STORE_CACHE, async () => {
    const plugins = await listStore({ query: params.get("q") ?? undefined, category: params.get("category") ?? undefined, sort: params.get("sort") === "new" ? "new" : "popular" });
    return { plugins: plugins.map((p) => ({ ...p, updatedAt: p.updatedAt.toISOString() })) };
  });
}
