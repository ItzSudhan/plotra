import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, SectionList, Text, View } from "react-native";
import { Icon } from "@/components/icon";
import { useMenu } from "@/components/menu";
import { Banner, Chip, Empty, IconButton, Loading, T } from "@/components/ui";
import { AsOfChip, Dot } from "@/components/views/as-of";
import { PromptSheet, type Prompt } from "@/components/views/prompt-sheet";
import { useResource } from "@/lib/cache";
import { hasText, kindIcon, kindLabel } from "@/lib/kinds";
import { openWeb, webUrl } from "@/lib/links";
import { useProject } from "@/lib/project";
import { useClient, useSession } from "@/lib/session";
import { canonicalDate, parseStoryDate } from "@/lib/story-calendar";
import { radius, space, useColors } from "@/lib/theme";
import { useHorizon } from "@/lib/use-horizon";
import { refreshViews, useViews, viewKeys, viewsApi, type ViewNode } from "@/lib/views-api";
import { ALL, buildTimeline, calendarFor, groupByDay, itemWhen, laneModeLabel, laneModeOf, type LaneMode, type TimelineItem } from "@/lib/views-model";

// The timeline on a phone: story time read top to bottom, a heading for each
// day, in the timeline's own calendar. Scenes come from their Story date (and
// last for their Duration), events are the timeline's own. Lanes (plot
// threads, POV, location) become chips to filter by. Under an "as of" release
// only what the audience knows by then is shown, as on the web.

const pickedKey = (projectId: string) => `plotra.views.timeline:${projectId}`;

type Section = { key: string; title: string; data: TimelineItem[] } | { key: "undated"; title: string; data: ViewNode[] };

