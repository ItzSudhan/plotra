import { ApiError, body, json, withApi } from "@/lib/api/handler";
import { createFirstWorkspace, createSample, onboardingSamples } from "@/lib/api/mobile-onboarding";
import { requireSession } from "@/lib/data";

// The phone app's first run (lib/api/mobile-onboarding.ts).
// GET  → { samples: [{ id, type, label, description }] }
// POST { action: "workspace", name } → { slug, name }
// POST { action: "sample", workspace, sampleId } → { projectId, title }

export function GET(request: Request) {
  return withApi(request, "read", async () => json({ samples: onboardingSamples() }));
}

export function POST(request: Request) {
  return withApi(request, "write", async () => {
    const input = await body<{ action?: unknown; name?: unknown; workspace?: unknown; sampleId?: unknown }>(request);
    if (input.action === "workspace") {
      const { user } = await requireSession();
      return json(await createFirstWorkspace(typeof input.name === "string" ? input.name : "", user.id), 201);
    }
    if (input.action === "sample") {
      if (typeof input.workspace !== "string" || typeof input.sampleId !== "string") throw new ApiError(400, "Say which workspace and which sample.");
      return json(await createSample(input.workspace, input.sampleId), 201);
    }
    throw new ApiError(400, "Unknown action.");
  });
}
