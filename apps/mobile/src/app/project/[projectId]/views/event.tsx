import { router, Stack, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { Field } from "@/components/field";
import { Button, Chip, Empty, Loading } from "@/components/ui";
import { isOffline } from "@/lib/api";
import { invalidate, useResource } from "@/lib/cache";
import { useClient } from "@/lib/session";
import { canonicalDate, formatDate, formatDuration, parseDuration, parseStoryDate } from "@/lib/story-calendar";
import { radius, space, useColors } from "@/lib/theme";
import { useViews, viewKeys, viewsApi, type TimelineEvent } from "@/lib/views-api";
import { buildTimeline, calendarFor, NONE, swatches, type LaneMode } from "@/lib/views-model";

// A timeline event, new or changed: what happens, when, for how long, in
// which lane, in what colour. Dates are written in the timeline's calendar,
// as on the web ("1820-05-03 14:00"); how long as "3 days" or "2h".

export default function EventScreen() {
  const { projectId, timelineId, eventId, start, laneMode } = useLocalSearchParams<{ projectId: string; timelineId: string; eventId?: string; start?: string; laneMode?: LaneMode }>();
  const client = useClient();
  const views = useViews(projectId);
  const events = useResource(viewKeys.events(projectId, timelineId), () => viewsApi.events(client, projectId, timelineId));
  const timeline = views.data?.nodes.find((n) => n.id === timelineId) ?? null;
  const event = eventId ? events.data?.find((e) => e.id === eventId) : undefined;

  if (!views.data || (eventId && !events.data)) return <Loading />;
  if (eventId && !event) return <Empty icon="timeline" title="This event isn't on the timeline any more" body="Someone may have deleted it." />;
  return (
    <Form
      key={event?.id ?? "new"}
      projectId={projectId}
      timelineId={timelineId}
      event={event}
      start={start ? Number(start) : undefined}
      calendar={calendarFor(timeline, views.data.calendars)}
      lanes={buildTimeline({ nodes: views.data.nodes, events: [], threads: views.data.threads, cells: views.data.cells, calendar: calendarFor(timeline, views.data.calendars), laneMode: laneMode ?? "none" }).lanes}
      laneMode={laneMode ?? "none"}
      onSaved={() => invalidate(viewKeys.events(projectId, timelineId))}
    />
  );
}

function Form({
  projectId,
  timelineId,
  event,
  start,
  calendar,
  lanes,
  laneMode,
  onSaved,
}: {
  projectId: string;
  timelineId: string;
  event?: TimelineEvent;
  start?: number;
  calendar: ReturnType<typeof calendarFor>;
  lanes: { key: string; label: string }[];
  laneMode: LaneMode;
  onSaved: () => void;
}) {
  const c = useColors();
  const client = useClient();
  const today = useMemo(() => parseStoryDate(calendar, calendar.definition ? "1-01-01" : new Date().toISOString().slice(0, 10))!, [calendar]);
  const [title, setTitle] = useState(event?.title ?? "");
  const [when, setWhen] = useState(canonicalDate(calendar, event?.start ?? start ?? today));
  const [length, setLength] = useState(event && event.end !== null && event.end > event.start ? formatDuration(calendar, event.end - event.start) : "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [lane, setLane] = useState<string | null>(event?.lane ?? null);
  const [color, setColor] = useState<string | null>(event?.color ?? swatches[4]);
  const [busy, setBusy] = useState(false);

  const at = parseStoryDate(calendar, when);
  const duration = length.trim() ? parseDuration(calendar, length) : null;
  const problem = at === null ? `Write the date as year-month-day, e.g. ${canonicalDate(calendar, today)}` : length.trim() && duration === null ? "Write how long as, say, “3 days”, “2h” or “1 week”." : null;

  const fail = (e: unknown) => Alert.alert("That didn't save", isOffline(e) ? "You're offline. Try again when you're back online." : (e as Error).message);

  const save = async () => {
    if (problem || at === null) return;
    setBusy(true);
    const input = { title: title.trim() || "Event", start: at, end: duration ? at + duration : null, description: description.trim() || null, lane, color };
    try {
      if (event) await viewsApi.updateEvent(client, projectId, timelineId, event.id, input);
      else await viewsApi.createEvent(client, projectId, timelineId, input);
      onSaved();
      router.back();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const remove = () =>
    event &&
    Alert.alert(`Delete “${event.title}”?`, "It comes off the timeline for everyone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await viewsApi.deleteEvent(client, projectId, timelineId, event.id);
            onSaved();
            router.back();
          } catch (e) {
            fail(e);
          }
        },
      },
    ]);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: c.background }}>
      <Stack.Screen options={{ title: event ? "Event" : "New event" }} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.lg, gap: space.lg }}>
        <Field label="What happens" value={title} onChangeText={setTitle} placeholder="The battle of the ford" autoFocus={!event} />
        <Field
          label="When"
          value={when}
          onChangeText={setWhen}
          autoCapitalize="none"
          autoCorrect={false}
          hint={at !== null ? `${formatDate(calendar, at)}${calendar.definition ? ` · ${calendar.name}` : ""}` : "Year-month-day, and a time if you like: 1820-05-03 14:00"}
        />
        <Field label="How long (optional)" value={length} onChangeText={setLength} placeholder="3 days" autoCapitalize="none" autoCorrect={false} />
        {!!problem && <Text style={{ color: c.destructive, fontSize: 13 }}>{problem}</Text>}
        <Field label="Notes (optional)" value={description} onChangeText={setDescription} multiline />
        {laneMode !== "none" && lanes.length > 1 && (
          <View style={{ gap: 6 }}>
            <Text style={{ color: c.mutedForeground, fontSize: 13, fontWeight: "600" }}>Lane</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
              {lanes.map((l) => (
                <Chip key={l.key} label={l.label} selected={(lane ?? NONE) === l.key} onPress={() => setLane(l.key === NONE ? null : l.key)} />
              ))}
            </View>
          </View>
        )}
        <View style={{ gap: 6 }}>
          <Text style={{ color: c.mutedForeground, fontSize: 13, fontWeight: "600" }}>Colour</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {swatches.map((s) => (
              <Pressable
                key={s}
                accessibilityRole="radio"
                accessibilityLabel={`Colour ${swatches.indexOf(s) + 1}`}
                accessibilityState={{ selected: color === s }}
                onPress={() => setColor(s)}
                style={{ width: 36, height: 36, borderRadius: radius.pill, backgroundColor: s, borderWidth: color === s ? 3 : 0, borderColor: c.foreground }}
              />
            ))}
          </View>
        </View>
        <Button label={event ? "Save" : "Add to the timeline"} busy={busy} disabled={!!problem} onPress={() => void save()} />
        {event && <Button label="Delete event" variant="destructive" disabled={busy} onPress={remove} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
