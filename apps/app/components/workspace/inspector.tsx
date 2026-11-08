"use client";

import type { NodeKind } from "@plotra/db/schema";
import { Icon } from "@plotra/icons";
import { IconButton } from "@plotra/ui/components/icon-button";
import { Pill } from "@plotra/ui/components/pill";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@plotra/ui/components/select";
import { cn } from "@plotra/ui/lib/utils";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { normalizeTag } from "@/lib/doc-index";
import { nodeKindMeta } from "@/lib/tree";
import { StatusDot } from "./status";
import { LinksPanel } from "./links-panel";
import { AgentPanel } from "@/components/agent/agent-panel";
import { ReviewSection } from "@/components/editorial/review-controls";
import { CommentsPanel } from "@/components/workflow/comments-panel";
import { ChatPanel } from "@/components/workflow/chat-panel";
import { HistoryPanel } from "@/components/workflow/history-panel";
import { useWorld } from "@/components/world/data";
import { EntityIcon } from "@/components/world/entity-icon";
import { StoryPanel } from "@/components/world/story-panel";
import { isDocumentKind, plainKinds } from "@/lib/story";
import { inspectorPanels, inspectorTabs, type InspectorPanel } from "@/lib/shell-prefs";
import { onTabKeyDown, rovingTabIndex } from "@/lib/tabs";
import { labelOf } from "@/lib/vocabulary";
import { ChipInput, PropertyList } from "./properties";
import { useEffectiveShell } from "./shell-prefs";
import { emptyStats, useStore } from "./stores";
import { useUi, useWorkspace } from "./workspace-provider";
import { useVocabulary } from "./vocabulary";

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

