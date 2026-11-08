import { ApiError, body, json, withApi } from "@/lib/api/handler";
import { deleteMobileVersion, listMobileHistory, renameMobileVersion, restoreMobileVersion, saveMobileVersion } from "@/lib/api/mobile-history";

// A note's version history for the phone app (apps/mobile/src/lib/reader-api.ts),
// through the web's own functions (lib/api/mobile-history.ts).
//
// GET  ?project=&note=  { versions, canEdit, isDocument }: newest first.
// POST ?project=&note=  { action, ... }:
//   save    { name? }             → { id }   (what the note says now)
//   rename  { versionId, name? }  → { ok }   (no name: back to unnamed)
//   delete  { versionId }         → { ok }
//   restore { versionId }         → { ok }   (keeps what it says now as a version first)

function params(request: Request) {
  const url = new URL(request.url);
  const project = url.searchParams.get("project");
  const note = url.searchParams.get("note");
  if (!project || !note) throw new ApiError(400, "Send ?project=<id>&note=<id>.");
  return { project, note };
}

const name = (value: unknown) => (typeof value === "string" && value.trim() ? value : null);

const versionId = (value: unknown) => {
  if (typeof value !== "string" || !value) throw new ApiError(400, "Send versionId.");
  return value;
};

export function GET(request: Request) {
  return withApi(request, "read", async () => {
    const { project, note } = params(request);
    return json(await listMobileHistory(project, note));
  });
}

export function POST(request: Request) {
  return withApi(request, "write", async () => {
    const { project, note } = params(request);
    const input = await body<{ action?: unknown; name?: unknown; versionId?: unknown }>(request);
    switch (input.action) {
      case "save":
        return json(await saveMobileVersion(project, note, name(input.name)));
      case "rename":
        await renameMobileVersion(project, versionId(input.versionId), name(input.name));
        return json({ ok: true });
      case "delete":
        await deleteMobileVersion(project, versionId(input.versionId));
        return json({ ok: true });
      case "restore":
        await restoreMobileVersion(project, note, versionId(input.versionId));
        return json({ ok: true });
      default:
        throw new ApiError(400, 'action must be "save", "rename", "delete" or "restore".');
    }
  });
}
