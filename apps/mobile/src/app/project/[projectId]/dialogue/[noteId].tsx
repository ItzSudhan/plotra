import { Stack, useLocalSearchParams } from "expo-router";
import { useMemo, useRef, useState, type ComponentRef } from "react";
import { FlatList, Pressable, ScrollView, Text, View } from "react-native";
import { orderedNodes, successors, type DialogueGraph, type DialogueNode } from "@/components/maps/dialogue/model";
import { choose, continuePlay, formatValue, startPlay, type PlayEntry, type PlayState } from "@/components/maps/dialogue/play";
import { Segmented } from "@/components/maps/parts";
import { useMenu } from "@/components/menu";
import { Banner, Button, Empty, IconButton, Loading, Separator } from "@/components/ui";
import { useResource } from "@/lib/cache";
import { openWeb, webUrl } from "@/lib/links";
import { getDialogue, mapKeys } from "@/lib/maps-api";
import { useProject } from "@/lib/project";
import { useClient, useSession } from "@/lib/session";
import { fonts, radius, space, useColors } from "@/lib/theme";
import { useHorizon } from "@/lib/use-horizon";

// A branching dialogue (the web's components/views/dialogue-view.tsx), to read
// on the phone. Play goes through it as a player would, with the web's own
// play-through (components/maps/dialogue/play.ts, a copy): lines, then the
// choices on offer, conditions and variables worked out as they would be in
// the game. The outline shows every card in reading order with where it leads.
// Editing dialogues is for the web.

const typeLabel: Record<DialogueNode["type"], string> = {
  start: "Start",
  line: "Line",
  choice: "Choice",
  condition: "If",
  set: "Set",
  random: "Random",
  call: "Call",
  return: "Return",
  end: "End",
};

export default function DialogueScreen() {
  const { projectId, noteId } = useLocalSearchParams<{ projectId: string; noteId: string }>();
  const c = useColors();
  const client = useClient();
  const { server } = useSession();
  const showMenu = useMenu();
  const { project, notes } = useProject(projectId);
  const { horizon } = useHorizon(projectId, notes.data);
  const dialogue = useResource(mapKeys.dialogue(projectId, noteId), () => getDialogue(client, projectId, noteId));
  const [display, setDisplay] = useState<"play" | "outline">("play");

  const all = useMemo(() => notes.data ?? [], [notes.data]);
  const self = all.find((n) => n.id === noteId);
  // A speaker readers haven't met yet isn't named under a horizon.
  const speakerName = (node: { speakerId?: string; speaker?: string }) => {
    if (node.speakerId) {
      const n = all.find((x) => x.id === node.speakerId);
      if (n) return horizon && !horizon.knows(n.id) ? "Someone readers haven't met" : n.title || "Untitled";
    }
    return node.speaker?.trim() || "";
  };

  const menu = () => showMenu({ title: self?.title || "Dialogue", items: [{ label: "Edit on the web", icon: "web", onPress: () => openWeb(webUrl(server, project, noteId)) }] });

  const graph = dialogue.data;
  const empty = graph && !Object.keys(graph.nodes).length;

  return (
    <>
      <Stack.Screen options={{ title: self?.title || "Dialogue", headerRight: () => <IconButton name="more" label="More" onPress={menu} /> }} />
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <Banner offline={dialogue.offline} error={dialogue.offline ? null : dialogue.error} onRetry={dialogue.refresh} />
        {!graph ? (
          dialogue.loading ? <Loading /> : <Empty icon="dialogue" title="Couldn't open the dialogue" body={dialogue.error?.message} action={<Button label="Try again" variant="secondary" onPress={dialogue.refresh} />} />
        ) : empty ? (
          <Empty icon="dialogue" title="Nothing written yet" body="Write the lines and choices on the web, then read them through here." />
        ) : (
          <>
            <View style={{ paddingHorizontal: space.lg, paddingVertical: space.sm }}>
              <Segmented
                value={display}
                onChange={setDisplay}
                options={[
                  { value: "play", label: "Play through" },
                  { value: "outline", label: "Outline" },
                ]}
              />
            </View>
            {display === "play" ? <Player graph={graph} speakerName={speakerName} /> : <Outline graph={graph} speakerName={speakerName} />}
          </>
        )}
      </View>
    </>
  );
}

type SpeakerName = (node: { speakerId?: string; speaker?: string }) => string;

