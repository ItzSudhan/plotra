import { router, Stack, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, FlatList, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { Icon } from "@/components/icon";
import { useMenu } from "@/components/menu";
import { Banner, Empty, IconButton, Loading, T } from "@/components/ui";
import { AsOfChip, Dot } from "@/components/views/as-of";
import { PromptSheet, type Prompt } from "@/components/views/prompt-sheet";
import { isOffline } from "@/lib/api";
import { hasText, kindIcon, kindLabel, statusLabel } from "@/lib/kinds";
import { openWeb, webUrl, words } from "@/lib/links";
import type { Horizon } from "@/lib/horizon";
import { useProject } from "@/lib/project";
import { useClient, useSession } from "@/lib/session";
import { fonts, radius, space, useColors } from "@/lib/theme";
import { useHorizon } from "@/lib/use-horizon";
import { refreshViews, useViews, viewsApi, type ViewNode } from "@/lib/views-api";
import { cardsIn, stepTarget, trailOf } from "@/lib/views-model";

// The corkboard on a phone: a folder's or chapter's children as index cards,
// one under the other, with synopsis, status and label. Tap a card to read it
// (or, for a folder, to see its own cards); hold it for more. "Arrange" puts
// arrows on the cards to move them, which reorders the binder too.
// Under an "as of" release, cards readers don't know yet are dimmed, as in the binder.

export default function CorkboardScreen() {
  const { projectId, folderId } = useLocalSearchParams<{ projectId: string; folderId?: string }>();
  const c = useColors();
  const client = useClient();
  const { server } = useSession();
  const showMenu = useMenu();
  const { project } = useProject(projectId);
  const views = useViews(projectId);
  const nodes = useMemo(() => views.data?.nodes ?? [], [views.data]);
  const { releases, release, horizon, setAsOf } = useHorizon(projectId, views.data?.nodes);
  const [arranging, setArranging] = useState(false);
  const [prompt, setPrompt] = useState<Prompt | null>(null);

  const parentId = folderId || null;
  const container = parentId ? nodes.find((n) => n.id === parentId) : undefined;
  const cards = useMemo(() => cardsIn(nodes, parentId), [nodes, parentId]);
  const childCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of nodes) if (n.parentId) m.set(n.parentId, (m.get(n.parentId) ?? 0) + 1);
    return m;
  }, [nodes]);
  const trail = trailOf(nodes, parentId);
  const canAdd = container ? container.canEdit : !!views.data?.canEditProject;
  const releaseTitle = (id: string) => releases.find((r) => r.id === id)?.title;

  const openCards = (id: string | null) => router.push({ pathname: "/project/[projectId]/views/corkboard", params: { projectId, ...(id && { folderId: id }) } });
  const read = (n: ViewNode) => router.push({ pathname: "/project/[projectId]/note/[noteId]", params: { projectId, noteId: n.id } });
  const fail = (title: string, e: unknown) => Alert.alert(title, isOffline(e) ? "You're offline. Try again when you're back online." : (e as Error).message);

  /** Moves a card, showing the new order at once; the server's order comes back after. */
  const move = async (n: ViewNode, afterId: string | null) => {
    views.mutate((data) => {
      if (!data) return data;
      const rest = data.nodes.filter((x) => x.id !== n.id);
      const at = afterId ? rest.findIndex((x) => x.id === afterId) + 1 : rest.findIndex((x) => x.parentId === parentId);
      rest.splice(at < 0 ? rest.length : at, 0, n);
      return { ...data, nodes: rest };
    });
    try {
      await viewsApi.move(client, projectId, n.id, afterId);
    } catch (e) {
      fail("Couldn't move the card", e);
    }
    refreshViews(projectId);
  };
  const step = (n: ViewNode, by: -1 | 1) => {
    const target = stepTarget(cards, n.id, by);
    if (target !== undefined) void move(n, target);
  };

  const newCard = (kind: "scene" | "chapter") =>
    setPrompt({
      title: kind === "scene" ? "New scene card" : "New chapter card",
      message: container ? `At the end of ${container.title || "Untitled"}.` : "At the end of the project.",
      label: "Title",
      placeholder: kind === "scene" ? "The letter arrives" : "Chapter one",
      confirmLabel: "Add card",
      onSubmit: async (title) => {
        await client.createNote(projectId, { title: title.trim() || `Untitled ${kind}`, kind, parentId });
        refreshViews(projectId);
      },
    });

  const cardMenu = (n: ViewNode) => {
    const at = cards.findIndex((x) => x.id === n.id);
    showMenu({
      title: n.title || "Untitled",
      message: kindLabel[n.kind],
      items: [
        ...(hasText(n.kind) ? [{ label: "Read", icon: "book" as const, onPress: () => read(n) }] : []),
        ...(childCount.get(n.id) ? [{ label: "Its cards", icon: "corkboard" as const, onPress: () => openCards(n.id) }] : []),
        ...(n.canEdit ? [{ label: "Details", icon: "details" as const, onPress: () => router.push({ pathname: "/project/[projectId]/details/[noteId]", params: { projectId, noteId: n.id } }) }] : []),
        ...(n.canEdit && at > 0 ? [{ label: "Move earlier", icon: "arrowUp" as const, onPress: () => step(n, -1) }] : []),
        ...(n.canEdit && at < cards.length - 1 ? [{ label: "Move later", icon: "arrowDown" as const, onPress: () => step(n, 1) }] : []),
        ...(n.canEdit && at > 1 ? [{ label: "Move to the start", icon: "arrowUp" as const, onPress: () => void move(n, null) }] : []),
        ...(n.canEdit && at < cards.length - 2 ? [{ label: "Move to the end", icon: "arrowDown" as const, onPress: () => void move(n, cards.filter((x) => x.id !== n.id).at(-1)!.id) }] : []),
        { label: "Open on the web", icon: "web" as const, onPress: () => openWeb(webUrl(server, project, n.id)) },
      ],
    });
  };

  const addMenu = () =>
    showMenu({
      title: "New card",
      items: [
        { label: "Scene", icon: "scene", onPress: () => newCard("scene") },
        { label: "Chapter", icon: "book", onPress: () => newCard("chapter") },
      ],
    });

  return (
    <>
      <Stack.Screen
        options={{
          title: container?.title || "Corkboard",
          headerRight: () => (
            <View style={{ flexDirection: "row" }}>
              {canAdd && <IconButton name="add" label="New card" onPress={addMenu} />}
              {cards.some((n) => n.canEdit) && cards.length > 1 && (
                <IconButton name={arranging ? "check" : "arrowDown"} label={arranging ? "Done arranging" : "Arrange the cards"} onPress={() => setArranging(!arranging)} />
              )}
            </View>
          ),
        }}
      />
      <FlatList
        style={{ flex: 1, backgroundColor: c.background }}
        contentInsetAdjustmentBehavior="automatic"
        data={cards}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ paddingBottom: space.xxl }}
        refreshControl={<RefreshControl refreshing={views.refreshing} onRefresh={views.refresh} tintColor={c.mutedForeground} />}
        ListHeaderComponent={
          <View style={{ paddingBottom: space.md }}>
            <Banner offline={views.offline} error={views.offline ? null : views.error} onRetry={views.refresh} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: "center", gap: 4, paddingHorizontal: space.lg, paddingTop: space.sm }}>
              <Crumb label={project?.title ?? "Project"} current={!parentId} onPress={() => openCards(null)} />
              {trail.map((n) => (
                <View key={n.id} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Icon name="chevronRight" size={11} color={c.mutedForeground} />
                  <Crumb label={n.title || "Untitled"} current={n.id === parentId} onPress={() => openCards(n.id)} />
                </View>
              ))}
            </ScrollView>
            <AsOfChip releases={releases} release={release} setAsOf={setAsOf} hint="What readers know once a release is out. Cards they don't know yet are dimmed." />
            {arranging && (
              <T tone="muted" style={{ marginHorizontal: space.lg, marginTop: space.md, fontSize: 13 }}>
                Move cards with the arrows. The binder follows.
              </T>
            )}
          </View>
        }
        ListEmptyComponent={
          views.loading ? (
            <Loading />
          ) : views.data ? (
            <Empty icon="corkboard" title="No cards here" body={`Add scenes or chapters${container ? ` to ${container.title || "this folder"}` : ""} and they appear as index cards.`} />
          ) : undefined
        }
        renderItem={({ item, index }) => (
          <CardView
            node={item}
            number={index + 1}
            inside={childCount.get(item.id) ?? 0}
            horizon={horizon}
            releaseTitle={releaseTitle}
            arranging={arranging && item.canEdit}
            first={index === 0}
            last={index === cards.length - 1}
            onPress={() => (hasText(item.kind) ? read(item) : childCount.get(item.id) ? openCards(item.id) : cardMenu(item))}
            onLongPress={() => cardMenu(item)}
            onStep={(by) => step(item, by)}
          />
        )}
      />
      <PromptSheet prompt={prompt} onClose={() => setPrompt(null)} />
    </>
  );
}

