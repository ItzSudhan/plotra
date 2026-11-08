import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { circleLayout, FAMILY_CARD, familyTree, PARENT, SIBLING, SPOUSE } from "@/components/maps/layout";
import MapCanvas from "@/components/maps/map-canvas";
import { canvasDom, InfoSheet, Segmented, useSceneTheme } from "@/components/maps/parts";
import type { SceneEdge, SceneNode } from "@/components/maps/scene";
import { Banner, Button, Empty, IconButton, Loading, Row, Separator } from "@/components/ui";
import { useResource } from "@/lib/cache";
import { kindIcon } from "@/lib/kinds";
import { getRelationships, mapKeys, noteRoute, relationshipLabel, relationshipMeta, type Relationship } from "@/lib/maps-api";
import { useProject } from "@/lib/project";
import { useClient } from "@/lib/session";
import { space, useColors } from "@/lib/theme";
import { useHorizon } from "@/lib/use-horizon";

// The relationship map (the web's components/views/relationships-view.tsx):
// characters, or places, and the relationships between them. As a map, as a
// family tree (from "Parent of", "Married to" and "Sibling of", as on the web)
// or as a list. Tap a person to see their relationships, tap a line to change it.

type Show = "characters" | "locations";
type Display = "map" | "tree" | "list";

const PILL = { w: 168, h: 48 };

