"use server";

import { redirect } from "next/navigation";
import { requireSession, requireWorkspace } from "./data";
import { publicMessage } from "./errors";
import { startEmptyProject } from "./new-project";

export type CreateProjectState = { error?: string } | null;

export async function createProject(
  workspaceSlug: string,
  _: CreateProjectState,
  formData: FormData,
): Promise<CreateProjectState> {
  // Signed out or not a member: redirect or 404 as before, not a message in the form.
  await requireSession();
  await requireWorkspace(workspaceSlug);
  let created: Awaited<ReturnType<typeof startEmptyProject>>;
  try {
    created = await startEmptyProject(workspaceSlug, { title: formData.get("title"), type: formData.get("type") ?? "novel" });
  } catch (error) {
    return { error: publicMessage(error) };
  }
  redirect(`/w/${created.workspaceSlug}/p/${created.slug}?open=${created.sceneId}`);
}
