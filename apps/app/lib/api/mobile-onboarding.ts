import "server-only";
import { auth } from "@plotra/auth";
import { authErrorText } from "../auth-errors";
import { cloudOnly } from "../local-mode";
import { rateLimit } from "../rate-limit";
import { createSampleProject } from "../sample-actions";
import { sampleCatalog } from "../samples";
import { slugify } from "../slug";
import { withAuthHeaders } from "./auth-session";
import { ApiError } from "./handler";
import { listApiProjects } from "./notes";

// The phone app's first run (apps/mobile/src/app/onboarding.tsx), doing what
// the web's Cold Open does for a new account: a first workspace, named for
// the person, and a first project, which may be one of the samples. The
// workspace goes through Better Auth like the web's (organization.create),
// with the brief session an API request gets (./auth-session.ts).

export const onboardingSamples = () => sampleCatalog.map((s) => ({ id: s.id, type: s.type, label: s.label, description: s.description }));

/** A first workspace. Addresses are shared by everyone, so a taken one is tried again with a few letters added, as the web does. */
export async function createFirstWorkspace(name: string, userId: string): Promise<{ slug: string; name: string }> {
  cloudOnly("Making a workspace");
  const clean = name.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!clean) throw new ApiError(400, "Give your workspace a name.");
  await rateLimit("mobile-workspace", userId, { limit: 10, windowSeconds: 3600 });
  const base = slugify(clean.replace(/['’]/g, "")) || "workspace";
  const attempt = (slug: string) => withAuthHeaders(new Headers(), (h) => auth.api.createOrganization({ body: { name: clean, slug }, headers: h }));
  try {
    await attempt(base);
    return { slug: base, name: clean };
  } catch {
    const slug = `${base.slice(0, 42)}-${Math.random().toString(36).slice(2, 6)}`;
    try {
      await attempt(slug);
      return { slug, name: clean };
    } catch (error) {
      const e = error as { body?: { code?: string; message?: string }; message?: string };
      throw new ApiError(400, authErrorText({ ...e.body, message: e.body?.message ?? e.message }) || "Couldn't make your workspace. Try again.");
    }
  }
}

/** One of the samples, in a workspace; the project it made. */
export async function createSample(workspaceSlug: string, sampleId: string): Promise<{ projectId: string; title: string }> {
  const { href } = await createSampleProject(workspaceSlug, sampleId);
  const slug = /\/p\/([^/?#]+)/.exec(href)?.[1];
  const made = (await listApiProjects()).find((p) => p.workspaceSlug === workspaceSlug && p.slug === slug);
  if (!made) throw new ApiError(500, "The sample was made, but couldn't be found. Pull to refresh your library.");
  return { projectId: made.id, title: made.title };
}
