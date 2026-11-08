"use client";

import type { ModuleId } from "@plotra/db/schema";
import { AgentView } from "@/components/agent/agent-view";
import { ActivityView } from "@/components/views/activity-view";
import { CodexView } from "@/components/views/codex-view";
import { ContinuityView } from "@/components/views/continuity-view";
import { CorkboardView } from "@/components/views/corkboard-view";
import { DialogueView } from "@/components/views/dialogue-view";
import { EditorView } from "@/components/views/editor-view";
import { GraphView } from "@/components/views/graph-view";
import { KnowledgeView } from "@/components/views/knowledge-view";
import { ManuscriptView } from "@/components/views/manuscript-view";
import { OutlineView } from "@/components/views/outline-view";
import { PlotGridView } from "@/components/views/plot-grid-view";
import { QuestsView } from "@/components/views/quests-view";
import { ProductionView } from "@/components/views/production-view";
import { PublishView } from "@/components/views/publish-view";
import { ReadView } from "@/components/views/read-view";
import { RelationshipsView } from "@/components/views/relationships-view";
import { ReviewsView } from "@/components/views/reviews-view";
import { RoadmapView } from "@/components/views/roadmap-view";
import { SourcesView } from "@/components/views/sources-view";
import { StatsView } from "@/components/views/stats-view";
import { StoryboardView } from "@/components/views/storyboard-view";
import { StringsView } from "@/components/views/strings-view";
import { TimelineView } from "@/components/views/timeline-view";
import { TranslateView } from "@/components/views/translate-view";
import { PluginPanelView } from "@/components/plugins/plugin-panel";
import { viewMeta, type ViewId, type ViewMeta } from "./view-meta";

export type ViewProps = { nodeId?: string; /** A plugin panel's "<plugin id>:<panel id>". */ panel?: string };

/**
 * Every view that can open in a pane (plan.md 2.5). Views that work on a binder
 * node list the kinds they `accept`; standalone views (graph, codex…) don't,
 * and appear in the ribbon. Container views (corkboard, manuscript…) are
 * standalone but take an optional folder to start in. A view may belong to a
 * module (plan.md 2.8) and is then only offered while it's on.
 *
 * To add a view: describe it in view-meta.ts, then give it a component here.
 */
export type ViewDefinition = ViewMeta & { component: React.ComponentType<ViewProps> };

/** Wraps a view that needs a node, so the registry can treat every view alike. */
const forNode = (View: React.ComponentType<{ nodeId: string }>) =>
  function NodeView({ nodeId }: ViewProps) {
    return nodeId ? <View nodeId={nodeId} /> : null;
  };

const components: Record<ViewId, React.ComponentType<ViewProps>> = {
  editor: forNode(EditorView),
  storyboard: forNode(StoryboardView),
  timeline: forNode(TimelineView),
  dialogue: forNode(DialogueView),
  graph: GraphView,
  codex: CodexView,
  outline: OutlineView,
  "plot-grid": PlotGridView,
  relationships: RelationshipsView,
  corkboard: CorkboardView,
  manuscript: ManuscriptView,
  read: ReadView,
  roadmap: RoadmapView,
  knowledge: KnowledgeView,
  continuity: ContinuityView,
  production: ProductionView,
  translate: TranslateView,
  publish: PublishView,
  reviews: ReviewsView,
  quests: QuestsView,
  strings: StringsView,
  sources: SourcesView,
  activity: ActivityView,
  stats: StatsView,
  agent: AgentView,
  plugin: PluginPanelView,
};

export const viewRegistry: ViewDefinition[] = viewMeta.map((meta) => ({ ...meta, component: components[meta.id] }));

const available = (view: ViewMeta, modules: ReadonlySet<ModuleId>) => !view.module || modules.has(view.module);

export const ribbonViews = (modules: ReadonlySet<ModuleId>) => viewRegistry.filter((view) => view.ribbon && available(view, modules));
export const containerViews = (modules: ReadonlySet<ModuleId>) => viewRegistry.filter((view) => view.container && available(view, modules));

export const getView = (id: string) => viewRegistry.find((view) => view.id === id);
