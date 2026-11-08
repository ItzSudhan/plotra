"use client";

import { Icon } from "@plotra/icons";
import { Button } from "@plotra/ui/components/button";
import { confirm } from "@plotra/ui/components/dialogs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@plotra/ui/components/dropdown-menu";
import { Switch } from "@plotra/ui/components/switch";
import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { pluginNextStep } from "@/components/plugins/next-step";
import { errorText } from "@/lib/errors";
import { isLocalMode } from "@/lib/local-mode";
import { addPlugin, getPluginCode, removePlugin, setPluginEnabled, updatePluginCode, type PluginRow } from "@/lib/plugin-actions";
import { asksForMore } from "@/lib/plugin-store";
import { setListingWithdrawn, updateInstalledPlugin } from "@/lib/plugin-store-actions";
import { MAX_PLUGIN_CODE } from "@/lib/plugins";
import { ConfirmDialog } from "./confirm-dialog";
import { PageForm, PublishForm, VersionForm } from "./plugin-store-forms";
import { List, Section, textareaClass } from "./ui";
import { useRun } from "./use-run";

// Your settings → Plugins (lib/plugins.ts): a person's own scripts, added
// from a .js file or pasted in, or installed from the plugin store
// (plugin-store-plan.md); switched on and off, changed, updated, published or
// removed. They run in every project the person opens, sandboxed
// (lib/plugin-sandbox.ts). The desktop app installs from plotra.ink's store
// and doesn't publish (lib/plugin-store-remote.ts).

const STARTER = `// ==Plotra plugin==
// @name        Word count by chapter
// @description A command that lists each chapter's words
// @version     1.0
// @access      read
// ==/Plotra plugin==

plotra.registerCommand({
  id: "count-chapters",
  title: "Count words by chapter",
  async run() {
    const notes = await plotra.notes.list();
    const chapters = notes.filter((note) => note.kind === "chapter");
    plotra.ui.toast(chapters.map((c) => c.title + ": " + c.wordCount).join(", ") || "No chapters yet.");
  },
});
`;

const size = (characters: number) => (characters < 1000 ? `${characters} characters` : `${Math.round(characters / 100) / 10} KB`);
const READ_LIMIT = MAX_PLUGIN_CODE * 4;

