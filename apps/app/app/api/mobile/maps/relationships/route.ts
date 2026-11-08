import { ApiError, body, json, read, withApi } from "@/lib/api/handler";
import { createRelationship, deleteRelationship, getStory, updateRelationship } from "@/lib/story-actions";

// The relationship map on the phone, through the web's own story actions
// (lib/story-actions.ts), so the same access checks apply.
//
// GET  /api/mobile/maps/relationships?project=<id>: { relationships }.
// POST /api/mobile/maps/relationships { project, action, … }:
//   create { fromNodeId, toNodeId, type, label? }, update { id, type?, label?, reverse? }, delete { id }.

export function GET(request: Request) {
  const project = new URL(request.url).searchParams.get("project");
  return withApi(request, "read", async () => {
    if (!project) throw new ApiError(400, "Say which project: ?project=<id>.");
    const story = await read(() => getStory(project));
    return json({ relationships: story.relationships });
  });
}

type Input = { project?: unknown; action?: unknown; id?: unknown; fromNodeId?: unknown; toNodeId?: unknown; type?: unknown; label?: unknown; reverse?: unknown };

const text = (value: unknown, what: string) => {
  if (typeof value !== "string" || !value) throw new ApiError(400, `Send ${what}.`);
  return value;
};
const label = (value: unknown) => (typeof value === "string" ? value : value === null ? null : undefined);

export function POST(request: Request) {
  return withApi(request, "write", async () => {
    const input = await body<Input>(request);
    const project = text(input.project, "project");
    if (input.action === "create") {
      const relationship = await createRelationship(project, {
        fromNodeId: text(input.fromNodeId, "fromNodeId"),
        toNodeId: text(input.toNodeId, "toNodeId"),
        type: text(input.type, "type"),
        label: label(input.label),
      });
      return json({ relationship }, 201);
    }
    if (input.action === "update") {
      const relationship = await updateRelationship(project, text(input.id, "id"), {
        ...(typeof input.type === "string" && { type: input.type }),
        ...(label(input.label) !== undefined && { label: label(input.label) }),
        ...(input.reverse === true && { reverse: true }),
      });
      return json({ relationship });
    }
    if (input.action === "delete") {
      await deleteRelationship(project, text(input.id, "id"));
      return json({ ok: true });
    }
    throw new ApiError(400, "Send action: create, update or delete.");
  });
}
