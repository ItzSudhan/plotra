"use client";

import { toast } from "sonner";
import type { BinderStore } from "@/components/workspace/stores";
import { plainTitle, sectionsToFountain, type FountainSection, type TitlePage } from "@/lib/fountain";
import { read } from "@/lib/read";
import { importFountain } from "@/lib/script-actions";
import { ancestors, lastPosition, type BinderNode } from "@/lib/tree";
import { errorText } from "@/lib/errors";
import { reached } from "@/components/onboarding/reached";
import { plural } from "@/lib/plural";

// Fountain in and out of the binder (plan.md 2.7): the file picker and the
// download. The format itself is lib/fountain.ts; the import writes nodes in
// lib/script-actions.ts.

const errorMessage = (error: unknown) => errorText(error);

function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/**
 * Asks for a .fountain file and imports it as a folder of scenes at the top of
 * the binder. Returns the new folder, or undefined when nothing was imported.
 */
export async function importFountainFile({
  projectId,
  binder,
  track,
  announce,
}: {
  projectId: string;
  binder: BinderStore;
  track: <T>(write: Promise<T>) => Promise<T>;
  announce: () => void;
}): Promise<BinderNode | undefined> {
  const file = await pickFile(".fountain,.spmd,.txt,text/plain");
  if (!file) return;
  try {
    const source = await file.text();
    const position = lastPosition(binder.get().index, null);
    const created = await track(importFountain(projectId, { parentId: null, position, fileName: file.name, source }));
    binder.upsert(...created);
    announce();
    const folder = created.find((n) => n.parentId === null && n.kind === "folder");
    const scenes = created.filter((n) => n.kind === "scene").length;
    toast.success(`Imported “${folder?.title ?? file.name}”: ${scenes} ${plural(scenes, "scene")}.`);
    return folder;
  } catch (error) {
    toast.error(errorMessage(error));
  }
}

/** The title page stored with an imported script (on its folder), if this note is in one. */
export function storedTitlePage(node: BinderNode | undefined, above: BinderNode[]): TitlePage | null {
  for (const n of [node, ...[...above].reverse()]) {
    const raw = n?.settings.titlePage;
    if (typeof raw !== "string") continue;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed as TitlePage;
    } catch {}
  }
  return null;
}

/**
 * Downloads a folder, chapter or scene (or, with no `rootId`, the whole
 * project) as a .fountain file: scenes and script documents in binder order,
 * folders and chapters as sections. Content is as last synced.
 */
export async function exportFountainFile({
  projectId,
  projectTitle,
  author,
  binder,
  rootId,
}: {
  projectId: string;
  projectTitle: string;
  author: string;
  binder: BinderStore;
  rootId: string | null;
}) {
  try {
    const { index } = binder.get();
    const root = rootId ? index.byId.get(rootId) : undefined;
    const manuscript = await read("getManuscript", projectId, root?.id ?? null);

    // What belongs in a script: the scenes, anything written in a script format, and the folders that hold them.
    const structural = (kind: string) => kind === "folder" || kind === "chapter";
    const sections: FountainSection[] = [];
    manuscript.forEach((s, i) => {
      const depth = root ? s.depth : s.depth + 1;
      const isRoot = Boolean(root) && i === 0;
      if (structural(s.kind) && !isRoot) {
        // A folder with no script under it (characters, research) stays out.
        let holds = false;
        for (let j = i + 1; j < manuscript.length && manuscript[j].depth > s.depth && !holds; j++) {
          holds = manuscript[j].kind === "scene" || manuscript[j].format !== "prose";
        }
        if (!holds) return;
      } else if (!isRoot && s.kind !== "scene" && s.format === "prose") return;
      sections.push({ title: s.title, kind: s.kind, depth, synopsis: index.byId.get(s.id)?.synopsis, value: s.value });
    });
    if (!sections.some((s) => s.value.length)) {
      toast.message("There's nothing written here to export yet.");
      return;
    }

    const title = root?.title ?? projectTitle;
    const stored = storedTitlePage(root, root ? ancestors(index, root.id) : []);
    // An imported title page is kept as it was written, unless the script has been renamed since.
    const titlePage: TitlePage = stored ? { ...stored, ...(plainTitle(stored) !== title && { Title: title }) } : { Title: title, Author: author };
    const text = sectionsToFountain(sections, titlePage, { resolveLink: (id) => index.byId.get(id)?.title });

    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title.replace(/[\\/:*?"<>|]+/g, " ").trim() || "script"}.fountain`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    reached("fountain");
  } catch (error) {
    toast.error(errorMessage(error));
  }
}
