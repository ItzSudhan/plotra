import type { ProjectRole } from "@plotra/db/schema";
import { ApiError, body, json, withApi } from "@/lib/api/handler";
import { publicPath } from "@/lib/public-link";
import {
  createShareLink,
  deleteShareLink,
  getSharing,
  listShareLinks,
  removeProjectMember,
  resetShareLink,
  setProjectMemberRole,
  shareProject,
  updateShareLink,
  type ShareLinkState,
} from "@/lib/share-actions";

// Sharing a project from the phone app: the web's Share dialog
// (components/workspace/share-dialog.tsx, share-link-section.tsx) through the
// same actions in lib/share-actions.ts, which check `manage` themselves.
//
// GET  ?project=<id>                → { sharing, links }
// POST { project, action, ... }     → { ok, ... }

const withPath = (link: ShareLinkState) => ({ ...link, path: publicPath(link.token) });

export function GET(request: Request) {
  return withApi(request, "read", async () => {
    const projectId = new URL(request.url).searchParams.get("project");
    if (!projectId) throw new ApiError(400, "Say which project: ?project=<id>.");
    const [sharing, links] = await Promise.all([getSharing(projectId), listShareLinks(projectId)]);
    return json({ sharing, links: links.map(withPath) });
  });
}

type Input = {
  project?: unknown;
  action?: unknown;
  email?: unknown;
  role?: unknown;
  memberId?: unknown;
  linkId?: unknown;
  name?: unknown;
  enabled?: unknown;
  horizonReleaseId?: unknown;
};

const text = (value: unknown, what: string) => {
  if (typeof value !== "string" || !value) throw new ApiError(400, `Send ${what}.`);
  return value;
};

export function POST(request: Request) {
  return withApi(request, "write", async () => {
    const input = await body<Input>(request);
    const projectId = text(input.project, "project");
    switch (input.action) {
      case "share": {
        const { pending } = await shareProject(projectId, text(input.email, "an email address"), text(input.role, "a role") as ProjectRole);
        return json({ ok: true, pending });
      }
      case "role":
        await setProjectMemberRole(projectId, text(input.memberId, "memberId"), text(input.role, "a role") as ProjectRole);
        return json({ ok: true });
      case "remove":
        await removeProjectMember(projectId, text(input.memberId, "memberId"));
        return json({ ok: true });
      case "link-create":
        return json({ ok: true, link: withPath(await createShareLink(projectId, { name: typeof input.name === "string" ? input.name : null })) });
      case "link-update": {
        const patch = {
          ...(typeof input.enabled === "boolean" && { enabled: input.enabled }),
          ...(input.horizonReleaseId !== undefined && { horizonReleaseId: typeof input.horizonReleaseId === "string" ? input.horizonReleaseId : null }),
          ...(input.name !== undefined && { name: typeof input.name === "string" ? input.name : null }),
        };
        return json({ ok: true, link: withPath(await updateShareLink(projectId, text(input.linkId, "linkId"), patch)) });
      }
      case "link-reset":
        return json({ ok: true, link: withPath(await resetShareLink(projectId, text(input.linkId, "linkId"))) });
      case "link-delete":
        await deleteShareLink(projectId, text(input.linkId, "linkId"));
        return json({ ok: true });
      default:
        throw new ApiError(400, "Unknown action. Use share, role, remove, link-create, link-update, link-reset or link-delete.");
    }
  });
}
