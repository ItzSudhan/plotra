"use client";

import Link from "next/link";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { useStore } from "@/components/workspace/stores";
import { PluginFrame } from "./plugin-host";

/**
 * A plugin's panel in a pane (lib/plugins.ts `registerPanel`): its own frame,
 * running the plugin's code with `plotra.panel` set, so the code draws the
 * panel instead of registering. `panel` is "<plugin id>:<panel id>".
 */
export function PluginPanelView({ panel }: { panel?: string }) {
  const loaded = useStore(useWorkspace().plugins.plugins);
  const [pluginId, name] = (panel ?? "").split(":");
  if (!loaded) return <p className="p-6 text-sm text-muted-foreground">Starting plugins…</p>;
  const plugin = loaded.find((p) => p.id === pluginId);
  if (!plugin || !name)
    return (
      <div className="grid gap-1 p-6 text-sm text-muted-foreground">
        <p>This panel&apos;s plugin is off, or was removed.</p>
        <p>
          <Link href="/settings#plugins" className="underline underline-offset-4 hover:text-foreground">
            Manage plugins in Your settings
          </Link>
        </p>
      </div>
    );
  return <PluginFrame key={`${plugin.id}:${name}`} plugin={plugin} mode="panel" panel={name} className="block size-full border-0" />;
}
