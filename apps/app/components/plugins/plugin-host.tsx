"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { useStore } from "@/components/workspace/stores";
import { errorText } from "@/lib/errors";
import { loadPlugins, pluginCall, type PluginCode } from "@/lib/plugin-actions";
import { cleanPartId, isBrowserMethod, isServerMethod } from "@/lib/plugins";
import { pluginDocument, readTheme, type FromPlugin, type PluginContext, type PluginMode, type ToPlugin } from "@/lib/plugin-sandbox";
import { isTrashed } from "@/lib/tree";
import { panelKey, savePluginFile, type PluginPart } from "./plugin-registry";

// Runs the person's plugins in the open project (lib/plugins.ts): one hidden
// frame per plugin that's on, where it registers its commands, panels and
// exports, and a visible frame per open panel (plugin-panel.tsx). Every frame
// is answered here: project calls go to the server as the person
// (lib/plugin-actions.ts `pluginCall`), the rest the workspace answers itself.

/** The most calls one frame may have waiting at once. */
const MAX_IN_FLIGHT = 50;
/** How long a command or an export may take before it's given up on. */
const RUN_TIMEOUT_MS = 5 * 60_000;

export function PluginHost() {
  const { plugins: registry } = useWorkspace();
  const generation = useStore(registry.generation);
  const loaded = useStore(registry.plugins);

  useEffect(() => {
    let live = true;
    loadPlugins().then(
      (rows) => live && registry.plugins.set(rows),
      () => live && registry.plugins.set([]),
    );
    return () => {
      live = false;
    };
  }, [generation, registry]);

  if (!loaded?.length) return null;
  return (
    // Out of sight but laid out: some browsers hold back frames that aren't displayed.
    <div aria-hidden className="pointer-events-none fixed top-0 left-0 size-0 overflow-hidden opacity-0">
      {loaded.map((plugin) => (
        <PluginFrame key={`${plugin.id}:${generation}`} plugin={plugin} mode="background" />
      ))}
    </div>
  );
}

