import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Alert, FlatList, Text, View } from "react-native";
import { absolute, boardScene, cardText, readingOrder, type CardNote } from "@/components/maps/board-scene";
import type { Point } from "@/components/maps/layout";
import MapCanvas from "@/components/maps/map-canvas";
import { canvasDom, Hint, InfoSheet, Segmented, TextSheet, useSceneTheme } from "@/components/maps/parts";
import { useMenu } from "@/components/menu";
import { Banner, Button, Empty, IconButton, Loading, Row, Separator } from "@/components/ui";
import { isOffline } from "@/lib/api";
import { useResource } from "@/lib/cache";
import { kindIcon } from "@/lib/kinds";
import { openWeb, webUrl } from "@/lib/links";
import { changeBoard, getBoard, mapKeys, noteRoute, type Board, type BoardChange } from "@/lib/maps-api";
import { useProject } from "@/lib/project";
import { useClient, useSession } from "@/lib/session";
import { space, useColors } from "@/lib/theme";
import { useHorizon } from "@/lib/use-horizon";

// A board (a canvas or storyboard, the web's components/views/storyboard-view.tsx):
// its cards and arrows, to pan and pinch about. Tap a note card to open its
// note. Someone who can edit the board can move cards and add or change text
// cards; each change goes into the board's live document on the server, so
// anyone with it open on the web sees it arrive. Pen strokes aren't drawn
// here, and a board made as a map opens on the web.

type Sheet = { mode: "add"; at: Point } | { mode: "edit"; id: string; text: string };

