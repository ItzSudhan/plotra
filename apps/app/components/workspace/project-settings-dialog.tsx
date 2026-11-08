"use client";

import { moduleIds, projectTypes, scriptFormats, type ModuleId, type ScriptFormat, type WorkflowStage } from "@plotra/db/schema";
import { moduleLabel } from "@/lib/vocabulary";
import { Icon, type IconName } from "@plotra/icons";
import { Button } from "@plotra/ui/components/button";
import { confirm } from "@plotra/ui/components/dialogs";
import { IconButton } from "@plotra/ui/components/icon-button";
import { undoToast } from "@plotra/ui/components/sonner";
import { Tooltip } from "@plotra/ui/components/tooltip";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@plotra/ui/components/dialog";
import { Pill } from "@plotra/ui/components/pill";
import { Switch } from "@plotra/ui/components/switch";
import { cn } from "@plotra/ui/lib/utils";
import { useRouter } from "next/navigation";
import { Fragment, startTransition, useEffect, useId, useOptimistic, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/settings/confirm-dialog";
import { nav } from "@/components/transitions";
import { CommitInput, CommitTextarea, errorText, fieldClass, Segmented } from "@/components/views/view-ui";
import { formatMeta, moduleMeta, typeFormat, typeModules } from "@/lib/modules";
import { deleteProject, updateProject, updateProjectSettings, type SettingsPatch, type WorldCandidate } from "@/lib/project-actions";
import { projectTypeMeta } from "@/lib/project-types";
import { read } from "@/lib/read";
import { slugify } from "@/lib/slug";
import { stagePresets } from "@/lib/stages";
import { swatches } from "@/lib/story";
import { defaultChannels } from "@/lib/world";
import { ChipInput } from "./properties";
import { Kinds, Labels, ManagersOnly, Words } from "./structure-settings";
import { GitHubSettings } from "./github-settings";
import { WebhooksSettings } from "./webhooks-settings";
import { LanguagePicker, LanguagesPicker } from "./language-picker";
import { NamedSwatches } from "./named-swatches";
import { colourName } from "./settings-helpers";
import { useUi, useWorkspace } from "./workspace-provider";
import { SelectField } from "@plotra/ui/components/select-field";

// Sections, in the rail's order. A group starts wherever it changes.
const tabs = [
  {
    id: "general",
    group: "Project",
    label: "General",
    icon: "settings-linear",
    blurb: "What the project is called, what kind of story it is, and how its new scenes start.",
  },
  {
    id: "modules",
    group: "Project",
    label: "Tools",
    icon: "widget-4-linear",
    blurb: "The tools this project uses, like the corkboard, the timeline or the world bible. The kind of story switches some on; any you switch yourself stay that way, even if the kind changes.",
  },
  {
    id: "workflow",
    group: "Project",
    label: "Workflow",
    icon: "clipboard-check-linear",
    blurb: "The stages every note moves through, from first draft to done. Each note's status is one of them.",
  },
  {
    id: "words",
    group: "Organise",
    label: "Rename things",
    icon: "text-field-focus-linear",
    blurb: "Call things what your medium calls them: a chapter can be a Session, the world bible the Wiki. The new names show everywhere in this project, for everyone in it.",
  },
  {
    id: "labels",
    group: "Organise",
    label: "Labels",
    icon: "hashtag-linear",
    blurb: "Marks a note can carry, apart from its status: “Needs research”, “Subplot”, “Cut?”. Give a note one in its details; it shows as a colour beside the note and on the corkboard.",
  },
  {
    id: "kinds",
    group: "Organise",
    label: "Note types",
    icon: "widget-linear",
    blurb: "Types of note beyond scenes, characters and places: a Faction, a Spell, a Case, each with its own icon, colour and fields.",
  },
  {
    id: "world",
    group: "Audience",
    label: "Reveals & languages",
    icon: "global-linear",
    blurb: "Where the audience learns things, the languages the project is written and translated in, and how its sources are cited.",
  },
  {
    id: "webhooks",
    group: "Advanced",
    label: "Webhooks",
    icon: "routing-2-linear",
    blurb: "Tell another service when something happens in this project: a Discord bot, a website that rebuilds itself, an automation. Plotra sends it a short message each time.",
  },
  {
    id: "github",
    group: "Advanced",
    label: "GitHub",
    icon: "folder-check-linear",
    blurb: "Keep a copy of the project on GitHub, as plain text files, updated a few minutes after each change: your writing and its history, outside Plotra.",
  },
] as const;
type TabId = (typeof tabs)[number]["id"];

/** Small headings in the rail: sentence case, never below 12px. */
const eyebrow = "text-meta font-medium text-muted-foreground";
/** A field's visible label. */
const fieldLabel = "text-ui-sm font-medium text-foreground";

/** Saving is automatic; said once in the rail on wide screens and under the heading on phones. */
function SavesItself({ className }: { className?: string }) {
  return (
    <p className={cn("items-center gap-2 text-xs text-muted-foreground", className)}>
      <Icon name="cloud-check-linear" className="size-4 shrink-0" />
      Changes save as you make them
    </p>
  );
}

/** Project settings (plan.md 2.8): type, modules, editorial workflow, reveal channels and languages. */
export function ProjectSettingsDialog() {
  const { projectSettings } = useUi();
  const { setUi } = useWorkspace();
  // Opened on a given tab with setUi({ projectSettings: "kinds" }).
  const asked = typeof projectSettings === "string" && tabs.some((t) => t.id === projectSettings) ? (projectSettings as TabId) : null;
  const [tab, setTab] = useState<TabId>(asked ?? "general");
  const [lastAsked, setLastAsked] = useState(asked);
  if (asked !== lastAsked) {
    setLastAsked(asked);
    if (asked) setTab(asked);
  }
  if (!projectSettings) return null;
  const section = tabs.find((t) => t.id === tab) ?? tabs[0];

  return (
    <Dialog open onOpenChange={(open) => !open && setUi({ projectSettings: false })}>
      <DialogContent
        showCloseButton={false}
        className="h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:h-[min(46rem,calc(100dvh-4rem))] sm:max-w-4xl sm:grid-cols-[15rem_minmax(0,1fr)] sm:grid-rows-1"
      >
        <Rail tab={tab} onTab={setTab} />
        <div className="relative min-h-0">
          {/* Keyed by section, so each one opens scrolled to its top. */}
          <div key={tab} className="h-full overflow-y-auto">
            <header className="px-6 pt-7 pr-14 sm:px-9 sm:pt-9">
              <h2 className="font-display text-[2rem] leading-none tracking-tight">{section.label}</h2>
              <p className="mt-2.5 max-w-xl text-ui-sm leading-relaxed text-muted-foreground">{section.blurb}</p>
              {section.group === "Advanced" && (
                <p className="mt-3 flex max-w-xl items-start gap-2 rounded-lg border border-dashed px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                  <Icon name="info-circle-linear" className="mt-px size-4 shrink-0" />
                  For connecting Plotra to other services. You don&apos;t need these to write.
                </p>
              )}
              <SavesItself className="mt-3 flex sm:hidden" />
            </header>
            <div className="animate-fade-in px-6 pt-7 pb-10 sm:px-9">
              {tab === "general" ? (
                <General />
              ) : tab === "modules" ? (
                <Modules />
              ) : tab === "workflow" ? (
                <Workflow />
              ) : tab === "words" ? (
                <Words />
              ) : tab === "labels" ? (
                <Labels />
              ) : tab === "kinds" ? (
                <Kinds />
              ) : tab === "webhooks" ? (
                <WebhooksSettings />
              ) : tab === "github" ? (
                <GitHubSettings />
              ) : (
                <World />
              )}
            </div>
          </div>
          <DialogClose className="absolute top-4 right-4 grid size-8 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50">
            <Icon name="close-linear" className="size-4" />
            <span className="sr-only">Close</span>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The project, then its sections. On a phone it folds into a strip across the top. */
function Rail({ tab, onTab }: { tab: TabId; onTab: (tab: TabId) => void }) {
  const { project, modules, stages } = useWorkspace();
  const type = projectTypeMeta[project.type];
  const counts: Partial<Record<TabId, number>> = { modules: modules.size, workflow: stages.length, labels: project.settings.labels?.length || undefined };

  return (
    <aside className="flex min-h-0 min-w-0 flex-col border-b bg-sidebar sm:border-r sm:border-b-0">
      <div className="px-5 pt-5 pb-3 pr-14 sm:pt-6 sm:pr-5 sm:pb-6">
        <DialogTitle className={eyebrow}>Project settings</DialogTitle>
        <DialogDescription className="sr-only">
          The kind of story is a starting point. The tools, the workflow, the names of things, labels and note types can all be changed here at any time.
        </DialogDescription>
        <p className="mt-2 line-clamp-2 font-display text-[1.65rem] leading-[1.1] break-words">{project.title}</p>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon name={type.icon} className="size-4 shrink-0 text-ember-ink" />
          <span className="truncate">{type.label}</span>
        </p>
      </div>
      <nav aria-label="Settings sections" className="relative isolate flex gap-0.5 overflow-x-auto px-3 pb-3 sm:flex-1 sm:flex-col sm:overflow-x-visible sm:overflow-y-auto">
        <Pill className="rounded-md bg-accent shadow-[inset_0_0_0_1px_var(--border)]" />
        {tabs.map((t, i) => {
          const chosen = tab === t.id;
          return (
            <Fragment key={t.id}>
              {t.group !== tabs[i - 1]?.group && <span className={cn(eyebrow, "hidden px-2.5 pb-1.5 sm:block", i === 0 ? "pt-0" : "pt-5")}>{t.group}</span>}
              <button
                type="button"
                aria-pressed={chosen}
                onClick={() => onTab(t.id)}
                className={cn(
                  "flex h-8 shrink-0 items-center gap-2.5 rounded-md px-2.5 text-left text-ui-sm whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  chosen ? "text-foreground" : "hover:bg-accent/50",
                )}
              >
                <Icon name={t.icon} className={cn("size-4 shrink-0 transition-colors", chosen && "text-ember-ink")} />
                <span className="flex-1">{t.label}</span>
                {counts[t.id] !== undefined && <span className="text-meta text-faint tabular-nums">{counts[t.id]}</span>}
              </button>
            </Fragment>
          );
        })}
      </nav>
      <SavesItself className="hidden border-t px-5 py-3.5 sm:flex" />
    </aside>
  );
}

/** A titled group of settings within a section. */
function Group({ title, hint, action, children }: { title: string; hint?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="grid gap-3">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-ui-sm font-medium">{title}</h3>
          {hint && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Saves a change, then reloads the settings for everyone in the project. */
function useSave() {
  const { project, projectChanged } = useWorkspace();
  const canManage = project.actions.includes("manage");
  const canEdit = project.actions.includes("edit");
  const run = async (work: () => Promise<unknown>) => {
    try {
      await work();
      projectChanged();
    } catch (error) {
      toast.error(errorText(error));
    }
  };
  return {
    canManage,
    canEdit,
    saveSettings: (patch: SettingsPatch) => run(() => updateProjectSettings(project.id, patch)),
    saveProject: (patch: Parameters<typeof updateProject>[1]) => run(() => updateProject(project.id, patch)),
  };
}

function General() {
  const { project } = useWorkspace();
  const { canManage, saveProject, saveSettings } = useSave();
  const [worlds, setWorlds] = useState<WorldCandidate[]>([]);
  // The kind it was before the last change, so that change can be taken back.
  const [typeBefore, setTypeBefore] = useState<(typeof projectTypes)[number] | null>(null);
  const uid = useId();

  useEffect(() => {
    let cancelled = false;
    read("listWorldCandidates", project.id)
      .then((list) => !cancelled && setWorlds(list))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  const format = project.settings.format ?? typeFormat[project.type];

  return (
    <div className="grid gap-10">
      {!canManage && <ManagersOnly />}
      <div className="grid gap-4">
        <label className="grid gap-1.5">
          <span className={fieldLabel}>Title</span>
          <CommitInput value={project.title} disabled={!canManage} className="h-9 rounded-lg text-sm" onCommit={(title) => void saveProject({ title })} />
        </label>
        <label className="grid gap-1.5">
          <span className={fieldLabel}>Logline</span>
          <CommitTextarea
            value={project.description ?? ""}
            disabled={!canManage}
            placeholder="One or two sentences. Used on the series bible and the public wiki."
            className="rounded-lg px-2.5 py-2"
            onCommit={(description) => void saveProject({ description })}
          />
        </label>
      </div>

      <Group title="What kind of story" hint="This picks which tools start switched on. Tools you've switched on or off yourself stay as they are.">
        <div role="radiogroup" aria-label="Project type" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {projectTypes.map((type) => {
            const chosen = project.type === type;
            return (
              <button
                key={type}
                type="button"
                role="radio"
                aria-checked={chosen}
                disabled={!canManage}
                onClick={() => {
                  if (chosen) return;
                  const before = project.type;
                  void saveProject({ type }).then(() => setTypeBefore(before));
                }}
                className={cn(
                  "flex min-h-12 items-center gap-2.5 rounded-lg border bg-card px-3 py-2 text-left text-ui-sm leading-tight transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 enabled:hover:border-foreground/20 disabled:cursor-default",
                  chosen && "border-ember/60 bg-ember/[0.07] enabled:hover:border-ember/60",
                )}
              >
                <Icon name={projectTypeMeta[type].icon} className={cn("size-5 shrink-0 text-faint transition-colors", chosen && "text-ember-ink")} />
                <span className="min-w-0 flex-1">{projectTypeMeta[type].label}</span>
              </button>
            );
          })}
        </div>
        {typeBefore && typeBefore !== project.type && (
          <p role="status" className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <Icon name="info-circle-linear" className="size-4 shrink-0" />
            <span className="min-w-0 flex-1">
              Now a {projectTypeMeta[project.type].label}. Its usual tools are switched on; any you set yourself stay as they were.
            </span>
            <button
              type="button"
              onClick={() => {
                const back = typeBefore;
                setTypeBefore(null);
                void saveProject({ type: back });
              }}
              className="h-8 rounded-md px-2.5 font-medium text-foreground hover:bg-accent"
            >
              Undo
            </button>
          </p>
        )}
      </Group>

      <Group title="New scenes are written as" hint={formatMeta[format].description}>
        <fieldset disabled={!canManage} className="flex overflow-x-auto">
          <Segmented<ScriptFormat>
            value={format}
            onChange={(next) => void saveSettings({ format: next })}
            options={scriptFormats.map((f) => ({ value: f, label: formatMeta[f].label }))}
          />
        </fieldset>
      </Group>

      <Group
        title="Shared world bible"
        hint="A book series, a show and a game can share one world: its characters, places and entities appear in this project's codex and can be linked from any note. Who can see them is still decided by the world project's own sharing."
      >
        <SelectField
          aria-label="Shared world bible"
          value={project.worldId ?? ""}
          disabled={!canManage}
          onValueChange={(v) => void saveProject({ worldId: v || null })}
          className={cn(fieldClass, "h-9 rounded-lg px-2.5")}
        >
          <option value="">None: this project keeps its own world</option>
          {/* Keep showing a world the list no longer offers (it may have been hidden from this user). */}
          {project.worldId && !worlds.some((w) => w.id === project.worldId) && <option value={project.worldId}>The linked world</option>}
          {worlds.map((w) => (
            <option key={w.id} value={w.id}>
              {w.title} ({projectTypeMeta[w.type].label})
            </option>
          ))}
        </SelectField>
      </Group>

      <Group
        title="Automatic versions"
        hint="While someone writes, a note's text is kept in its history this often, 40 to a note, the oldest giving way. Named versions and the ones kept before an AI change are always kept."
      >
        <fieldset disabled={!canManage} className="flex overflow-x-auto">
          <Segmented<string>
            value={String(project.settings.autoVersionMinutes ?? 30)}
            onChange={(next) => void saveSettings({ autoVersionMinutes: Number(next) })}
            options={[
              { value: "10", label: "10 min" },
              { value: "30", label: "30 min" },
              { value: "60", label: "1 hour" },
              { value: "180", label: "3 hours" },
              { value: "0", label: "Never" },
            ]}
          />
        </fieldset>
      </Group>

      <div className="flex items-start justify-between gap-6 rounded-xl border bg-card p-4">
        <label htmlFor={`${uid}-template`} className="min-w-0">
          <span className="block text-ui-sm font-medium">Offer as a template</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
            Anyone in its workspace can start a project from it. The new one gets its type, tools, words, labels, workflow, kinds and fields, and its folders and chapters,
            empty. None of its text is copied.
          </span>
        </label>
        <Switch id={`${uid}-template`} checked={project.settings.template === true} disabled={!canManage} onCheckedChange={(template) => void saveSettings({ template })} />
      </div>

      {canManage && <DeleteProject />}
    </div>
  );
}

function DeleteProject() {
  const { project, workspace, setUi } = useWorkspace();
  const router = useRouter();

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-destructive/30 bg-destructive/[0.04] p-4">
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-ui-sm font-medium text-destructive">
          <Icon name="danger-triangle-linear" className="size-4" />
          Delete this project
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">Everything in it goes, for everyone it&apos;s shared with. This can&apos;t be undone.</span>
      </span>
      <ConfirmDialog
        trigger={
          <Button variant="destructive" size="sm" className="shrink-0">
            Delete project…
          </Button>
        }
        title={`Delete “${project.title}”?`}
        description="Every note, version, comment and uploaded file in it is deleted, for everyone it's shared with. Projects that use it as their shared world lose the link. This can't be undone."
        confirmLabel="Delete forever"
        typeToConfirm={project.title}
        onConfirm={async (typed) => {
          try {
            await deleteProject(project.id, typed);
          } catch (error) {
            toast.error(errorText(error));
            return;
          }
          setUi({ projectSettings: false });
          toast.success(`Deleted “${project.title}”.`);
          router.replace(workspace.homeHref, { transitionTypes: nav.close });
        }}
      />
    </div>
  );
}

/** Module switches still on their way to the server: `null` is back to the type's default. */
const noModuleChanges: Partial<Record<ModuleId, boolean | null>> = {};

function Modules() {
  const { project, modules, ai, projectChanged } = useWorkspace();
  const { canManage } = useSave();
  const uid = useId();
  const defaults = new Set<ModuleId>(typeModules[project.type]);
  // A switch flips the moment it's clicked and stays put until the refreshed page
  // arrives (the action re-renders it), instead of waiting on the server to move.
  const [changes, change] = useOptimistic(noModuleChanges, (current, next: Partial<Record<ModuleId, boolean | null>>) => ({ ...current, ...next }));

  const save = (next: Partial<Record<ModuleId, boolean | null>>) => {
    startTransition(async () => {
      change(next);
      try {
        await updateProjectSettings(project.id, { modules: next });
        projectChanged();
      } catch (error) {
        toast.error(errorText(error));
      }
    });
  };
  // Back to the type's default clears the override, so a later change of type applies again.
  const toggle = (id: ModuleId, checked: boolean) => save({ [id]: checked === defaults.has(id) ? null : checked });

  // The AI module is only offered once the workspace has switched AI on (plan.md 2.11 "Trust").
  const rows = moduleIds
    .filter((id) => id !== "ai" || ai.workspaceEnabled)
    .map((id) => {
      const pending = id in changes;
      const override = pending ? changes[id] : project.settings.modules?.[id];
      const on = pending ? (override ?? defaults.has(id)) : modules.has(id);
      return { id, on, overridden: typeof override === "boolean" };
    });
  const overridden = rows.filter((row) => row.overridden);

  return (
    <div className="grid gap-4">
      {!canManage && <ManagersOnly />}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          <span className="font-medium text-foreground tabular-nums">{rows.filter((row) => row.on).length}</span> of {rows.length} on
        </span>
        {canManage && overridden.length > 0 && (
          <button
            type="button"
            onClick={() => save(Object.fromEntries(overridden.map((row) => [row.id, null])))}
            className="-mx-2 flex h-8 items-center gap-1.5 rounded-md px-2 hover:bg-accent hover:text-foreground"
          >
            <Icon name="restart-linear" className="size-3.5" />
            Back to the defaults for {projectTypeMeta[project.type].label}
          </button>
        )}
      </div>
      <ul className="grid gap-2.5 sm:grid-cols-2">
        {rows.map(({ id: module, on, overridden: own }) => (
          <li
            key={module}
            className={cn("flex flex-col rounded-xl border bg-card p-3.5 transition-colors duration-200", on && "border-ember/35 bg-ember/[0.05]")}
          >
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-faint transition-colors duration-200",
                  on && "bg-ember/15 text-ember-ink",
                )}
              >
                <Icon name={moduleMeta[module].icon} className="size-[18px]" />
              </span>
              <label htmlFor={`${uid}-${module}`} className={cn("min-w-0 flex-1 pt-0.5", canManage && "cursor-pointer")}>
                <span className="flex flex-wrap items-center gap-1.5 text-ui-sm leading-snug font-medium">
                  {moduleLabel(module, project.settings)}
                </span>
              </label>
              <Switch id={`${uid}-${module}`} checked={on} disabled={!canManage} onCheckedChange={(checked) => toggle(module, checked)} />
            </div>
            <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">{moduleMeta[module].description}</p>
            {(own || defaults.has(module)) && (
              <p className="mt-auto flex items-center gap-1.5 pt-3 text-meta text-faint">
                {own ? (
                  <>
                    <span className="size-1.5 rounded-full bg-ember" />
                    Set by you
                    {canManage && (
                      <>
                        {" · "}
                        <button type="button" onClick={() => save({ [module]: null })} className="-my-2 py-2 underline underline-offset-2 hover:text-foreground">
                          back to the default
                        </button>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <span className="size-1.5 rounded-full bg-faint/60" />
                    On by default for {projectTypeMeta[project.type].label}
                  </>
                )}
              </p>
            )}
          </li>
        ))}
      </ul>
      {ai.forbidden && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon name="shield-check-linear" className="size-3.5 text-ember-ink" />
          {ai.forbidden === "server" ? "No AI: this copy of Plotra has none." : "No AI: this workspace's owner has promised none, so there is no AI tool to switch on."}
        </p>
      )}
    </div>
  );
}

function Workflow() {
  const { stages, modules } = useWorkspace();
  const { canManage, saveSettings } = useSave();
  const [draft, setDraft] = useState<WorkflowStage[]>(stages);
  const [synced, setSynced] = useState(stages);
  if (stages !== synced) {
    setSynced(stages);
    setDraft(stages);
  }
  const [colouring, setColouring] = useState<string | null>(null);

  const commit = (next: WorkflowStage[]) => {
    setDraft(next);
    void saveSettings({ stages: next });
  };
  const patch = (id: string, change: Partial<WorkflowStage>) => commit(draft.map((s) => (s.id === id ? { ...s, ...change } : s)));
  const move = (i: number, by: -1 | 1) => {
    const j = i + by;
    if (j < 0 || j >= draft.length) return;
    const next = [...draft];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  };
  const add = () => {
    let id = "stage";
    for (let n = 2; draft.some((s) => s.id === id); n++) id = `stage-${n}`;
    commit([...draft, { id, label: "New stage", color: "#1971c2" }]);
  };
  const rename = (stage: WorkflowStage, label: string) => {
    // A stage's id is what notes store. It follows the name only while nothing else uses that id.
    const id = slugify(label).slice(0, 40);
    const free = id && /^[a-z0-9]/.test(id) && !draft.some((s) => s.id === id);
    patch(stage.id, { label: label.trim() || stage.label, ...(free && stage.id.startsWith("stage") ? { id } : {}) });
  };
  const shape = (list: WorkflowStage[]) => list.map((s) => s.id).join(" ");
  const applyPreset = async (preset: (typeof stagePresets)[number]) => {
    const before = draft;
    // Stages that match no preset were shaped by hand, so ask before they go.
    const customised = !stagePresets.some((p) => shape(p.stages) === shape(before));
    if (
      customised &&
      !(await confirm({
        title: `Replace your ${before.length === 1 ? "stage" : `${before.length} stages`} with ‘${preset.label}’?`,
        description: "Your stages' names, colours, approvals and locks are replaced. Notes in a stage that goes keep its name until you move them.",
        confirmLabel: "Replace stages",
      }))
    )
      return;
    commit(preset.stages);
    undoToast(`Stages set to ‘${preset.label}’`, () => commit(before));
  };
  const remove = (stage: WorkflowStage) => {
    const before = draft;
    commit(draft.filter((s) => s.id !== stage.id));
    undoToast(`Removed the stage ‘${stage.label}’`, () => commit(before));
  };

  return (
    <div className="grid gap-9">
      {!canManage && <ManagersOnly />}
      {/* The workflow drawn as a note travels it, left to right. */}
      <figure className="grid gap-4 rounded-xl border bg-card p-5 dot-grid">
        <ol aria-label="Stages in order" className="flex flex-wrap items-center gap-y-2.5">
          {draft.map((stage, i) => (
            <li key={stage.id} className="flex items-center">
              {i > 0 && (
                <span aria-hidden className="flex items-center px-1 text-faint">
                  <span className="h-px w-3 bg-current opacity-50" />
                  <Icon name="alt-arrow-right-linear" className="-ml-1 size-3.5" />
                </span>
              )}
              <span className="flex h-7 items-center gap-1.5 rounded-full border bg-background px-2.5 text-xs shadow-xs">
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: stage.color }} />
                {stage.label}
                {stage.approval && <Icon name="shield-check-linear" className="size-3.5 text-faint" />}
                {stage.locked && <Icon name="lock-linear" className="size-3.5 text-faint" />}
              </span>
            </li>
          ))}
        </ol>
        <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-meta text-faint">
          <span className="flex items-center gap-1">
            <Icon name="shield-check-linear" className="size-3.5" />
            needs approval to enter
          </span>
          <span className="flex items-center gap-1">
            <Icon name="lock-linear" className="size-3.5" />
            locked: read-only but for approvers
          </span>
        </figcaption>
      </figure>

      <Group title="Start from a preset">
        <div className="flex flex-wrap gap-2">
          {stagePresets.map((preset) => {
            const current = shape(preset.stages) === shape(draft);
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={current}
                disabled={!canManage}
                onClick={() => void applyPreset(preset)}
                className={cn(
                  "h-8 rounded-full border px-3 text-xs text-muted-foreground transition-colors enabled:hover:bg-accent enabled:hover:text-foreground disabled:opacity-50",
                  current && "border-ember/40 bg-ember/[0.07] text-foreground",
                )}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </Group>

      <Group
        title="Stages"
        hint={
          <>
            A stage that <strong className="font-medium text-foreground">needs approval</strong> can only be entered once the required reviewers have signed off
            {modules.has("editorial") ? " (set them up in the Reviews view)" : " (switch on the Review & editorial tool to set reviewers)"}. A{" "}
            <strong className="font-medium text-foreground">locked</strong> one is read-only for everyone but approvers.
          </>
        }
      >
        <ol className="divide-y rounded-xl border bg-card">
          {draft.map((stage, i) => (
            <li key={stage.id} className="relative flex items-center gap-1.5 py-1.5 pr-1.5 pl-3">
              <span className="w-4 shrink-0 text-meta text-faint tabular-nums">{i + 1}</span>
              <button
                type="button"
                aria-label={`Colour of ${stage.label}: ${colourName(stage.color)}`}
                aria-expanded={colouring === stage.id}
                disabled={!canManage}
                onClick={() => setColouring(colouring === stage.id ? null : stage.id)}
                className="group grid size-8 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <span className="size-6 rounded-full ring-offset-2 ring-offset-card group-enabled:group-hover:ring-2 group-enabled:group-hover:ring-foreground/20" style={{ backgroundColor: stage.color }} />
              </button>
              {colouring === stage.id && (
                <div
                  className="absolute top-full left-8 z-20 mt-1 rounded-lg border bg-popover p-2 shadow-lg"
                  onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), setColouring(null))}
                  onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setColouring(null)}
                >
                  <NamedSwatches
                    colours={swatches}
                    value={stage.color}
                    label={`Colour of ${stage.label}`}
                    onChange={(color) => {
                      setColouring(null);
                      patch(stage.id, { color });
                    }}
                  />
                </div>
              )}
              <label className="flex min-w-0 flex-1">
                <span className="sr-only">Name of stage {i + 1}</span>
                <CommitInput
                  value={stage.label}
                  disabled={!canManage}
                  className="h-8 flex-1 border-transparent hover:border-input focus-visible:border-input"
                  onCommit={(label) => rename(stage, label)}
                />
              </label>
              <StageToggle
                label="Approval"
                title="Needs every required reviewer's approval to enter"
                icon="shield-check-linear"
                pressed={Boolean(stage.approval)}
                disabled={!canManage}
                onClick={() => patch(stage.id, { approval: !stage.approval })}
              />
              <StageToggle
                label="Locked"
                title="Read-only for everyone but approvers"
                icon="lock-linear"
                pressed={Boolean(stage.locked)}
                disabled={!canManage}
                onClick={() => patch(stage.id, { locked: !stage.locked })}
              />
              <div className="flex shrink-0">
                <RowButton label="Move up" icon="alt-arrow-up-linear" disabled={!canManage || i === 0} onClick={() => move(i, -1)} />
                <RowButton label="Move down" icon="alt-arrow-down-linear" disabled={!canManage || i === draft.length - 1} onClick={() => move(i, 1)} />
                <RowButton
                  label="Remove stage"
                  icon="trash-bin-minimalistic-linear"
                  disabled={!canManage || draft.length === 1}
                  onClick={() => remove(stage)}
                />
              </div>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <button
            type="button"
            disabled={!canManage || draft.length >= 12}
            onClick={add}
            className="-ml-2 flex h-8 items-center gap-1.5 rounded-md px-2 text-ui-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            <Icon name="add-linear" className="size-3.5" />
            Add a stage
          </button>
          <span className="text-xs text-faint">Notes in a stage you remove keep its name until you move them.</span>
        </div>
      </Group>
    </div>
  );
}

function StageToggle({
  label,
  title,
  icon,
  pressed,
  disabled,
  onClick,
}: {
  label: string;
  title: string;
  icon: IconName;
  pressed: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip content={title}>
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-8 shrink-0 items-center gap-1 rounded-full border border-transparent px-2 text-xs text-faint transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none",
        pressed && "border-ember/30 bg-ember/10 text-ember-ink hover:bg-ember/15 hover:text-ember-ink",
      )}
    >
      <Icon name={icon} className="size-3.5" />
      <span className="hidden sm:inline">{label}</span>
    </button>
    </Tooltip>
  );
}

function RowButton({ label, icon, onClick, disabled }: { label: string; icon: IconName; onClick: () => void; disabled?: boolean }) {
  return <IconButton icon={icon} label={label} size="sm" disabled={disabled} onClick={onClick} />;
}

function World() {
  const { project } = useWorkspace();
  const { canEdit, saveSettings } = useSave();
  const uid = useId();
  const channels = project.settings.channels?.length ? project.settings.channels : defaultChannels;

  return (
    <div className="grid gap-10">
      {!canEdit && <ManagersOnly who="edit" />}
      <Group title="Reveal channels" hint="Where the audience can learn something: the text itself, a trailer, an interview, an item description…">
        <div className="rounded-lg border border-input bg-card p-1">
          <ChipInput values={channels} disabled={!canEdit} label="Add a reveal channel" placeholder="Add a channel" clean={(c) => c.trim().slice(0, 40)} onChange={(next) => void saveSettings({ channels: next })} />
        </div>
      </Group>

      <Group title="Languages" hint={`The language you write in, and any you translate into. The ${moduleLabel("localization", project.settings)} tool keeps one translation of each note per language.`}>
        <div className="grid items-start gap-4 rounded-xl border bg-card p-4 sm:grid-cols-[13rem_auto_minmax(0,1fr)]">
          <div className="grid gap-1.5">
            <label htmlFor={`${uid}-source`} className={fieldLabel}>
              Written in
            </label>
            <LanguagePicker
              id={`${uid}-source`}
              value={project.settings.sourceLocale ?? "en"}
              disabled={!canEdit}
              onChange={(sourceLocale) => void saveSettings({ sourceLocale })}
            />
          </div>
          <Icon name="arrow-right-linear" className="mt-[2.1rem] hidden size-4 text-faint sm:block" />
          <div className="grid gap-1.5">
            <label htmlFor={`${uid}-targets`} className={fieldLabel}>
              Translated into
            </label>
            <LanguagesPicker
              id={`${uid}-targets`}
              values={project.settings.locales ?? []}
              exclude={project.settings.sourceLocale ?? "en"}
              disabled={!canEdit}
              onChange={(locales) => void saveSettings({ locales })}
            />
          </div>
        </div>
      </Group>

      <Group title="Citation style" hint="How citations and the bibliography are set.">
        <fieldset disabled={!canEdit} className="flex">
          <Segmented<"apa" | "mla" | "chicago">
            value={project.settings.citationStyle ?? "apa"}
            onChange={(citationStyle) => void saveSettings({ citationStyle })}
            options={[
              { value: "apa", label: "APA" },
              { value: "mla", label: "MLA" },
              { value: "chicago", label: "Chicago" },
            ]}
          />
        </fieldset>
      </Group>
    </div>
  );
}