/** One plugin's frame: in the background, or drawing one of its panels. */
export function PluginFrame({ plugin, mode, panel, className }: { plugin: PluginCode; mode: PluginMode; panel?: string; className?: string }) {
  const { project, user, plugins: registry, activeNodeId, binder, openNode, openView } = useWorkspace();
  const router = useRouter();
  const ref = useRef<HTMLIFrameElement>(null);
  const [doc, setDoc] = useState<string | null>(null);
  // The listener below lives as long as the frame; what it opens with is read when it's needed.
  const opener = useRef({ openNode, openView });
  useEffect(() => {
    opener.current = { openNode, openView };
  }, [openNode, openView]);

  useEffect(() => {
    let live = true;
    const context: PluginContext = { pluginId: plugin.id, mode, panel: panel ?? null, project: { id: project.id, title: project.title, type: project.type }, user: { name: user.name } };
    pluginDocument(plugin.code, context, readTheme()).then(
      (made) => live && setDoc(made),
      (error) => {
        console.error(`[plotra] couldn't start the plugin ${plugin.name}`, error);
        if (live && mode === "background")
          toast.error(`The plugin ${plugin.name} couldn't start`, {
            id: "plugin-start",
            description: "Its tools won't show up for now. Your writing isn't affected. You can switch it off or update it in Your settings.",
            action: { label: "Open plugin settings", onClick: () => router.push("/settings#plugins") },
          });
      },
    );
    return () => {
      live = false;
    };
  }, [mode, panel, plugin.code, plugin.id, plugin.name, project.id, project.title, project.type, user.name, router]);

  // Listens from the start, before the frame exists, so nothing it says first is missed.
  useEffect(() => {
    const post = (message: ToPlugin) => ref.current?.contentWindow?.postMessage(message, "*");
    const runs = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
    let nextRun = 1;
    let inFlight = 0;
    const toasts: number[] = [];

    const browserCall = (method: string, args: unknown[]): unknown => {
      switch (method) {
        case "notes.active":
          return activeNodeId.get();
        case "ui.toast": {
          const now = Date.now();
          while (toasts.length && now - toasts[0] > 10_000) toasts.shift();
          if (toasts.length >= 5) return false;
          toasts.push(now);
          const text = String(args[0] ?? "").slice(0, 300);
          const options = { description: `From ${plugin.name}` };
          if (args[1] === "error") toast.error(text, options);
          else if (args[1] === "success") toast.success(text, options);
          else toast(text, options);
          return true;
        }
        case "ui.download":
          savePluginFile(String(args[0] ?? ""), args[1], String(args[2] ?? ""));
          return true;
        case "ui.openNote": {
          const id = String(args[0] ?? "");
          const { index } = binder.get();
          if (!index.byId.has(id) || isTrashed(index, id)) throw new Error("There's no such note in this project.");
          opener.current.openNode(id, "tab");
          return true;
        }
        case "ui.openPanel": {
          const name = cleanPartId(args[0]);
          const part = registry.parts.get().find((p) => p.pluginId === plugin.id && p.what === "panel" && p.name === name);
          if (!part) throw new Error("This plugin has no panel with that id. Register it first.");
          opener.current.openView("plugin", { panel: panelKey(plugin.id, part.name), title: part.title });
          return true;
        }
      }
      throw new Error(`Plugins can't call ${method.slice(0, 40)}.`);
    };

    const answer = async (id: number, method: unknown, rawArgs: unknown): Promise<ToPlugin> => {
      if (inFlight >= MAX_IN_FLIGHT) return { plotra: 1, type: "result", id, ok: false, error: "Too many calls at once. Wait for some to finish." };
      inFlight++;
      try {
        const args = Array.isArray(rawArgs) ? rawArgs : [];
        if (isServerMethod(method)) {
          const result = await pluginCall(project.id, plugin.id, method, args);
          return result.ok ? { plotra: 1, type: "result", id, ok: true, value: result.value } : { plotra: 1, type: "result", id, ok: false, error: result.error };
        }
        if (isBrowserMethod(method)) return { plotra: 1, type: "result", id, ok: true, value: browserCall(method, args) ?? null };
        throw new Error(`Plugins can't call ${String(method).slice(0, 40)}.`);
      } catch (error) {
        return { plotra: 1, type: "result", id, ok: false, error: errorText(error, "That didn't work.") };
      } finally {
        inFlight--;
      }
    };

    const register = (message: Extract<FromPlugin, { type: "register" }>) => {
      const name = cleanPartId(message.name);
      const what = message.what;
      if (!name || (what !== "command" && what !== "export" && what !== "panel") || typeof message.title !== "string" || !message.title.trim()) return;
      const part: PluginPart = { pluginId: plugin.id, pluginName: plugin.name, what, name, title: message.title.trim().slice(0, 80) };
      if (what === "export") part.extension = typeof message.extension === "string" && /^[a-z0-9]{1,10}$/i.test(message.extension) ? message.extension.toLowerCase() : "txt";
      registry.add(part);
    };

    const onMessage = (event: MessageEvent) => {
      const frame = ref.current?.contentWindow;
      if (!frame || event.source !== frame) return;
      const message = event.data as FromPlugin | null;
      if (!message || typeof message !== "object" || message.plotra !== 1) return;
      if (message.type === "call" && Number.isInteger(message.id)) void answer(message.id, message.method, message.args).then(post);
      else if (message.type === "register" && mode === "background") register(message);
      else if (message.type === "done") {
        const run = runs.get(message.id);
        if (!run) return;
        runs.delete(message.id);
        if (message.ok) run.resolve(message.value);
        else run.reject(new Error(String(message.error ?? "That didn't work.")));
      } else if (message.type === "error") console.warn(`[plugin: ${plugin.name}]`, String(message.message).slice(0, 300));
    };
    window.addEventListener("message", onMessage);

    const detach =
      mode === "background"
        ? registry.attach(
            plugin.id,
            (what, name) =>
              new Promise((resolve, reject) => {
                const id = nextRun++;
                const timer = setTimeout(() => {
                  runs.delete(id);
                  reject(new Error("It took too long, and was stopped waiting for."));
                }, RUN_TIMEOUT_MS);
                runs.set(id, {
                  resolve: (value) => {
                    clearTimeout(timer);
                    resolve(value);
                  },
                  reject: (error) => {
                    clearTimeout(timer);
                    reject(error);
                  },
                });
                post({ plotra: 1, type: "run", id, what, name });
              }),
          )
        : undefined;

    return () => {
      window.removeEventListener("message", onMessage);
      detach?.();
      for (const run of runs.values()) run.reject(new Error("The plugin stopped."));
      runs.clear();
    };
  }, [activeNodeId, binder, mode, plugin.id, plugin.name, project.id, registry]);

  if (!doc) return null;
  return <iframe ref={ref} title={`${plugin.name} (plugin)`} sandbox="allow-scripts" srcDoc={doc} className={className ?? "size-0 border-0"} />;
}