export default function TimelineScreen() {
  const { projectId, timelineId: asked } = useLocalSearchParams<{ projectId: string; timelineId?: string }>();
  const c = useColors();
  const client = useClient();
  const { server } = useSession();
  const showMenu = useMenu();
  const { project } = useProject(projectId);
  const views = useViews(projectId);
  const nodes = useMemo(() => views.data?.nodes ?? [], [views.data]);
  const { releases, release, horizon, setAsOf } = useHorizon(projectId, views.data?.nodes);
  const [prompt, setPrompt] = useState<Prompt | null>(null);

  // Which timeline: the one asked for, else the one picked last time, else the first.
  const timelines = useMemo(() => nodes.filter((n) => n.kind === "timeline"), [nodes]);
  const [picked, setPicked] = useState<string | null>(asked ?? null);
  useEffect(() => {
    if (asked) return;
    void AsyncStorage.getItem(pickedKey(projectId)).then((id) => id && setPicked((p) => p ?? id));
  }, [asked, projectId]);
  const timeline = timelines.find((t) => t.id === picked) ?? timelines[0] ?? null;
  const pick = (id: string) => {
    setPicked(id);
    void AsyncStorage.setItem(pickedKey(projectId), id).catch(() => {});
  };

  const events = useResource(timeline ? viewKeys.events(projectId, timeline.id) : null, () => viewsApi.events(client, projectId, timeline!.id));
  const calendar = calendarFor(timeline, views.data?.calendars ?? []);

  // Lanes start as the timeline has them on the web; changing them here only changes this phone's view.
  const [laneMode, setLaneMode] = useState<LaneMode | null>(null);
  const lanesBy = laneMode ?? laneModeOf(timeline);
  const [lane, setLane] = useState<string | null>(null);

  const built = useMemo(
    () =>
      buildTimeline({
        nodes,
        events: timeline ? (events.data ?? []) : [],
        threads: views.data?.threads ?? [],
        cells: views.data?.cells ?? [],
        calendar,
        laneMode: lanesBy,
        knows: horizon ? horizon.knows : undefined,
      }),
    [calendar, events.data, horizon, lanesBy, nodes, timeline, views.data],
  );
  const laneOf = useMemo(() => new Map(built.lanes.map((l) => [l.key, l])), [built.lanes]);
  const shownLane = lane && laneOf.has(lane) ? lane : null;
  const sections = useMemo<Section[]>(() => {
    const items = shownLane ? built.items.filter((i) => i.lanes.includes(shownLane)) : built.items;
    const days: Section[] = groupByDay(items, calendar).map((g) => ({ key: g.key, title: g.label, data: g.items }));
    if (!shownLane && built.undated.length) days.push({ key: "undated", title: "No story date yet", data: built.undated });
    return days;
  }, [built, calendar, shownLane]);

  const concealed = horizon ? nodes.filter((n) => n.kind === "scene" && !horizon.knows(n.id)).length : 0;
  const canAddEvent = !!timeline?.canEdit;
  const openNote = (n: ViewNode) =>
    hasText(n.kind) ? router.push({ pathname: "/project/[projectId]/note/[noteId]", params: { projectId, noteId: n.id } }) : openWeb(webUrl(server, project, n.id));
  const editEvent = (eventId?: string, start?: number) =>
    timeline &&
    router.push({
      pathname: "/project/[projectId]/views/event",
      params: { projectId, timelineId: timeline.id, laneMode: lanesBy, ...(eventId && { eventId }), ...(start !== undefined && { start: String(start) }) },
    });

  /** Dates a scene without dragging, in words the calendar reads (the web's "Set date…"). */
  const setDate = (n: ViewNode) => {
    const defs = views.data?.propertyDefs ?? [];
    if (!defs.some((d) => d.nodeKind === n.kind && d.key === "story-date")) {
      Alert.alert(`${kindLabel[n.kind]}s don't have a Story date field yet`, "Add a field called Story date to them on the web (open one, then Properties in the inspector).");
      return;
    }
    const current = typeof n.properties["story-date"] === "string" ? (n.properties["story-date"] as string) : "";
    const example = canonicalDate(calendar, built.items[0]?.start ?? parseStoryDate(calendar, calendar.definition ? "1-01-01" : new Date().toISOString().slice(0, 10))!);
    setPrompt({
      title: `When does “${n.title || "Untitled"}” happen?`,
      message: calendar.definition ? `In the ${calendar.name} calendar.` : undefined,
      label: "Story date",
      value: current,
      placeholder: `e.g. ${example}`,
      confirmLabel: "Set date",
      validate: (text) => (parseStoryDate(calendar, text) === null ? `Write the date as year-month-day, e.g. ${example}` : null),
      onSubmit: async (text) => {
        await viewsApi.setProperties(client, projectId, n.id, { "story-date": canonicalDate(calendar, parseStoryDate(calendar, text)!) });
        refreshViews(projectId);
      },
      extra: current
        ? {
            label: "Take the date off",
            destructive: true,
            onPress: async () => {
              await viewsApi.setProperties(client, projectId, n.id, { "story-date": null });
              refreshViews(projectId);
            },
          }
        : undefined,
    });
  };

  const itemMenu = (item: TimelineItem) => {
    if (item.type === "scene") {
      const n = item.node!;
      return showMenu({
        title: item.title || "Untitled",
        message: itemWhen(item, calendar) || undefined,
        items: [
          { label: hasText(n.kind) ? "Read" : "Open on the web", icon: hasText(n.kind) ? "book" : "web", onPress: () => openNote(n) },
          ...(n.canEdit ? [{ label: "Change the date", icon: "calendar" as const, onPress: () => setDate(n) }] : []),
          ...(canAddEvent ? [{ label: "New event on this day", icon: "add" as const, onPress: () => editEvent(undefined, item.start) }] : []),
        ],
      });
    }
    const linked = item.event!.nodeId ? nodes.find((n) => n.id === item.event!.nodeId) : undefined;
    showMenu({
      title: item.title || "Event",
      message: item.event!.description || undefined,
      items: [
        ...(canAddEvent ? [{ label: "Edit event", icon: "edit" as const, onPress: () => editEvent(item.id) }] : []),
        ...(linked ? [{ label: `Open “${linked.title || "Untitled"}”`, icon: kindIcon[linked.kind], onPress: () => openNote(linked) }] : []),
        ...(canAddEvent ? [{ label: "New event on this day", icon: "add" as const, onPress: () => editEvent(undefined, item.start) }] : []),
      ],
    });
  };

  const moreMenu = () =>
    showMenu({
      title: timeline?.title || "Timeline",
      message: `${calendar.name} calendar`,
      items: [
        ...timelines.filter((t) => t.id !== timeline?.id).map((t) => ({ label: `Show “${t.title || "Untitled"}”`, icon: "timeline" as const, onPress: () => pick(t.id) })),
        { label: `Lanes: ${laneModeLabel[lanesBy]}`, icon: "details", onPress: lanesMenu },
        { label: "Open on the web", icon: "web", onPress: () => openWeb(webUrl(server, project, timeline?.id)) },
      ],
    });

  const lanesMenu = () =>
    showMenu({
      title: "Group into lanes by",
      message: "Only on this phone. The timeline on the web keeps its own.",
      items: (Object.keys(laneModeLabel) as LaneMode[]).map((m) => ({
        label: `${laneModeLabel[m]}${m === lanesBy ? " ✓" : ""}`,
        onPress: () => {
          setLaneMode(m);
          setLane(null);
        },
      })),
    });

  const loading = views.loading || (timeline && events.loading && !events.data);

  return (
    <>
      <Stack.Screen
        options={{
          title: timeline?.title || "Timeline",
          headerRight: () => (
            <View style={{ flexDirection: "row" }}>
              {canAddEvent && <IconButton name="add" label="New event" onPress={() => editEvent()} />}
              <IconButton name="more" label="More" onPress={moreMenu} />
            </View>
          ),
        }}
      />
      <SectionList<TimelineItem | ViewNode, Section>
        style={{ flex: 1, backgroundColor: c.background }}
        contentInsetAdjustmentBehavior="automatic"
        sections={sections as (Section & { data: (TimelineItem | ViewNode)[] })[]}
        keyExtractor={(item) => ("key" in item && typeof item.key === "string" ? item.key : (item as ViewNode).id)}
        stickySectionHeadersEnabled
        refreshControl={
          <RefreshControl
            refreshing={views.refreshing || events.refreshing}
            onRefresh={() => Promise.all([views.refresh(), events.refresh()]).then(() => {})}
            tintColor={c.mutedForeground}
          />
        }
        ListHeaderComponent={
          <View style={{ paddingBottom: space.sm }}>
            <Banner offline={views.offline || events.offline} error={views.offline ? null : (views.error ?? events.error)} onRetry={views.refresh} />
            {!timeline && views.data && (
              <T tone="muted" style={{ marginHorizontal: space.lg, marginTop: space.sm, fontSize: 13, lineHeight: 18 }}>
                Scenes with a Story date, in the Gregorian calendar. Make a timeline on the web to add events and use your own calendar.
              </T>
            )}
            <AsOfChip releases={releases} release={release} setAsOf={setAsOf} hint="What readers know once a release is out. The timeline shows only that." />
            {built.lanes.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.md }}>
                <Chip label="All lanes" selected={!shownLane} onPress={() => setLane(null)} />
                {built.lanes.map((l) => (
                  <Chip key={l.key} label={l.label} selected={shownLane === l.key} onPress={() => setLane(shownLane === l.key ? null : l.key)} />
                ))}
              </ScrollView>
            )}
            {concealed > 0 && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginHorizontal: space.lg, marginTop: space.md }}>
                <Icon name="hidden" size={14} color={c.mutedForeground} />
                <T tone="muted" style={{ fontSize: 13 }}>
                  {concealed} {concealed === 1 ? "scene isn't" : "scenes aren't"} revealed yet at this point
                </T>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <Loading />
          ) : views.data ? (
            <Empty
              icon="timeline"
              title={shownLane ? "Nothing in this lane" : "Nothing on the timeline yet"}
              body={shownLane ? "Choose another lane, or All lanes." : "Give a scene a Story date (hold it in the binder, or here once it's listed) and it appears here, on its day."}
            />
          ) : undefined
        }
        renderSectionHeader={({ section }) => (
          <View style={{ backgroundColor: c.background, paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.sm }}>
            <Text accessibilityRole="header" style={{ color: section.key === "undated" ? c.mutedForeground : c.foreground, fontSize: 15, fontWeight: "600" }}>
              {section.title}
            </Text>
          </View>
        )}
        renderItem={({ item, section }) =>
          section.key === "undated" ? (
            <UndatedRow node={item as ViewNode} onPress={() => ((item as ViewNode).canEdit ? setDate(item as ViewNode) : openNote(item as ViewNode))} onLongPress={() => openNote(item as ViewNode)} />
          ) : (
            <ItemRow
              item={item as TimelineItem}
              when={itemWhen(item as TimelineItem, calendar)}
              lanes={(item as TimelineItem).lanes.filter((l) => l !== ALL).map((l) => laneOf.get(l)).filter((l) => !!l)}
              onPress={() => {
                const i = item as TimelineItem;
                if (i.type === "scene") openNote(i.node!);
                else if (canAddEvent) editEvent(i.id);
                else itemMenu(i);
              }}
              onLongPress={() => itemMenu(item as TimelineItem)}
            />
          )
        }
      />
      <PromptSheet prompt={prompt} onClose={() => setPrompt(null)} />
    </>
  );
}