export default function RelationshipsScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const c = useColors();
  const theme = useSceneTheme();
  const client = useClient();
  const { notes } = useProject(projectId);
  const rels = useResource(mapKeys.relationships(projectId), () => getRelationships(client, projectId));
  const { horizon, release } = useHorizon(projectId, notes.data);
  const [show, setShow] = useState<Show>("characters");
  const [display, setDisplay] = useState<Display>("map");
  const [selected, setSelected] = useState<string | null>(null);
  const [fitKey, setFitKey] = useState(0);

  const all = useMemo(() => notes.data ?? [], [notes.data]);
  const titleOf = useCallback((id: string) => all.find((n) => n.id === id)?.title, [all]);
  // Under a horizon, people readers haven't met yet aren't on the map.
  const people = useMemo(() => all.filter((n) => n.kind === (show === "characters" ? "character" : "location") && (!horizon || horizon.knows(n.id))), [all, show, horizon]);
  const ids = useMemo(() => new Set(people.map((p) => p.id)), [people]);
  const shownRels = useMemo(() => (rels.data ?? []).filter((r) => ids.has(r.fromNodeId) && ids.has(r.toNodeId)), [rels.data, ids]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of shownRels) for (const id of [r.fromNodeId, r.toNodeId]) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  }, [shownRels]);

  const tree = show === "characters" && display === "tree";
  const family = useMemo(
    () => (tree ? familyTree(people.map((p) => ({ id: p.id, title: p.title })), shownRels.map((r) => ({ from: r.fromNodeId, to: r.toNodeId, type: r.type }))) : null),
    [tree, people, shownRels],
  );

  const scene = useMemo(() => {
    if (family) {
      const nodes: SceneNode[] = people
        .filter((p) => family.positions.has(p.id))
        .map((p) => ({ id: p.id, ...family.positions.get(p.id)!, w: FAMILY_CARD, h: 44, shape: "pill", label: p.title || "Untitled", color: "#d5467f" }));
      const edges: SceneEdge[] = shownRels
        .filter((r) => (r.type === PARENT || r.type === SPOUSE || r.type === SIBLING) && family.positions.has(r.fromNodeId) && family.positions.has(r.toNodeId))
        .map((r) => ({
          id: r.id,
          from: r.fromNodeId,
          to: r.toNodeId,
          color: relationshipMeta(r.type).color,
          width: 2,
          dashed: r.type === SIBLING,
          route: r.type === PARENT ? "elbow" : "straight",
          ...(r.label && { label: r.label }),
        }));
      return { nodes, edges };
    }
    const centres = circleLayout(people.map((p) => p.id));
    const nodes: SceneNode[] = people.map((p) => {
      const at = centres.get(p.id)!;
      const n = counts.get(p.id) ?? 0;
      return { id: p.id, x: at.x - PILL.w / 2, y: at.y - PILL.h / 2, ...PILL, shape: "pill", label: p.title || "Untitled", body: `${n} ${n === 1 ? "relationship" : "relationships"}`, color: show === "characters" ? "#d5467f" : "#109a82" };
    });
    const edges: SceneEdge[] = shownRels.map((r) => {
      const meta = relationshipMeta(r.type);
      return { id: r.id, from: r.fromNodeId, to: r.toNodeId, color: meta.color, width: 2, arrow: r.directed || meta.directed, label: r.label || meta.label, route: "curve" };
    });
    return { nodes, edges };
  }, [family, people, shownRels, counts, show]);

  const canAdd = people.some((p) => p.canEdit);
  const add = (from?: string) => router.push({ pathname: "/project/[projectId]/maps/relationship", params: { projectId, among: show === "characters" ? "people" : "powers", ...(from && { from }) } });
  const edit = (r: Relationship) => router.push({ pathname: "/project/[projectId]/maps/relationship", params: { projectId, id: r.id, among: show === "characters" ? "people" : "powers" } });

  const onTapNode = useCallback(async (id: string) => setSelected(id), []);
  const onTapEdge = async (id: string) => {
    const r = rels.data?.find((x) => x.id === id);
    if (r) edit(r);
  };
  const onTapBackground = useCallback(async () => setSelected(null), []);

  const pick = selected ? people.find((p) => p.id === selected) : undefined;
  const pickRels = pick ? shownRels.filter((r) => r.fromNodeId === pick.id || r.toNodeId === pick.id) : [];
  const loading = (notes.loading && !notes.data) || (rels.loading && !rels.data);
  const what = show === "characters" ? "characters" : "places";

  return (
    <>
      <Stack.Screen
        options={{
          title: "Relationships",
          headerRight: () => (
            <View style={{ flexDirection: "row" }}>
              {display !== "list" && <IconButton name="fit" label="Fit everything on screen" onPress={() => setFitKey((k) => k + 1)} />}
              {canAdd && <IconButton name="add" label="Add a relationship" onPress={() => add()} />}
            </View>
          ),
        }}
      />
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.sm }}>
          <Segmented
            value={show}
            onChange={(v) => {
              setShow(v);
              setSelected(null);
              if (v === "locations" && display === "tree") setDisplay("map");
            }}
            options={[
              { value: "characters", label: "Characters" },
              { value: "locations", label: "Places" },
            ]}
          />
          <Segmented
            value={display}
            onChange={setDisplay}
            options={[
              { value: "map", label: "Map" },
              ...(show === "characters" ? [{ value: "tree" as const, label: "Family tree" }] : []),
              { value: "list", label: "List" },
            ]}
          />
          {!!release && <Text style={{ color: c.emberInk, fontSize: 13 }}>As of {release.title}: only who readers have met by then.</Text>}
        </View>
        <Banner offline={rels.offline} error={rels.offline ? null : rels.error} onRetry={rels.refresh} />
        {loading ? (
          <Loading />
        ) : !people.length ? (
          <Empty icon={show === "characters" ? "person" : "place"} title={`No ${what} yet`} body={`Add ${what} in the binder, then relate them here.`} />
        ) : display === "list" ? (
          <FlatList
            data={shownRels}
            keyExtractor={(r) => r.id}
            contentInsetAdjustmentBehavior="automatic"
            ItemSeparatorComponent={() => <Separator />}
            ListEmptyComponent={<Empty icon="people" title="No relationships yet" body={`Say how your ${what} are related: allies, family, rivals…`} action={canAdd ? <Button label="Add a relationship" icon="add" variant="secondary" onPress={() => add()} /> : undefined} />}
            renderItem={({ item }) => (
              <Row title={relationshipLabel(item, titleOf)} subtitle={item.label ? relationshipMeta(item.type).label : null} onPress={() => edit(item)} accessibilityHint="Change or delete this relationship" />
            )}
          />
        ) : (
          <View style={{ flex: 1, marginTop: space.sm, borderTopWidth: 1, borderColor: c.border }}>
            {tree && !scene.nodes.length ? (
              <Empty icon="familyTree" title="No family yet" body="The tree is drawn from “Parent of”, “Married to” and “Sibling of”. Add those between your characters to see it." action={canAdd ? <Button label="Add a relationship" icon="add" variant="secondary" onPress={() => add()} /> : undefined} />
            ) : (
              <MapCanvas
                nodes={scene.nodes}
                edges={scene.edges}
                theme={theme}
                layout="given"
                selectedId={selected}
                fitKey={fitKey}
                onTapNode={onTapNode}
                onTapEdge={onTapEdge}
                onTapBackground={onTapBackground}
                dom={canvasDom(c.background)}
              />
            )}
            {tree && family && family.left.length > 0 && scene.nodes.length > 0 && !pick && (
              <Text style={{ position: "absolute", top: space.sm, left: space.lg, right: space.lg, color: c.mutedForeground, fontSize: 12 }}>
                {family.left.length} {family.left.length === 1 ? "character has" : "characters have"} no family ties, so {family.left.length === 1 ? "isn't" : "aren't"} in the tree.
              </Text>
            )}
            {pick && (
              <InfoSheet
                title={pick.title}
                subtitle={`${pickRels.length} ${pickRels.length === 1 ? "relationship" : "relationships"}`}
                onClose={() => setSelected(null)}
                actions={[
                  { label: "Open", icon: kindIcon[pick.kind], onPress: () => router.push(noteRoute(projectId, pick)) },
                  ...(pick.canEdit ? [{ label: "Add relationship", icon: "add" as const, onPress: () => add(pick.id) }] : []),
                ]}
              >
                {pickRels.slice(0, 5).map((r) => (
                  <Text key={r.id} onPress={() => edit(r)} accessibilityRole="button" numberOfLines={1} style={{ color: c.foreground, fontSize: 14, paddingVertical: 3 }}>
                    {relationshipLabel(r, titleOf)}
                  </Text>
                ))}
                {pickRels.length > 5 && <Text style={{ color: c.mutedForeground, fontSize: 13 }}>and {pickRels.length - 5} more in the list</Text>}
              </InfoSheet>
            )}
          </View>
        )}
      </View>
    </>
  );
}