export default function BoardScreen() {
  const { projectId, noteId } = useLocalSearchParams<{ projectId: string; noteId: string }>();
  const c = useColors();
  const theme = useSceneTheme();
  const client = useClient();
  const { server } = useSession();
  const showMenu = useMenu();
  const { project, notes } = useProject(projectId);
  const { horizon } = useHorizon(projectId, notes.data);
  const board = useResource(mapKeys.board(projectId, noteId), () => getBoard(client, projectId, noteId));

  const [display, setDisplay] = useState<"map" | "list">("map");
  const [moving, setMoving] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [fitKey, setFitKey] = useState(0);

  const all = useMemo(() => notes.data ?? [], [notes.data]);
  const self = all.find((n) => n.id === noteId);
  const canEdit = !!self?.canEdit && !!board.data && !board.data.map;
  const noteOf = useCallback(
    (id: string): CardNote | undefined => {
      const n = all.find((x) => x.id === id);
      return n && { title: n.title || "Untitled", synopsis: n.synopsis, known: !horizon || horizon.knows(n.id) };
    },
    [all, horizon],
  );
  const scene = useMemo(() => (board.data ? boardScene(board.data, noteOf, { movable: canEdit, accent: c.ember, line: c.mutedForeground }) : { nodes: [], edges: [] }), [board.data, noteOf, canEdit, c.ember, c.mutedForeground]);

  const fail = (e: unknown) => {
    Alert.alert("Couldn't change the board", isOffline(e) ? "You're offline. Boards are changed live, so try again when you're back online." : (e as Error).message);
    void board.refresh();
  };

  /** Shows a change at once, sends it, and takes the board as the server has it after. */
  const send = async (change: BoardChange, show: (b: Board) => Board) => {
    board.mutate((b) => (b ? show(b) : b));
    try {
      await changeBoard(client, projectId, noteId, change);
      void board.refresh();
    } catch (e) {
      fail(e);
    }
  };

  const onMove = async (id: string, x: number, y: number) => {
    const card = board.data?.cards[id];
    if (!card) return;
    // A card in a group keeps its place relative to the group.
    const parent = card.parentId && board.data?.cards[card.parentId] ? absolute(board.data.cards, card.parentId) : { x: 0, y: 0 };
    const next = { x: x - parent.x, y: y - parent.y };
    await send({ action: "move", id, ...next }, (b) => ({ ...b, cards: { ...b.cards, [id]: { ...card, ...next } } }));
  };

  const onTapNode = async (id: string) => {
    if (placing) return;
    setSelected(id);
  };
  const onTapBackground = async (at: Point) => {
    setSelected(null);
    if (placing) {
      setPlacing(false);
      setSheet({ mode: "add", at });
    }
  };

  const finishSheet = async (text: string | null) => {
    const s = sheet;
    setSheet(null);
    if (text === null || !s) return;
    if (s.mode === "add") {
      if (!text.trim()) return;
      // Centred where they tapped, the size the web gives a text card.
      const x = Math.round(s.at.x - 100);
      const y = Math.round(s.at.y - 50);
      await send({ action: "add-text", text, x, y }, (b) => ({ ...b, cards: { ...b.cards, [`new-${Date.now()}`]: { type: "text", text, x, y, w: 200, h: 100 } } }));
    } else {
      const card = board.data?.cards[s.id];
      if (!card || text === s.text) return;
      await send({ action: "set-text", id: s.id, text }, (b) => ({ ...b, cards: { ...b.cards, [s.id]: { ...card, text } } }));
    }
  };

  const menu = () =>
    showMenu({
      title: self?.title || "Board",
      items: [
        ...(canEdit
          ? [
              { label: moving ? "Stop moving cards" : "Move cards", icon: "moveCards" as const, onPress: () => setMoving((m) => !m) },
              { label: "Add a text card", icon: "add" as const, onPress: () => {
                  setDisplay("map");
                  setPlacing(true);
                },
              },
            ]
          : []),
        { label: "Open on the web", icon: "web" as const, onPress: () => openWeb(webUrl(server, project, noteId)) },
      ],
    });

  const card = selected ? board.data?.cards[selected] : undefined;
  const cardNote = card?.nodeId ? all.find((n) => n.id === card.nodeId) : undefined;
  const cardKnown = !cardNote || !horizon || horizon.knows(cardNote.id);
  const shown = card && cardText(card, card.nodeId ? noteOf(card.nodeId) : undefined);
  const order = useMemo(() => (board.data ? readingOrder(board.data) : []), [board.data]);

  const strokes = board.data ? Object.values(board.data.cards).filter((k) => k.type === "stroke").length : 0;

  return (
    <>
      <Stack.Screen
        options={{
          title: self?.title || "Board",
          headerRight: () => (
            <View style={{ flexDirection: "row" }}>
              {display === "map" && <IconButton name="fit" label="Fit the board on screen" onPress={() => setFitKey((k) => k + 1)} />}
              <IconButton name="more" label="More" onPress={menu} />
            </View>
          ),
        }}
      />
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <Banner offline={board.offline} error={board.offline ? null : board.error} onRetry={board.refresh} />
        {!board.data ? (
          board.loading ? <Loading /> : <Empty icon="board" title="Couldn't open the board" body={board.error?.message} action={<Button label="Try again" variant="secondary" onPress={board.refresh} />} />
        ) : board.data.map ? (
          <MapBoard board={board.data} titleOf={(id) => noteOf(id)} onOpen={(id) => {
              const n = all.find((x) => x.id === id);
              if (n) router.push(noteRoute(projectId, n));
            }} onWeb={() => openWeb(webUrl(server, project, noteId))} />
        ) : !scene.nodes.length && !placing ? (
          <Empty icon="board" title="An empty board" body={canEdit ? "Add a text card here, or note cards on the web." : "Nothing has been put on it yet."} action={canEdit ? <Button label="Add a text card" icon="add" variant="secondary" onPress={() => setSheet({ mode: "add", at: { x: 100, y: 50 } })} /> : undefined} />
        ) : (
          <>
            <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm }}>
              <Segmented
                value={display}
                onChange={setDisplay}
                options={[
                  { value: "map", label: "Board" },
                  { value: "list", label: "List" },
                ]}
              />
            </View>
            {placing && <Hint text="Tap an empty spot on the board to put a text card there." action="Cancel" onAction={() => setPlacing(false)} />}
            {moving && !placing && <Hint text="Drag a card to move it. Two fingers still pan and zoom." action="Done" onAction={() => setMoving(false)} />}
            {display === "list" ? (
              <FlatList
                data={order}
                keyExtractor={(id) => id}
                ItemSeparatorComponent={() => <Separator inset={52} />}
                ListFooterComponent={strokes ? <Text style={{ color: c.mutedForeground, fontSize: 13, padding: space.lg }}>Drawings made with the pen show on the web.</Text> : undefined}
                renderItem={({ item }) => {
                  const k = board.data!.cards[item];
                  const t = cardText(k, k.nodeId ? noteOf(k.nodeId) : undefined);
                  const n = k.nodeId ? all.find((x) => x.id === k.nodeId) : undefined;
                  return (
                    <Row
                      icon={n ? kindIcon[n.kind] : k.type === "image" ? "picture" : "note"}
                      title={t.label || t.body.split("\n")[0] || "Empty card"}
                      subtitle={t.label ? t.body : t.body.split("\n").slice(1).join(" ")}
                      onPress={() => {
                        setSelected(item);
                        setDisplay("map");
                      }}
                    />
                  );
                }}
              />
            ) : (
              <View style={{ flex: 1, marginTop: space.sm, borderTopWidth: 1, borderColor: c.border }}>
                <MapCanvas
                  nodes={scene.nodes}
                  edges={scene.edges}
                  theme={theme}
                  layout="given"
                  selectedId={selected}
                  moving={moving}
                  fitKey={fitKey}
                  onTapNode={onTapNode}
                  onTapBackground={onTapBackground}
                  onMove={onMove}
                  dom={canvasDom(c.background)}
                />
                {card && shown && (
                  <InfoSheet
                    title={shown.label || (card.type === "sticky" ? "Sticky note" : "Text card")}
                    subtitle={card.type === "note" ? (cardKnown ? "Note card" : "Readers don't know this note yet") : null}
                    body={shown.label ? shown.body : shown.body || "Empty"}
                    onClose={() => setSelected(null)}
                    actions={[
                      ...(cardNote && cardKnown ? [{ label: "Open the note", icon: kindIcon[cardNote.kind], onPress: () => router.push(noteRoute(projectId, cardNote)) }] : []),
                      ...(canEdit && (card.type === "text" || card.type === "sticky") ? [{ label: "Change the text", icon: "edit" as const, onPress: () => setSheet({ mode: "edit", id: selected!, text: card.text ?? "" }) }] : []),
                    ]}
                  />
                )}
              </View>
            )}
          </>
        )}
      </View>
      <TextSheet visible={!!sheet} title={sheet?.mode === "edit" ? "Card text" : "New text card"} initial={sheet?.mode === "edit" ? sheet.text : ""} onDone={finishSheet} />
    </>
  );
}

