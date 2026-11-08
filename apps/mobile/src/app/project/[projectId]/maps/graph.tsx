import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { FlatList, ScrollView, Text, View } from "react-native";
import { Icon } from "@/components/icon";
import MapCanvas from "@/components/maps/map-canvas";
import { canvasDom, InfoSheet, Segmented, useSceneTheme } from "@/components/maps/parts";
import { neighbourhood } from "@/components/maps/layout";
import type { SceneEdge, SceneNode } from "@/components/maps/scene";
import { useMenu } from "@/components/menu";
import { Banner, Chip, Empty, IconButton, Loading, Row, Separator } from "@/components/ui";
import { useResource } from "@/lib/cache";
import { kindIcon, kindLabel } from "@/lib/kinds";
import { getLinks, kindColor, mapKeys, noteRoute } from "@/lib/maps-api";
import { useProject } from "@/lib/project";
import { useClient } from "@/lib/session";
import { radius, space, useColors } from "@/lib/theme";
import type { NodeKind, Note } from "@/lib/types";
import { useHorizon } from "@/lib/use-horizon";

// The graph (the web's components/views/graph-view.tsx): notes and the links
// between them, for the whole project or around one note. Pinch and drag to
// look about, tap a note to see it. Under a spoiler horizon it only has what
// readers know by then. A list shows the same, for reading without the map.

type Mode = "all" | "around";

/** Folders and timelines are hidden at first, as on the web. */
const HIDDEN_AT_FIRST: NodeKind[] = ["folder", "timeline"];

