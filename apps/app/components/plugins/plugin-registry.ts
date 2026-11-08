"use client";

import { toast } from "sonner";
import { Store } from "@/components/workspace/stores";
import { errorText } from "@/lib/errors";
import type { PluginCode } from "@/lib/plugin-actions";
import { cleanDownloadName, cleanDownloadType, MAX_DOWNLOAD } from "@/lib/plugins";
import { slugify } from "@/lib/slug";

// What the person's plugins have added to the open project (lib/plugins.ts):
// commands, panels and export formats, each named by its plugin. The
// workspace keeps one of these; the plugin host (plugin-host.tsx) fills it
// and runs what's chosen; the command palette and the plugin view read it.

export type PluginPart = {
  pluginId: string;
  pluginName: string;
  what: "command" | "export" | "panel";
  /** The plugin's own id for it. */
  name: string;
  title: string;
  /** An export's file extension. */
  extension?: string;
};

/** Runs a plugin's command or export in its frame; resolves to what it returned. */
export type PluginRunner = (what: "command" | "export", name: string) => Promise<unknown>;

/** A plugin panel's id in a pane: the plugin, then its panel. */
export const panelKey = (pluginId: string, name: string) => `${pluginId}:${name}`;

export const MAX_PARTS_PER_PLUGIN = 50;

export class PluginRegistry {
  /** The plugins that are on, once loaded; null until then. */
  readonly plugins = new Store<PluginCode[] | null>(null);
  readonly parts = new Store<PluginPart[]>([]);
  /** Bumped to load the plugins again, after they change in Your settings. */
  readonly generation = new Store(0);
  private runners = new Map<string, PluginRunner>();

  add(part: PluginPart) {
    this.parts.set((all) => {
      const same = (p: PluginPart) => p.pluginId === part.pluginId && p.what === part.what && p.name === part.name;
      if (all.some(same)) return all.map((p) => (same(p) ? part : p));
      if (all.filter((p) => p.pluginId === part.pluginId).length >= MAX_PARTS_PER_PLUGIN) return all;
      return [...all, part];
    });
  }

  attach(pluginId: string, runner: PluginRunner) {
    this.runners.set(pluginId, runner);
    return () => {
      if (this.runners.get(pluginId) === runner) this.runners.delete(pluginId);
      this.parts.set((all) => all.filter((p) => p.pluginId !== pluginId));
    };
  }

  run(pluginId: string, what: "command" | "export", name: string): Promise<unknown> {
    const runner = this.runners.get(pluginId);
    if (!runner) return Promise.reject(new Error("That plugin isn't running. Check it's switched on in Your settings → Plugins, then reload the page."));
    return runner(what, name);
  }

  reload() {
    this.parts.set([]);
    this.plugins.set(null);
    this.generation.set((n) => n + 1);
  }
}

/** Saves what a plugin handed over as a file in the person's downloads. */
export function savePluginFile(name: string, content: unknown, type: string) {
  const bytes = typeof content === "string" ? content : content instanceof ArrayBuffer || content instanceof Uint8Array ? content : null;
  if (bytes === null) throw new Error("A file's content must be text or bytes.");
  const size = typeof bytes === "string" ? bytes.length : bytes.byteLength;
  if (size > MAX_DOWNLOAD) throw new Error("That's too big to save from a plugin.");
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: cleanDownloadType(type) }));
  const link = document.createElement("a");
  link.href = url;
  link.download = cleanDownloadName(name);
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Runs a command, or an export and saves what it made: `run` returns the
 * file's text, or `{ content, name, type }`. Says so when it fails.
 */
export async function runPluginPart(registry: PluginRegistry, part: PluginPart, projectTitle: string) {
  if (part.what === "panel") return;
  try {
    const value = await registry.run(part.pluginId, part.what, part.name);
    if (part.what !== "export") return;
    const file = (value && typeof value === "object" && !(value instanceof ArrayBuffer) && !(value instanceof Uint8Array) ? value : { content: value }) as { content?: unknown; text?: unknown; name?: unknown; type?: unknown };
    const extension = /^[a-z0-9]{1,10}$/i.test(part.extension ?? "") ? part.extension : "txt";
    const name = typeof file.name === "string" && file.name.trim() ? file.name : `${slugify(projectTitle) || "project"}.${extension}`;
    savePluginFile(name, file.content ?? file.text, typeof file.type === "string" ? file.type : "");
  } catch (error) {
    toast.error(`${part.pluginName}: ${errorText(error)}`);
  }
}