/** A board made as a map: the phone lists what's pinned and drawn on it. */
function MapBoard({ board, titleOf, onOpen, onWeb }: { board: Board; titleOf: (id: string) => CardNote | undefined; onOpen: (id: string) => void; onWeb: () => void }) {
  const c = useColors();
  const marks = Object.entries(board.marks).filter(([, m]) => m.nodeId || m.label);
  return (
    <FlatList
      data={marks}
      keyExtractor={([id]) => id}
      ItemSeparatorComponent={() => <Separator inset={52} />}
      ListHeaderComponent={
        <Empty icon="map" title="Maps open on the web" body="The picture and what's drawn on it are laid out for a bigger screen. Here's what's marked on it." action={<Button label="Open on the web" icon="web" variant="secondary" onPress={onWeb} />} />
      }
      renderItem={({ item: [, m] }) => {
        const note = m.nodeId ? titleOf(m.nodeId) : undefined;
        const hiddenNote = note && !note.known;
        return (
          <Row
            icon={m.type === "pin" ? "place" : "map"}
            title={hiddenNote ? "Not revealed yet" : m.label || note?.title || "A mark"}
            subtitle={[m.type === "pin" ? "Pin" : m.type === "region" ? "Region" : "Path", m.layer, !hiddenNote && m.label && note ? note.title : null].filter(Boolean).join(" · ")}
            onPress={m.nodeId && note && !hiddenNote ? () => onOpen(m.nodeId!) : undefined}
          />
        );
      }}
      ListFooterComponent={marks.length ? undefined : <Text style={{ color: c.mutedForeground, textAlign: "center", padding: space.lg }}>Nothing is marked on it yet.</Text>}
    />
  );
}
