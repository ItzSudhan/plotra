import { router, Stack, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Choice } from "@/components/choice";
import { Button, Card, Chip, Separator, T } from "@/components/ui";
import { isOffline } from "@/lib/api";
import { useResource } from "@/lib/cache";
import { clearExports, exportChoices, exportProject, laidOutChoices, layouts, scriptProjectTypes, shareExport, type ExportChoice } from "@/lib/io-api";
import { useProject } from "@/lib/project";
import { useClient } from "@/lib/session";
import { space, useColors } from "@/lib/theme";
import { childrenOf, pathOf } from "@/lib/tree";
import { useHorizon } from "@/lib/use-horizon";

// Export (the web's Export… dialog, apps/app/components/io/export-dialog.tsx):
// the whole project, a folder or chapter, or one note, as Word, a PDF, RTF,
// Markdown, plain text, Final Draft, an e-book, an outline, AO3 chapters, or a
// Plotra project file for another Plotra. Word, PDF, RTF and plain text are
// laid out in one of the web's layouts (apps/app/lib/io/compile.ts), on the
// paper chosen. The file is built on the server
// (/api/mobile/export), kept in the phone's cache and offered to the share
// sheet: save it to Files, mail it, AirDrop it, open it in another app.
// Optional `rootId`: what to export, preselected.

const WHOLE = "";
// Kinds that aren't text: boards can't be exported on their own.
const BOARDS = new Set(["canvas", "timeline", "dialogue"]);

export default function ExportScreen() {
  const { projectId, rootId: initialRoot } = useLocalSearchParams<{ projectId: string; rootId?: string }>();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const client = useClient();
  const { project, notes } = useProject(projectId);
  const { releases, release } = useHorizon(projectId, notes.data);
  const [choice, setChoice] = useState<ExportChoice>("docx");
  const [rootId, setRootId] = useState(initialRoot ?? WHOLE);
  // "As of" starts at the release the phone shows the project as of, as the web's starts at its own.
  const [horizonId, setHorizonId] = useState<string | null | undefined>(undefined);
  const asOfId = horizonId === undefined ? (release?.id ?? null) : horizonId;
  const asOf = releases.find((r) => r.id === asOfId) ?? null;
  const [busy, setBusy] = useState(false);
  const layoutList = useResource("export-layouts", () => layouts(client));
  const [presetId, setPresetId] = useState("standard");
  const [paper, setPaper] = useState<"letter" | "a4">("letter");
  const preset = layoutList.data?.presets.find((p) => p.id === presetId) ?? layoutList.data?.presets[0];
  const laidOut = laidOutChoices.has(choice);

  const list = useMemo(() => notes.data ?? [], [notes.data]);
  // Folders and chapters can always be picked, and anything with something inside it; the note it was opened on too.
  const roots = useMemo(() => {
    const children = childrenOf(list);
    return list.filter((n) => !BOARDS.has(n.kind) && (n.kind === "folder" || n.kind === "chapter" || n.id === initialRoot || (children.get(n.id)?.length ?? 0) > 0));
  }, [list, initialRoot]);
  const root = roots.find((n) => n.id === rootId) ?? null;
  const whole = choice === "plotra";
  const script = !!project && scriptProjectTypes.has(project.type);
  const shown = exportChoices.filter((x) => !x.script || script || choice === x.id);

  const run = async () => {
    setBusy(true);
    try {
      const compile = laidOut && preset ? { ...preset.options, paper } : null;
      const file = await exportProject(client, { projectId, choice, rootId: whole ? null : root?.id, horizonId: whole ? null : asOf?.id, compile });
      setBusy(false);
      await shareExport(file);
      // Shared, or the sheet was closed: either way the copy in the cache has done its job.
      clearExports();
    } catch (e) {
      setBusy(false);
      if (isOffline(e)) Alert.alert("You're offline", "Exporting needs a connection: the file is made on the server. Try again when you're back online.");
      else Alert.alert("The export didn't work", (e as Error).message);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: "Export",
          headerLeft: () => (
            <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={8}>
              <Text style={{ color: c.foreground, fontSize: 17 }}>Close</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: insets.bottom + space.xxl }}>
        <T tone="muted" style={{ fontSize: 15, lineHeight: 21 }}>
          Your text, in a file you can open anywhere.
        </T>

        <View style={{ gap: 6 }}>
          <Label>What</Label>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, opacity: whole ? 0.5 : 1 }} accessibilityRole="radiogroup">
            <Chip label={`The whole project${project ? `: ${project.title}` : ""}`} selected={whole || !root} onPress={() => setRootId(WHOLE)} />
            {!whole && roots.map((n) => <Chip key={n.id} label={[...pathOf(list, n.id), n.title || "Untitled"].join(" › ")} selected={root?.id === n.id} onPress={() => setRootId(n.id)} />)}
          </View>
        </View>

        {releases.length > 0 && !whole && (
          <View style={{ gap: 6 }}>
            <Label>As of</Label>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }} accessibilityRole="radiogroup">
              <Chip label="Everything" selected={!asOf} onPress={() => setHorizonId(null)} />
              {releases.map((r) => (
                <Chip key={r.id} label={r.title} selected={asOf?.id === r.id} onPress={() => setHorizonId(r.id)} />
              ))}
            </View>
          </View>
        )}

        <View style={{ gap: 6 }}>
          <Label>Format</Label>
          <Card>
            <View accessibilityRole="radiogroup" accessibilityLabel="Format">
              {shown.map((x, i) => (
                <View key={x.id}>
                  {i > 0 && <Separator inset={space.lg + 20 + space.md} />}
                  <Choice icon={x.icon} title={x.title} detail={x.detail} selected={choice === x.id} onPress={() => setChoice(x.id)} />
                </View>
              ))}
            </View>
          </Card>
        </View>

        {laidOut && !!layoutList.data && (
          <View style={{ gap: 6 }}>
            <Label>Layout</Label>
            <Card>
              <View accessibilityRole="radiogroup" accessibilityLabel="Layout">
                {layoutList.data.presets.map((p, i) => (
                  <View key={p.id}>
                    {i > 0 && <Separator inset={space.lg + 20 + space.md} />}
                    <Choice icon="scene" title={p.title} detail={p.description} selected={preset?.id === p.id} onPress={() => setPresetId(p.id)} />
                  </View>
                ))}
              </View>
            </Card>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.xs }} accessibilityRole="radiogroup" accessibilityLabel="Paper">
              {layoutList.data.papers.map((p) => (
                <Chip key={p.id} label={p.label} selected={paper === p.id} onPress={() => setPaper(p.id)} />
              ))}
            </View>
          </View>
        )}

        <T tone="muted" style={{ fontSize: 13, lineHeight: 18 }}>
          {whole
            ? `Everything as last saved (a few seconds behind). Who it's shared with, chats, agent conversations and statistics stay in Plotra. Importing it makes a new project.`
            : `${asOf ? `As of ${asOf.title}: only what's revealed by then is exported. ` : ""}The text is as last saved (a few seconds behind). Comments are left out, and suggestions nobody has accepted aren't applied.${
                choice === "pdf" ? " The PDF is made on this phone; it has no running header or page numbers." : ""
              }`}
        </T>

        <Button label={busy ? "Exporting…" : "Export and share"} icon="exportFile" busy={busy} onPress={() => void run()} />
      </ScrollView>
    </>
  );
}

function Label({ children }: { children: string }) {
  const c = useColors();
  return <Text style={{ color: c.mutedForeground, fontSize: 13, fontWeight: "600" }}>{children}</Text>;
}