/** Right sidebar: outline, properties and links of the active note. */
export function Inspector() {
  const { setUi, activeNodeId, modules } = useWorkspace();
  const { rightTab: tab } = useUi();
  const hasStory = modules.has("world") || modules.has("releases") || modules.has("research");
  // Only where AI is on for the workspace and the project (plan.md 2.11 "Trust").
  const hasAi = modules.has("ai");
  // The chat stays mounted once opened, so an answer keeps streaming while another tab is looked at.
  const [agentOpened, setAgentOpened] = useState(false);
  if (tab === "agent" && hasAi && !agentOpened) setAgentOpened(true);
  const nodeId = useStore(activeNodeId);
  const setTab = (rightTab: typeof tab) => setUi({ rightTab });
  // A dot on the Chat tab when someone writes in a chat that isn't open.
  const { onNotice } = useWorkspace();
  const [chatUnread, setChatUnread] = useState(false);
  useEffect(() => onNotice((notice) => notice.startsWith("chat:") && setChatUnread(true)), [onNotice]);
  if (tab === "chat" && chatUnread) setChatUnread(false);
  // Seven panels in at most five named tabs (onboarding-plan.md 3): the note's
  // properties and outline share one, its comments and history another, unless
  // the person asked for a tab each, hid some, or moved them (Customize).
  // `rightTab` still names the panel, so everything that opens "comments" or "history" works as before.
  type Panel = typeof tab;
  // With the project's and workspace's default under the person's own (lib/shell-defaults.ts).
  const shell = useEffectiveShell();
  const groups = useMemo(() => {
    const available = new Set<InspectorPanel>(inspectorPanels.filter((panel) => (panel !== "story" || hasStory) && (panel !== "agent" || hasAi)));
    return inspectorTabs(shell, available);
  }, [hasAi, hasStory, shell]);
  // A panel the person hid can still be asked for (a command opens the comments): it shows, without a tab of its own.
  const group = groups.find((g) => g.panels.some((panel) => panel.id === tab)) ?? null;
  // Coming back to "Note" or "Review" reopens the half that was last looked at.
  const [lastPanel, setLastPanel] = useState<Record<string, Panel>>({});
  if (group && lastPanel[group.id] !== tab) setLastPanel({ ...lastPanel, [group.id]: tab });

  // The WAI-ARIA tabs pattern (issue #12): each tab names the panel it shows, each panel the tab that shows it.
  const ids = useId();
  const groupTabId = (id: string) => `${ids}-group-${id}`;
  const panelTabId = (id: string) => `${ids}-tab-${id}`;
  const mainPanelId = `${ids}-panel`;
  const agentPanelId = `${ids}-panel-agent`;
  // The AI panel stays mounted once opened; before then nothing is there to point at.
  const panelIdFor = (panel: Panel) => (panel === "agent" && hasAi ? (agentOpened ? agentPanelId : undefined) : mainPanelId);
  const split = !!group && group.panels.length > 1;
  const labelledBy = group ? (split ? panelTabId(tab) : groupTabId(group.id)) : undefined;
  const selectedGroup = groups.findIndex((g) => g.id === group?.id);
  const openGroup = (g: (typeof groups)[number]) => setTab(lastPanel[g.id] ?? g.panels[0].id);
  const findNote = useFindNote();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center border-b border-sidebar-border px-1.5">
        <div
          role="tablist"
          aria-label="Inspector"
          className="relative isolate flex h-full min-w-0 flex-1 items-center gap-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onKeyDown={(event) => onTabKeyDown(event, (index) => openGroup(groups[index]))}
        >
          <Pill className="rounded-md bg-sidebar-accent" />
          {groups.map((g, index) => (
            <button
              key={g.id}
              id={groupTabId(g.id)}
              type="button"
              role="tab"
              aria-selected={group?.id === g.id}
              aria-controls={panelIdFor(lastPanel[g.id] ?? g.panels[0].id)}
              tabIndex={rovingTabIndex(index, selectedGroup)}
              onClick={() => openGroup(g)}
              className={cn(
                "h-7 shrink-0 rounded-md px-1.5 text-ui-sm whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
                group?.id === g.id && "text-foreground",
              )}
            >
              {g.label}
              {/* Something new was said in a chat while it wasn't open. */}
              {g.panels.some((p) => p.id === "chat") && chatUnread && (
                <>
                  <span aria-hidden className="ml-1 inline-block size-1.5 rounded-full bg-ember align-middle" />
                  <span className="sr-only">, new messages</span>
                </>
              )}
            </button>
          ))}
        </div>
        <IconButton
          icon="settings-linear"
          label="Customize the inspector"
          tooltipSide="left"
          onClick={() => setUi({ customize: true })}
          className="ml-0.5 shrink-0 hover:bg-sidebar-accent"
        />
      </div>
      {group && split && (
        <div
          role="tablist"
          aria-label={group.label}
          className="relative isolate flex h-9 shrink-0 items-center gap-3 border-b border-sidebar-border px-3"
          onKeyDown={(event) => onTabKeyDown(event, (index) => setTab(group.panels[index].id))}
        >
          <Pill underline className="z-0 bg-foreground" />
          {group.panels.map((panel, index) => (
            <button
              key={panel.id}
              id={panelTabId(panel.id)}
              type="button"
              role="tab"
              aria-selected={tab === panel.id}
              aria-controls={panelIdFor(panel.id)}
              tabIndex={rovingTabIndex(
                index,
                group.panels.findIndex((p) => p.id === tab),
              )}
              onClick={() => setTab(panel.id)}
              className={cn(
                "-mb-px h-9 rounded-sm text-ui-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
                tab === panel.id && "text-foreground",
              )}
            >
              {panel.label}
            </button>
          ))}
        </div>
      )}
      {hasAi && agentOpened && (
        <div
          role="tabpanel"
          id={agentPanelId}
          aria-labelledby={tab === "agent" ? labelledBy : undefined}
          aria-label={tab === "agent" && labelledBy ? undefined : "AI"}
          className={cn("flex min-h-0 flex-1 flex-col", tab !== "agent" && "hidden")}
        >
          <AgentPanel />
        </div>
      )}
      <div
        role="tabpanel"
        id={mainPanelId}
        aria-labelledby={tab === "agent" && hasAi ? undefined : labelledBy}
        className={cn("min-h-0 flex-1", tab === "chat" ? "flex flex-col" : "overflow-y-auto", tab === "agent" && hasAi && "hidden")}
      >
        {tab === "agent" && hasAi ? null : tab === "chat" ? (
          <ChatPanel />
        ) : tab === "comments" ? (
          nodeId ? <CommentsPanel key={nodeId} nodeId={nodeId} /> : <Empty action={findNote}>Open a note to see its comments.</Empty>
        ) : tab === "history" ? (
          nodeId ? <HistoryPanel key={nodeId} nodeId={nodeId} /> : <Empty action={findNote}>Open a note to see its version history.</Empty>
        ) : tab === "story" && hasStory ? (
          nodeId ? <StoryPanel key={nodeId} nodeId={nodeId} /> : <Empty action={findNote}>Open a note to see its canon status and reveals.</Empty>
        ) : tab === "outline" ? (
          <Outline />
        ) : tab === "properties" ? (
          <Properties />
        ) : nodeId ? (
          <LinksPanel key={nodeId} nodeId={nodeId} />
        ) : (
          <Empty action={findNote}>Open a note to see what links to it.</Empty>
        )}
      </div>
    </div>
  );
}