function Player({ graph, speakerName }: { graph: DialogueGraph; speakerName: SpeakerName }) {
  const c = useColors();
  // Every step kept, so Back is just the one before (the engine is pure).
  const [steps, setSteps] = useState<PlayState[]>(() => [startPlay(graph)]);
  // The dialogue changed on the server (not just fetched again): start again with the new one.
  const content = useMemo(() => JSON.stringify(graph), [graph]);
  const [contentFor, setContentFor] = useState(content);
  if (contentFor !== content) {
    setContentFor(content);
    setSteps([startPlay(graph)]);
  }
  const [showVariables, setShowVariables] = useState(false);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const state = steps[steps.length - 1];
  const step = (next: PlayState) => setSteps((s) => [...s, next]);
  const variables = Object.entries(state.variables);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView ref={scroll} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })} contentContainerStyle={{ padding: space.lg, gap: space.md }}>
        {state.transcript.map((entry, i) => (
          <Entry key={i} entry={entry} speaker={entry.kind === "line" ? speakerName(entry) : ""} />
        ))}
        {state.status === "ended" && (
          <Text style={{ color: c.mutedForeground, fontSize: 14, textAlign: "center", marginTop: space.md }}>
            {state.ending === "end" ? "The end." : state.ending === "stuck" ? "It stops here: something needs fixing on the web." : "Nothing follows from here."}
          </Text>
        )}
      </ScrollView>
      {showVariables && variables.length > 0 && (
        <View style={{ marginHorizontal: space.lg, padding: space.md, borderRadius: radius.md, backgroundColor: c.muted, gap: 2 }}>
          {variables.map(([name, value]) => (
            <Text key={name} style={{ color: c.foreground, fontFamily: fonts.mono, fontSize: 13 }}>
              {name} = {formatValue(value)}
            </Text>
          ))}
        </View>
      )}
      <View style={{ padding: space.lg, gap: space.sm, borderTopWidth: 1, borderColor: c.border }}>
        {state.status === "choices" &&
          state.options.map((o) => (
            <Pressable
              key={o.nodeId}
              accessibilityRole="button"
              onPress={() => step(choose(graph, state, o.nodeId))}
              style={({ pressed }) => ({ minHeight: 48, justifyContent: "center", paddingHorizontal: space.lg, paddingVertical: space.sm, borderRadius: radius.md, borderWidth: 1.5, borderColor: c.ember, backgroundColor: pressed ? c.emberSoft : "transparent" })}
            >
              <Text style={{ color: c.foreground, fontSize: 16 }}>{o.text || "(an empty choice)"}</Text>
            </Pressable>
          ))}
        {state.status === "line" && <Button label="Continue" onPress={() => step(continuePlay(graph, state))} />}
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <IconButton name="undo" label="Back a step" disabled={steps.length < 2} onPress={() => setSteps((s) => s.slice(0, -1))} />
          {variables.length > 0 && (
            <Pressable accessibilityRole="button" onPress={() => setShowVariables((v) => !v)} style={{ justifyContent: "center", paddingHorizontal: space.md }}>
              <Text style={{ color: c.mutedForeground, fontSize: 14 }}>{showVariables ? "Hide variables" : `Variables (${variables.length})`}</Text>
            </Pressable>
          )}
          <IconButton name="restart" label="Start again" onPress={() => setSteps([startPlay(graph)])} />
        </View>
      </View>
    </View>
  );
}

function Entry({ entry, speaker }: { entry: PlayEntry; speaker: string }) {
  const c = useColors();
  if (entry.kind === "line")
    return (
      <View style={{ gap: 2 }}>
        {!!speaker && <Text style={{ color: c.emberInk, fontSize: 13, fontWeight: "600", letterSpacing: 0.3 }}>{speaker.toUpperCase()}</Text>}
        <Text style={{ color: c.foreground, fontFamily: fonts.serif, fontSize: 18, lineHeight: 26 }}>{entry.text}</Text>
      </View>
    );
  if (entry.kind === "choice")
    return (
      <View style={{ alignSelf: "flex-end", maxWidth: "85%", paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.md, backgroundColor: c.emberSoft }}>
        <Text style={{ color: c.foreground, fontSize: 16 }}>{entry.text}</Text>
      </View>
    );
  return <Text style={{ color: entry.kind === "problem" ? c.destructive : c.mutedForeground, fontSize: 13, fontFamily: entry.kind === "set" || entry.kind === "condition" ? fonts.mono : undefined }}>{entry.kind === "condition" ? `${entry.text}: ${entry.result ? "yes" : "no"}` : entry.text}</Text>;
}

function Outline({ graph, speakerName }: { graph: DialogueGraph; speakerName: SpeakerName }) {
  const c = useColors();
  const order = useMemo(() => orderedNodes(graph), [graph]);
  const number = useMemo(() => new Map(order.map((id, i) => [id, i + 1])), [order]);
  const summary = (id: string) => {
    const n = graph.nodes[id];
    if (!n) return "?";
    const text = n.type === "condition" || n.type === "set" ? n.expr : n.text;
    return `${number.get(id)}. ${typeLabel[n.type]}${text ? `: ${text.length > 40 ? `${text.slice(0, 39)}…` : text}` : ""}`;
  };
  return (
    <FlatList
      data={order}
      keyExtractor={(id) => id}
      contentContainerStyle={{ paddingBottom: space.xxl }}
      ItemSeparatorComponent={() => <Separator />}
      renderItem={({ item: id }) => {
        const n = graph.nodes[id];
        const speaker = n.type === "line" ? speakerName(n) : "";
        const then =
          n.type === "condition"
            ? [
                ...successors(graph, id, "true").map((t) => `If so → ${summary(t)}`),
                ...successors(graph, id, "false").map((t) => `If not → ${summary(t)}`),
              ]
            : [...(n.type === "call" && n.target && graph.nodes[n.target] ? [`Calls → ${summary(n.target)}`] : []), ...successors(graph, id).map((t) => `→ ${summary(t)}`)];
        const body = n.type === "condition" || n.type === "set" ? n.expr : n.text;
        return (
          <View accessible style={{ paddingHorizontal: space.lg, paddingVertical: space.md, gap: 4 }}>
            <Text style={{ color: c.mutedForeground, fontSize: 12, fontWeight: "600" }}>
              {number.get(id)}. {typeLabel[n.type].toUpperCase()}
              {speaker ? ` · ${speaker}` : ""}
              {n.once ? " · once only" : ""}
            </Text>
            {!!body && <Text style={{ color: c.foreground, fontSize: 16, lineHeight: 22, fontFamily: n.type === "condition" || n.type === "set" ? fonts.mono : fonts.serif }}>{body}</Text>}
            {!!n.note && <Text style={{ color: c.mutedForeground, fontSize: 13, fontStyle: "italic" }}>{n.note}</Text>}
            {then.map((t) => (
              <Text key={t} numberOfLines={1} style={{ color: c.mutedForeground, fontSize: 13 }}>
                {t}
              </Text>
            ))}
          </View>
        );
      }}
    />
  );
}
