import { STORE_CACHE, storeApi, storeNotFound } from "@/lib/plugin-store-api";
import { getStoreListing } from "@/lib/plugin-store-read";

// GET /api/store/plugins/<slug>: one plugin's store page as JSON: who made it,
// its versions, newest first, and the latest one's whole code. No sign-in; a
// plugin taken down is a 404, as its page is.
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return storeApi("read a plugin", STORE_CACHE, async () => {
    const listing = await getStoreListing(slug, null);
    if (!listing) return storeNotFound();
    return {
      slug: listing.slug,
      name: listing.name,
      summary: listing.summary,
      about: listing.about,
      category: listing.category,
      access: listing.access,
      author: listing.author,
      installs: listing.installs,
      withdrawn: listing.withdrawn,
      createdAt: listing.createdAt.toISOString(),
      updatedAt: listing.updatedAt.toISOString(),
      releases: listing.releases.map((r) => ({ id: r.id, version: r.version, notes: r.notes, access: r.access, size: r.size, createdAt: r.createdAt.toISOString() })),
      code: listing.code,
    };
  });
}