function Empty({ children, action }: { children: React.ReactNode; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="grid justify-items-center gap-3 px-4 py-6 text-center">
      <p className="text-sm text-muted-foreground">{children}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="h-8 rounded-md border px-3 text-ui-sm outline-none hover:bg-sidebar-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

/** Offered where a panel needs an open note: finding one is the obvious next step. */
function useFindNote() {
  const { setUi } = useWorkspace();
  return { label: "Find a note", onClick: () => setUi({ palette: "files" }) };
}

function Outline() {
  const { activeNodeId, docs, editors } = useWorkspace();
  const nodeId = useStore(activeNodeId);
  const stats = useStore(docs)[nodeId ?? ""] ?? emptyStats;
  const findNote = useFindNote();

  if (!nodeId) return <Empty action={findNote}>Open a note to see its outline.</Empty>;
  if (stats.headings.length === 0) return <Empty>No headings yet. Start a line with # and a space to make one.</Empty>;

  const minLevel = Math.min(...stats.headings.map((h) => h.level));
  return (
    <ul className="py-2">
      {stats.headings.map((h) => (
        <li key={h.id}>
          <button
            type="button"
            onClick={() => editors.current.get(nodeId)?.scrollToHeading(h.id)}
            style={{ paddingLeft: 12 + (h.level - minLevel) * 14 }}
            className="block w-full truncate py-1.5 pr-3 text-left text-ui-sm text-muted-foreground outline-none hover:bg-sidebar-accent hover:text-foreground focus-visible:bg-sidebar-accent focus-visible:text-foreground"
          >
            {h.text}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** The select's value for a note without a label: a select item can't have an empty value. */
const NO_LABEL = "none";

/**
 * A labelled field. The label points at the control through the id handed to
 * `children`; for a group of controls (`group`), it names the group instead.
 */
function Field({ label, group, children }: { label: string; group?: boolean; children: (id: string) => React.ReactNode }) {
  const id = useId();
  const labelId = `${id}-label`;
  if (group) {
    return (
      <div role="group" aria-labelledby={labelId} className="grid gap-1.5">
        <span id={labelId} className="text-ui-sm font-medium text-muted-foreground">
          {label}
        </span>
        {children(id)}
      </div>
    );
  }
  return (
    <div className="grid gap-1.5">
      <label id={labelId} htmlFor={id} className="text-ui-sm font-medium text-muted-foreground">
        {label}
      </label>
      {children(id)}
    </div>
  );
}

function Properties() {
  const { activeNodeId, binder, docs, actions, stages, modules, project } = useWorkspace();
  const words = useVocabulary();
  const entityTypes = useWorld().data?.entityTypes ?? [];
  const nodeId = useStore(activeNodeId);
  const node = useStore(binder).index.byId.get(nodeId ?? "");
  const stats = useStore(docs)[nodeId ?? ""] ?? emptyStats;
  const findNote = useFindNote();

  if (!node) return <Empty action={findNote}>Open a note to see its type, status, synopsis and tags.</Empty>;
  const canEdit = node.actions.includes("edit");
  // The project's colour labels (project settings → Labels); the field is there once it has any.
  const labels = project.settings.labels ?? [];
  const label = labelOf(node, project.settings);
  const inlineTags = stats.tags.length ? stats.tags : node.contentTags;

  return (
    <div className="grid gap-4 p-3">
      <Field label="Type">
        {(id) => (
          // A world entry's type is its custom type; every other document picks from the built-in kinds.
          <Select
            disabled={!canEdit}
            value={node.kind === "entity" ? `type:${node.entityTypeId ?? ""}` : node.kind}
            onValueChange={(value) =>
              void actions.update(node.id, value.startsWith("type:") ? { kind: "entity", entityTypeId: value.slice(5) } : { kind: value as NodeKind })
            }
          >
            <SelectTrigger id={id} size="sm" className="w-full">
              <SelectValue placeholder="World entry" />
            </SelectTrigger>
            <SelectContent>
              {(isDocumentKind(node.kind) ? plainKinds : [node.kind]).map((kind) => (
                <SelectItem key={kind} value={kind}>
                  <Icon name={nodeKindMeta[kind].icon} />
                  {words.label(kind)}
                </SelectItem>
              ))}
              {isDocumentKind(node.kind) &&
                (modules.has("world") || node.kind === "entity") &&
                entityTypes.map((type) => (
                  <SelectItem key={type.id} value={`type:${type.id}`}>
                    <EntityIcon type={type} />
                    {type.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        )}
      </Field>
      <Field label="Status">
        {(id) => (
          <Select disabled={!canEdit} value={node.status} onValueChange={(status) => void actions.update(node.id, { status })}>
            <SelectTrigger id={id} size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {stages.map((stage) => (
                <SelectItem key={stage.id} value={stage.id}>
                  <StatusDot status={stage.id} className="mx-[5px]" title={false} />
                  {stage.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
      {labels.length > 0 && (
        <Field label="Label">
          {(fieldId) => (
            <Select disabled={!canEdit} value={label?.id ?? NO_LABEL} onValueChange={(id) => void actions.setLabel(node.id, id === NO_LABEL ? null : id)}>
              <SelectTrigger id={fieldId} size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_LABEL}>
                  <span className="text-muted-foreground">None</span>
                </SelectItem>
                {labels.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    <span aria-hidden className="mx-[3px] inline-block size-2.5 shrink-0 rounded-full" style={{ backgroundColor: l.color }} />
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      )}
      <Field label="Synopsis">{(id) => <Synopsis key={node.id} id={id} nodeId={node.id} initial={node.synopsis ?? ""} disabled={!canEdit} />}</Field>
      <Field label="Fields" group>
        {() => <PropertyList node={node} />}
      </Field>
      <Field label="Tags">
        {(id) => (
          <>
            <div className="rounded-md border border-input">
              <ChipInput
                id={id}
                values={node.tags}
                disabled={!canEdit}
                prefix="#"
                placeholder="Add a tag"
                clean={normalizeTag}
                onChange={(tags) => void actions.update(node.id, { tags })}
              />
            </div>
            {inlineTags.length > 0 && <p className="text-xs text-muted-foreground">In the text: {inlineTags.map((t) => `#${t}`).join(" ")}</p>}
          </>
        )}
      </Field>
      <Field label="Other names">
        {(id) => (
          <div className="rounded-md border border-input">
            <ChipInput
              id={id}
              values={node.aliases}
              disabled={!canEdit}
              placeholder="Other names, for links and mentions"
              clean={(a) => a.trim().slice(0, 200)}
              onChange={(aliases) => void actions.update(node.id, { aliases })}
            />
          </div>
        )}
      </Field>
      {modules.has("editorial") && <ReviewSection nodeId={node.id} />}
      {/* Labels take what's left and cut off; values stay on one line. */}
      <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 text-ui-sm [&_dd]:text-right [&_dd]:whitespace-nowrap [&_dt]:truncate [&_dt]:text-muted-foreground">
        <dt>Words</dt>
        <dd className="tabular-nums">{stats.words.toLocaleString()}</dd>
        <dt title="Characters, with spaces">Characters</dt>
        <dd className="tabular-nums">{stats.characters.toLocaleString()}</dd>
        <dt>Reading time</dt>
        <dd className="tabular-nums">{Math.max(1, Math.round(stats.words / 230))} min</dd>
        <dt>Updated</dt>
        <dd>{dateFormat.format(new Date(node.updatedAt))}</dd>
      </dl>
    </div>
  );
}

/** Saves a moment after typing stops and on leaving the box, then says "Saved" quietly. */
function Synopsis({ id, nodeId, initial, disabled }: { id: string; nodeId: string; initial: string; disabled?: boolean }) {
  const { actions } = useWorkspace();
  const [value, setValue] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const savedValue = useRef(initial.trim());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);

  // Made once: the component is keyed by note, and only touches refs when called.
  const [save] = useState(() => () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const next = latest.current.trim();
    if (next === savedValue.current) return;
    savedValue.current = next;
    setState("saving");
    void actions.update(nodeId, { synopsis: next || null }).then((kept) => {
      // Refused (the error toast says why): try again with the next change.
      if (!kept) savedValue.current = "\u0000";
      setState(kept ? "saved" : "idle");
    });
  });
  // Switching notes mid-sentence still saves what was typed.
  useEffect(() => save, [save]);

  return (
    <div className="grid gap-1">
      <textarea
        id={id}
        value={value}
        readOnly={disabled}
        rows={4}
        placeholder="What happens here, in a line or two."
        aria-describedby={`${id}-saved`}
        onChange={(e) => {
          setValue(e.target.value);
          latest.current = e.target.value;
          setState("idle");
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(save, 600);
        }}
        onBlur={save}
        className="w-full resize-y rounded-md border border-input bg-transparent px-2.5 py-2 text-ui-sm leading-relaxed outline-none placeholder:text-faint focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
      <span id={`${id}-saved`} aria-live="polite" className="min-h-4 text-meta text-muted-foreground">
        {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : ""}
      </span>
    </div>
  );
}