export default function GraphScreen() {
  const { projectId, noteId } = useLocalSearchParams<{ projectId: string; noteId?: string }>();
  const c = useColors();
  const theme = useSceneTheme();
  const client = useClient();
  const showMenu = useMenu();
  const { notes } = useProject(projectId);
  const links = useResource(mapKeys.links(projectId), () => getLinks(client, projectId));
  const { horizon, release } = useHorizon(projectId, notes.data);

  const [mode, setMode] = useState<Mode>(noteId ? "around" : "all");
  const [centerId, setCenterId] = useState<string | null>(noteId ?? null);
  const [depth, setDepth] = useState(1);
  const [hidden, setHidden] = useState<Set<NodeKind>>(new Set(HIDDEN_AT_FIRST));
  const [showOrphans, setShowOrphans] = useState(true);
  const [display, setDisplay] = useState<"map" | "list">("map");
  const [selected, setSelected] = useState<string | null>(noteId ?? null);
  const [fitKey, setFitKey] = useState(0);

  const all = useMemo(() => notes.data ?? [], [notes.data]);
  const byId = useMemo(() => new Map(all.map((n) => [n.id, n])), [all]);
  const kinds = useMemo(() => [...new Set(all.map((n) => n.kind))], [all]);

  // What the graph shows: the notes that pass the filters (and the horizon), and the links among them, once per pair.
  const model = useMemo(() => {
    const shown = all.filter((n) => (!hidden.has(n.kind) || n.id === centerId) && (!horizon || horizon.knows(n.id)));
    const ok = new Set(shown.map((n) => n.id));
    const pairs = new Map<string, { from: string; to: string; kind: string }>();
    for (const l of links.data ?? []) {
      if (l.source === l.target || !ok.has(l.source) || !ok.has(l.target)) continue;
      const [from, to] = l.source < l.target ? [l.source, l.target] : [l.target, l.source];
      const key = `${from}|${to}`;
      // An embed outranks a link, a link outranks a field (as on the web).
      const rank = (k: string) => (k === "embed" ? 3 : k === "wiki" ? 2 : 1);
      const had = pairs.get(key);
      if (!had || rank(l.kind) > rank(had.kind)) pairs.set(key, { from, to, kind: l.kind });
    }
    let edges = [...pairs.values()];
    let keep = ok;
    if (mode === "around" && centerId && ok.has(centerId)) {
      keep = neighbourhood(centerId, edges, depth);
      edges = edges.filter((e) => keep.has(e.from) && keep.has(e.to));
    }
    const degree = new Map<string, number>();
    for (const e of edges) for (const id of [e.from, e.to]) degree.set(id, (degree.get(id) ?? 0) + 1);
    const nodes = shown.filter((n) => keep.has(n.id) && (showOrphans || degree.has(n.id) || n.id === centerId));
    return { nodes, edges, degree };
  }, [all, hidden, horizon, links.data, mode, centerId, depth, showOrphans]);

  const sceneNodes = useMemo<SceneNode[]>(
    () =>
      model.nodes.map((n) => {
        const d = model.degree.get(n.id) ?? 0;
        const size = Math.round(10 + Math.sqrt(d) * 4 + Math.min(Math.log10(n.wordCount + 1), 4.5));
        return { id: n.id, x: 0, y: 0, w: size, h: size, shape: "dot", label: n.title || "Untitled", color: kindColor[n.kind], description: `${kindLabel[n.kind]}: ${n.title || "Untitled"}, ${d} ${d === 1 ? "link" : "links"}` };
      }),
    [model],
  );
  const sceneEdges = useMemo<SceneEdge[]>(
    () => model.edges.map((e) => ({ id: `${e.from}|${e.to}`, from: e.from, to: e.to, color: theme.mutedForeground, width: e.kind === "embed" ? 2.4 : e.kind === "wiki" ? 1.2 : 0.8, dashed: e.kind === "property" })),
    [model.edges, theme.mutedForeground],
  );

  const open = (note: Note) => router.push(noteRoute(projectId, note));
  const focusOn = (id: string) => {
    setCenterId(id);
    setMode("around");
    setSelected(id);
  };
  const onTapNode = useCallback(async (id: string) => setSelected(id), []);
  const onTapBackground = useCallback(async () => setSelected(null), []);

  const filterMenu = () =>
    showMenu({
      title: "Show in the graph",
      message: `Hidden: ${[...hidden].map((k) => kindLabel[k]).join(", ") || "nothing"}`,
      items: [
        ...kinds.map((k) => ({ label: `${hidden.has(k) ? "Show" : "Hide"} ${kindLabel[k].toLowerCase()}s`, icon: kindIcon[k], onPress: () => toggleKind(k) })),
        { label: showOrphans ? "Hide notes with no links" : "Show notes with no links", icon: "filter" as const, onPress: () => setShowOrphans((v) => !v) },
        ...(mode === "around" ? [1, 2, 3].filter((d) => d !== depth).map((d) => ({ label: `${d} ${d === 1 ? "step" : "steps"} around`, icon: "focus" as const, onPress: () => setDepth(d) })) : []),
      ],
    });
  const toggleKind = (k: NodeKind) =>
    setHidden((h) => {
      const next = new Set(h);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const center = centerId ? byId.get(centerId) : undefined;
  const pick = selected ? byId.get(selected) : undefined;
  const linkCount = selected ? (model.degree.get(selected) ?? 0) : 0;
  const loading = (notes.loading && !notes.data) || (links.loading && !links.data);

  // The list: each note with the notes it's linked to, by title.
  const listed = useMemo(() => {
    if (display !== "list") return [];
    const around = new Map<string, string[]>();
    for (const e of model.edges) {
      around.set(e.from, [...(around.get(e.from) ?? []), byId.get(e.to)?.title || "Untitled"]);
      around.set(e.to, [...(around.get(e.to) ?? []), byId.get(e.from)?.title || "Untitled"]);
    }
    return [...model.nodes].sort((a, b) => a.title.localeCompare(b.title)).map((n) => ({ note: n, linked: (around.get(n.id) ?? []).sort((a, b) => a.localeCompare(b)) }));
  }, [display, model, byId]);

  return (
    <>
      <Stack.Screen
        options={{
          title: "Graph",
          headerRight: () => (
            <View style={{ flexDirection: "row" }}>
              {display === "map" && <IconButton name="fit" label="Fit everything on screen" onPress={() => setFitKey((k) => k + 1)} />}
              <IconButton name="filter" label="What to show" onPress={filterMenu} />
            </View>
          ),
        }}
      />
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.sm }}>
          <Segmented
            value={display}
            onChange={setDisplay}
            options={[
              { value: "map", label: "Map" },
              { value: "list", label: "List" },
            ]}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
            <Chip label="Whole project" selected={mode === "all"} onPress={() => setMode("all")} />
            {center && <Chip label={`Around ${center.title || "Untitled"} · ${depth} ${depth === 1 ? "step" : "steps"}`} selected={mode === "around"} onPress={() => (mode === "around" ? filterMenu() : setMode("around"))} />}
          </ScrollView>
          {!!release && (
            <Text style={{ color: c.emberInk, fontSize: 13 }}>
              As of {release.title}: only what readers know by then.
            </Text>
          )}
        </View>
        <Banner offline={links.offline} error={links.offline ? null : links.error} onRetry={links.refresh} />
        {loading ? (
          <Loading />
        ) : !model.nodes.length ? (
          <Empty icon="graph" title="Nothing to show" body={all.length ? "No notes pass these filters. Show more kinds of note from the filter button." : "Add notes and link them with [[ ]] to see them here."} />
        ) : display === "list" ? (
          <FlatList
            data={listed}
            keyExtractor={(r) => r.note.id}
            contentInsetAdjustmentBehavior="automatic"
            ItemSeparatorComponent={() => <Separator inset={52} />}
            renderItem={({ item }) => (
              <Row
                icon={kindIcon[item.note.kind]}
                iconColor={kindColor[item.note.kind]}
                title={item.note.title}
                subtitle={item.linked.length ? `Linked with ${item.linked.join(", ")}` : "No links"}
                onPress={() => open(item.note)}
                onLongPress={() => {
                  focusOn(item.note.id);
                  setDisplay("map");
                }}
                accessibilityHint="Opens the note. Hold to see the graph around it."
              />
            )}
          />
        ) : (
          <View style={{ flex: 1, marginTop: space.sm, borderTopWidth: 1, borderColor: c.border }}>
            <MapCanvas
              nodes={sceneNodes}
              edges={sceneEdges}
              theme={theme}
              layout="force"
              fixedId={mode === "around" ? centerId : null}
              selectedId={selected}
              fitKey={fitKey}
              onTapNode={onTapNode}
              onTapBackground={onTapBackground}
              dom={canvasDom(c.background)}
            />
            <View pointerEvents="none" style={{ position: "absolute", top: space.sm, left: space.md, paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.sm, backgroundColor: c.muted }}>
              <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
                {model.nodes.length.toLocaleString()} notes · {model.edges.length.toLocaleString()} links
              </Text>
            </View>
            {pick && (
              <InfoSheet
                title={pick.title}
                subtitle={`${kindLabel[pick.kind]} · ${linkCount} ${linkCount === 1 ? "link" : "links"} here`}
                body={pick.synopsis}
                onClose={() => setSelected(null)}
                actions={[
                  { label: "Open", icon: kindIcon[pick.kind], onPress: () => open(pick) },
                  ...(mode !== "around" || centerId !== pick.id ? [{ label: "Around this note", icon: "focus" as const, onPress: () => focusOn(pick.id) }] : []),
                ]}
              >
                {pick.tags.length > 0 && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Icon name="info" size={12} color={c.mutedForeground} />
                    <Text numberOfLines={1} style={{ color: c.mutedForeground, fontSize: 12 }}>
                      {pick.tags.map((t) => `#${t}`).join(" ")}
                    </Text>
                  </View>
                )}
              </InfoSheet>
            )}
          </View>
        )}
      </View>
    </>
  );
}
