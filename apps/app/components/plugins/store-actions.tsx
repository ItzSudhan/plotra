"use client";

import { Icon } from "@plotra/icons";
import { Button } from "@plotra/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@plotra/ui/components/dialog";
import Link from "next/link";
import { useState } from "react";
import { useRun } from "@/components/settings/use-run";
import { accessLabel, asksForMore } from "@/lib/plugin-store";
import { installPlugin, updateInstalledPlugin } from "@/lib/plugin-store-actions";
import { pluginNextStep } from "./next-step";

// Install, Update or Installed on a plugin's page in the store
// (app/plugins/[slug]). Installing first says what the plugin may do.

export function StoreActions({
  slug,
  name,
  access,
  version,
  releaseId,
  signedIn,
  mine,
  withdrawn,
  installed,
}: {
  slug: string;
  name: string;
  access: string;
  version: string;
  releaseId: string | null;
  signedIn: boolean;
  mine: boolean;
  withdrawn: boolean;
  installed: { pluginId: string; releaseId: string | null; access: string } | null;
}) {
  const { run, pending } = useRun();
  const [confirm, setConfirm] = useState<"install" | "update" | null>(null);
  // Set once this page installs or updates it, so the next step shows beside "Installed".
  const [done, setDone] = useState(false);

  const yours = (
    <Link href="/settings#plugins" className="text-ui-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
      In Your settings
    </Link>
  );

  if (!signedIn) {
    return (
      <Button asChild size="sm">
        <Link href={`/sign-in?callbackURL=${encodeURIComponent(`/plugins/${slug}`)}`}>Sign in to install</Link>
      </Button>
    );
  }
  if (mine) {
    return (
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-1.5 text-ui-sm text-muted-foreground">
          <Icon name="pen-linear" className="size-3.5" />
          You publish this one
        </span>
        {yours}
      </div>
    );
  }
  if (installed && (installed.releaseId === releaseId || installed.releaseId === null)) {
    return (
      <div className="grid max-w-xs justify-items-start gap-1.5">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-ui-sm text-muted-foreground">
            <Icon name="check-circle-linear" className="size-3.5" />
            {installed.releaseId === null ? "You have your own copy" : "Installed"}
          </span>
          {yours}
        </div>
        {done && (
          <p role="status" className="text-ui-sm text-muted-foreground">
            {pluginNextStep()}
          </p>
        )}
      </div>
    );
  }
  if (!installed && withdrawn) return <span className="text-ui-sm text-muted-foreground">Not available to install</span>;

  const more = installed ? asksForMore(installed.access, access) : false;
  const go = async () => {
    const ok = installed
      ? await run(() => updateInstalledPlugin(installed.pluginId), `${name} is now version ${version}.`)
      : await run(() => installPlugin(slug), `${name} installed.`);
    if (!ok) return;
    setConfirm(null);
    setDone(true);
  };

  return (
    <>
      <Button type="button" size="sm" disabled={pending} onClick={() => (installed && !more ? void go() : setConfirm(installed ? "update" : "install"))}>
        <Icon name={installed ? "refresh-linear" : "download-linear"} className="size-3.5" />
        {installed ? `Update to ${version}` : "Install"}
      </Button>
      <Dialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{confirm === "update" ? `Update ${name}?` : `Install ${name}?`}</DialogTitle>
            <DialogDescription asChild>
              <div className="grid gap-2 text-sm text-muted-foreground">
                {confirm === "update" ? (
                  <p>
                    <strong className="font-medium text-foreground">This version asks for more.</strong> Until now it could only read your notes. Version {version} can also change them, in any project you open.
                  </p>
                ) : (
                  <p>
                    It&apos;s added to every project you open, and in each one it only sees that project.{" "}
                    <strong className="font-medium text-foreground">{accessLabel(access)}</strong>
                    {access === "read" ? ": it can read the notes there, and Plotra stops it from changing them." : ": it can read, add and change the notes there, as you could."}
                  </p>
                )}
                <p>Plotra makes sure it can&apos;t reach the internet or see your other projects or your account. You can switch it off or remove it at any time in Your settings → Plugins.</p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button size="sm" disabled={pending} onClick={() => void go()}>
              {confirm === "update" ? "Update" : "Install"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
