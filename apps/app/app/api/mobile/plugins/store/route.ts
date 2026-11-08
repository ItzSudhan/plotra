import { ApiError, json, withApi } from "@/lib/api/handler";
import type { StoreEntry, StoreSort } from "@/lib/plugin-store-read";
import { StoreUnreachable } from "@/lib/plugin-store-remote";
import { browseOfficial, browseStore, openStoreListing } from "@/lib/plugin-store-source";

// GET /api/mobile/plugins/store?q=&category=&sort=popular|new
//   → { official: Entry[], community: Entry[], unreachable: string | null }
// GET /api/mobile/plugins/store?slug=<slug>
//   → { listing: Listing }
// The plugin store as its web pages read it (app/plugins, lib/plugin-store-source.ts),
// Plotra's own plugins included. Only what anyone may see: installing,
// switching and removing plugins stay in the signed-in app, never an API
// token (lib/plugin-actions.ts assertSignedIn), so the phone opens the web for those.

const entry = (e: StoreEntry) => ({ ...e, updatedAt: e.updatedAt.toISOString() });

export function GET(request: Request) {
  return withApi(request, "read", async () => {
    const params = new URL(request.url).searchParams;
    const slug = params.get("slug");
    if (slug !== null) {
      // No viewer: whether they have it is theirs to see in the app, not through a token.
      const listing = await openStoreListing(slug.slice(0, 100), null).catch((error: unknown) => {
        if (error instanceof StoreUnreachable) throw new ApiError(503, error.message);
        throw error;
      });
      if (!listing || listing.withdrawn) throw new ApiError(404, "There's no such plugin in the store.");
      return json({
        listing: {
          slug: listing.slug,
          name: listing.name,
          summary: listing.summary,
          about: listing.about,
          category: listing.category,
          access: listing.access,
          author: listing.author,
          installs: listing.installs,
          updatedAt: listing.updatedAt.toISOString(),
          // Without the code: it's shown in full on the web, where it's installed.
          releases: listing.releases.map((r) => ({ id: r.id, version: r.version, notes: r.notes, access: r.access, size: r.size, createdAt: r.createdAt.toISOString() })),
        },
      });
    }
    const query = (params.get("q") ?? "").slice(0, 100);
    const category = params.get("category") ?? "";
    const sort: StoreSort = params.get("sort") === "new" ? "new" : "popular";
    // Plotra's own ship with the app, so they're there even when the store can't be reached.
    const official = await browseOfficial({ query, category, sort });
    let community: StoreEntry[] = [];
    let unreachable: string | null = null;
    try {
      community = await browseStore({ query, category, sort });
    } catch (error) {
      if (!(error instanceof StoreUnreachable)) throw error;
      unreachable = error.message;
    }
    return json({ official: official.map(entry), community: community.map(entry), unreachable });
  });
}
