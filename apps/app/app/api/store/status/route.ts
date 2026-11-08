import { storeApi } from "@/lib/plugin-store-api";
import { cleanSlug } from "@/lib/plugin-store";
import { storeStatus } from "@/lib/plugin-store-status";

// GET /api/store/status?slugs=a,b,c: for each plugin (up to 50), whether it's
// still in the store, withdrawn, taken down or gone, and its latest release.
// The desktop app asks this to offer updates and stop plugins taken down.
// Addresses that aren't valid are left out.
export function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("slugs") ?? "";
  const slugs = [...new Set(raw.split(",").map(cleanSlug).filter((s): s is string => s !== null))].slice(0, 50);
  return storeApi("check plugins", "public, s-maxage=30", async () => ({ plugins: await storeStatus(slugs) }));
}