export function PluginsSettings({ plugins }: { plugins: PluginRow[] }) {
  const { run, pending } = useRun();
  const [pasting, setPasting] = useState(false);
  const [code, setCode] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const applies = pluginNextStep();

  const fromFile = async (picked: File | undefined) => {
    if (!picked) return;
    if (picked.size > READ_LIMIT) return toast.error("That file is too big to be a plugin.");
    const text = await picked.text();
    await run(() => addPlugin({ code: text, fileName: picked.name }), `Plugin added. ${applies}`);
  };

  const fromPaste = async () => {
    const done = await run(() => addPlugin({ code }), `Plugin added. ${applies}`);
    if (!done) return;
    setCode("");
    setPasting(false);
  };

  return (
    <div id="plugins" className="scroll-mt-8">
      <Section
        title="Plugins"
        description="Plugins add extra tools to Plotra: a new command, a panel beside your writing, another way to export. A plugin only sees the project you have open and can't reach the internet, and you can switch it off or remove it at any time."
        action={
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <Button asChild size="sm">
              <Link href="/plugins">
                <Icon name="magnifer-linear" className="size-3.5" />
                Browse plugins
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" size="sm" variant="outline" disabled={pending}>
                  Add your own…
                  <Icon name="alt-arrow-down-linear" className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="text-meta font-normal text-muted-foreground">For developers: add a plugin you wrote, or one you trust</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => setPasting(true)}>
                  <Icon name="code-linear" />
                  Paste code
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => file.current?.click()}>
                  <Icon name="upload-linear" />
                  Add from a file
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <input
              ref={file}
              type="file"
              accept=".js,.mjs,text/javascript"
              className="hidden"
              onChange={(event) => {
                const picked = event.target.files?.[0];
                event.target.value = "";
                void fromFile(picked);
              }}
            />
          </div>
        }
      >
        {pasting && (
          <div className="grid gap-2 rounded-lg border bg-card p-4">
            <textarea
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder={STARTER}
              spellCheck={false}
              aria-label="The plugin's code"
              className={`${textareaClass} min-h-56 font-mono text-meta`}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" disabled={pending || !code.trim()} onClick={() => void fromPaste()}>
                Add plugin
              </Button>
              {!code.trim() && (
                <Button type="button" size="sm" variant="ghost" onClick={() => setCode(STARTER)}>
                  Start from an example
                </Button>
              )}
              <Button type="button" size="sm" variant="ghost" onClick={() => setPasting(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        <List empty="No plugins yet. Browse plugins to find extra tools for your projects.">
          {plugins.map((plugin) => (
            <PluginItem key={plugin.id} plugin={plugin} pending={pending} run={run} applies={applies} />
          ))}
        </List>
      </Section>
    </div>
  );
}

function PluginItem({ plugin, pending, run, applies }: { plugin: PluginRow; pending: boolean; run: ReturnType<typeof useRun>["run"]; applies: string }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<"publish" | "version" | "page" | null>(null);
  const store = plugin.store;
  // Installed from someone else's listing: editing it makes it the person's own copy.
  const installed = store !== null && !store.own && !store.blocked;

  const edit = async () => {
    setLoading(true);
    try {
      setEditing(await getPluginCode(plugin.id));
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (editing === null) return;
    const done = await run(() => updatePluginCode(plugin.id, editing), installed ? `Saved as your own copy. ${applies}` : `Saved. ${applies}`);
    if (done) setEditing(null);
  };

  const update = () => run(() => updateInstalledPlugin(plugin.id), `${plugin.name} is now version ${store?.latest?.version}. ${applies}`);

  return (
    <li className="grid gap-2 px-3 py-2.5">
      {/* On a phone the buttons drop below the name rather than squeezing it. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Icon name="plug-circle-linear" className="size-4 shrink-0 text-faint" />
        <div className="min-w-0 flex-1 basis-48">
          <p className="truncate font-medium">
            {plugin.name}
            {plugin.version && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{plugin.version}</span>}
          </p>
          <p className="text-xs break-words text-muted-foreground sm:truncate">
            {plugin.description ? `${plugin.description} · ` : ""}
            {plugin.access === "read" ? "Reads only · " : ""}
            {store && !store.blocked && (
              <>
                <Link href={`/plugins/${store.slug}`} className="underline-offset-2 hover:text-foreground hover:underline">
                  {store.own ? (store.withdrawn ? "Withdrawn from the store" : "In the store") : "From the store"}
                </Link>
                {" · "}
              </>
            )}
            {size(plugin.size)}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          {store?.update && store.latest && (
            asksForMore(plugin.access, store.latest.access) ? (
              <ConfirmDialog
                trigger={
                  <Button type="button" size="sm" variant="outline" disabled={pending}>
                    Update to {store.latest.version}
                  </Button>
                }
                title={`Update ${plugin.name}?`}
                description={`Version ${store.latest.version} asks for more: until now it could only read your notes, and now it can change them too. Read what changed on its page first.`}
                confirmLabel="Update"
                onConfirm={update}
              />
            ) : (
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => void update()}>
                Update to {store.latest.version}
              </Button>
            )
          )}
          <Button type="button" size="sm" variant="ghost" disabled={pending || loading} onClick={() => (editing === null ? void edit() : setEditing(null))}>
            {editing === null ? "Edit code" : "Close code"}
          </Button>
          <ConfirmDialog
            trigger={
              <Button type="button" size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive">
                Remove
              </Button>
            }
            title={`Remove “${plugin.name}”?`}
            description={
              store?.own
                ? "Its commands, panels and exports go from every project. It stays in the store, and you can install it back from there. What it already wrote in your notes stays."
                : "Its commands, panels and exports go from every project. What it already wrote in your notes stays."
            }
            confirmLabel="Remove"
            onConfirm={() => run(() => removePlugin(plugin.id), "Plugin removed.")}
          />
          <Switch
            checked={plugin.enabled}
            disabled={pending}
            aria-label={plugin.enabled ? `Switch ${plugin.name} off` : `Switch ${plugin.name} on`}
            onCheckedChange={(enabled) => void run(() => setPluginEnabled(plugin.id, enabled), enabled ? `On. ${applies}` : "Off.")}
          />
        </div>
      </div>

      {store?.blocked && (
        <p className="flex items-center gap-1.5 text-xs text-destructive">
          <Icon name="danger-circle-linear" className="size-3.5 shrink-0" />
          {store.own
            ? "Taken down from the store after a report. Copies people installed no longer run. If you think that's a mistake, get in touch with the people who run Plotra."
            : "Taken down from the store after a report, so it no longer runs. Remove it."}
        </p>
      )}

      {!isLocalMode && !store && (
        <div className="flex flex-wrap gap-2 pl-7">
          <Button type="button" size="xs" variant="ghost" className="px-2" disabled={pending} onClick={() => setForm(form === "publish" ? null : "publish")}>
            Publish to the store
          </Button>
        </div>
      )}
      {!isLocalMode && store?.own && !store.blocked && (
        <div className="flex flex-wrap gap-2 pl-7">
          {store.changed && (
            <Button type="button" size="xs" variant="ghost" className="px-2" disabled={pending} onClick={() => setForm(form === "version" ? null : "version")}>
              Publish version {plugin.version}
            </Button>
          )}
          <Button type="button" size="xs" variant="ghost" className="px-2" disabled={pending} onClick={() => setForm(form === "page" ? null : "page")}>
            Edit its store page
          </Button>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className="px-2"
            disabled={pending}
            onClick={async () => {
              if (store.withdrawn) return void run(() => setListingWithdrawn(store.slug, false), "Back in the store.");
              const ok = await confirm({
                title: `Withdraw ‘${plugin.name}’ from the store?`,
                description: "People can no longer find or install it. Copies already installed keep working. You can put it back at any time.",
                confirmLabel: "Withdraw",
              });
              if (ok) void run(() => setListingWithdrawn(store.slug, true), "Out of the store. Copies already installed keep working.");
            }}
          >
            {store.withdrawn ? "Put back in the store" : "Withdraw from the store"}
          </Button>
        </div>
      )}
      {form === "publish" && <PublishForm plugin={plugin} run={run} pending={pending} onDone={() => setForm(null)} />}
      {form === "version" && <VersionForm plugin={plugin} run={run} pending={pending} onDone={() => setForm(null)} />}
      {form === "page" && store?.page && <PageForm slug={store.slug} page={store.page} run={run} pending={pending} onDone={() => setForm(null)} />}

      {editing !== null && (
        <div className="grid gap-2">
          {installed && <p className="text-xs text-muted-foreground">Saving a change makes this your own copy: it leaves the store, and gets no more updates from its author.</p>}
          <textarea value={editing} onChange={(event) => setEditing(event.target.value)} spellCheck={false} aria-label={`${plugin.name}'s code`} className={`${textareaClass} min-h-72 font-mono text-meta`} />
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={pending || !editing.trim()} onClick={() => void save()}>
              Save
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