function ItemRow({ item, when, lanes, onPress, onLongPress }: { item: TimelineItem; when: string; lanes: { key: string; label: string; color?: string }[]; onPress: () => void; onLongPress: () => void }) {
  const c = useColors();
  const color = item.color ?? c.ember;
  const kind = item.type === "scene" ? kindLabel[item.node!.kind] : "Event";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${kind}: ${item.title || "Untitled"}${when ? `, ${when}` : ""}${lanes.length ? `, in ${lanes.map((l) => l.label).join(", ")}` : ""}`}
      accessibilityHint="Hold for more."
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => ({ flexDirection: "row", gap: space.md, marginHorizontal: space.lg, marginBottom: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: pressed ? c.accent : c.card, borderLeftWidth: 4, borderLeftColor: color })}
    >
      <Icon name={item.type === "scene" ? kindIcon[item.node!.kind] : "calendar"} size={18} color={c.mutedForeground} />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text numberOfLines={2} style={{ color: c.foreground, fontSize: 16, fontWeight: item.type === "event" ? "600" : "400" }}>
          {item.title || "Untitled"}
        </Text>
        {!!when && <Text style={{ color: c.mutedForeground, fontSize: 13 }}>{when}</Text>}
        {item.type === "scene" && !!item.node!.synopsis && (
          <Text numberOfLines={2} style={{ color: c.mutedForeground, fontSize: 13 }}>
            {item.node!.synopsis}
          </Text>
        )}
        {item.type === "event" && !!item.event!.description && (
          <Text numberOfLines={2} style={{ color: c.mutedForeground, fontSize: 13 }}>
            {item.event!.description}
          </Text>
        )}
        {lanes.length > 0 && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: 2 }}>
            {lanes.map((l) => (
              <View key={l.key} style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.sm, backgroundColor: c.muted }}>
                {!!l.color && <Dot color={l.color} size={8} />}
                <Text style={{ color: c.mutedForeground, fontSize: 12 }}>{l.label}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </Pressable>
  );
}

function UndatedRow({ node, onPress, onLongPress }: { node: ViewNode; onPress: () => void; onLongPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${node.title || "Untitled"}, no story date`}
      accessibilityHint={node.canEdit ? "Sets its date. Hold to read it." : "Opens it."}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, minHeight: 48, backgroundColor: pressed ? c.accent : "transparent" })}
    >
      <Icon name="scene" size={18} color={c.mutedForeground} />
      <Text numberOfLines={1} style={{ flex: 1, color: c.mutedForeground, fontSize: 15 }}>
        {node.title || "Untitled"}
      </Text>
      {node.canEdit && <Text style={{ color: c.emberInk, fontSize: 14 }}>Set date</Text>}
    </Pressable>
  );
}