function Crumb({ label, current, onPress }: { label: string; current: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: current }} disabled={current} onPress={onPress} hitSlop={6} style={{ paddingVertical: 6 }}>
      <Text numberOfLines={1} style={{ color: current ? c.foreground : c.mutedForeground, fontSize: 14, fontWeight: current ? "600" : "400", maxWidth: 180 }}>
        {label}
      </Text>
    </Pressable>
  );
}

function CardView({
  node,
  number,
  inside,
  horizon,
  releaseTitle,
  arranging,
  first,
  last,
  onPress,
  onLongPress,
  onStep,
}: {
  node: ViewNode;
  number: number;
  inside: number;
  horizon: Horizon | null;
  releaseTitle: (id: string) => string | undefined;
  arranging: boolean;
  first: boolean;
  last: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onStep: (by: -1 | 1) => void;
}) {
  const c = useColors();
  const status = statusLabel(node.status);
  const unknown = !!horizon && !horizon.knows(node.id);
  const later = unknown ? horizon!.revealedBy.get(node.id) : undefined;
  const reveal = unknown ? (later ? `Revealed in ${releaseTitle(later) ?? "a later release"}` : "Not revealed yet") : null;
  const footer = [status, node.wordCount ? words(node.wordCount) : null, inside ? `${inside} inside` : null].filter(Boolean).join(" · ");
  return (
    <View style={{ flexDirection: "row", alignItems: "stretch", marginHorizontal: space.lg, marginBottom: space.md, gap: space.sm, opacity: unknown && !horizon!.shows(node.id) ? 0.45 : 1 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Card ${number}, ${kindLabel[node.kind]}: ${node.title || "Untitled"}${node.synopsis ? `. ${node.synopsis}` : ""}${status ? `. ${status}` : ""}`}
        accessibilityHint="Hold for more."
        onPress={onPress}
        onLongPress={onLongPress}
        style={({ pressed }) => ({
          flex: 1,
          minHeight: 120,
          padding: space.lg,
          gap: space.sm,
          borderRadius: radius.md,
          backgroundColor: pressed ? c.accent : c.card,
          borderWidth: 1,
          borderColor: c.border,
          borderTopWidth: 4,
          borderTopColor: node.label?.color ?? c.border,
        })}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <Text style={{ color: c.mutedForeground, fontSize: 12, fontVariant: ["tabular-nums"] }}>{number}</Text>
          <Icon name={kindIcon[node.kind]} size={14} color={c.mutedForeground} />
          <Text numberOfLines={2} style={{ flex: 1, color: c.foreground, fontFamily: fonts.serif, fontSize: 19 }}>
            {node.title || "Untitled"}
          </Text>
        </View>
        {!!reveal && <Text style={{ color: c.emberInk, fontSize: 12 }}>{reveal}</Text>}
        {node.synopsis ? (
          <Text numberOfLines={6} style={{ color: c.foreground, fontSize: 14, lineHeight: 20 }}>
            {node.synopsis}
          </Text>
        ) : (
          <Text style={{ color: c.mutedForeground, fontSize: 14, fontStyle: "italic" }}>No synopsis yet</Text>
        )}
        {(!!footer || node.label) && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: "auto" }}>
            {node.label && <Dot color={node.label.color} size={8} />}
            <Text numberOfLines={1} style={{ color: c.mutedForeground, fontSize: 12 }}>
              {[node.label?.name, footer].filter(Boolean).join(" · ")}
            </Text>
          </View>
        )}
      </Pressable>
      {arranging && (
        <View style={{ justifyContent: "center" }}>
          <IconButton name="arrowUp" label={`Move ${node.title || "this card"} earlier`} disabled={first} onPress={() => onStep(-1)} />
          <IconButton name="arrowDown" label={`Move ${node.title || "this card"} later`} disabled={last} onPress={() => onStep(1)} />
        </View>
      )}
    </View>
  );
}
