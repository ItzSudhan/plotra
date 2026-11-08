import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, RefreshControl, ScrollView, Text, View } from "react-native";
import { Field } from "@/components/field";
import { Banner, Button, Card, Empty, Loading, Row, SectionLabel, Separator } from "@/components/ui";
import { useResource } from "@/lib/cache";
import { ago, words } from "@/lib/links";
import { useProject } from "@/lib/project";
import { history, historyKey, historyProblem, saveVersion, versionTitle, type Version } from "@/lib/reader-api";
import { useClient } from "@/lib/session";
import { space, useColors } from "@/lib/theme";

// A note's history, as on the web (components/workflow/history-panel.tsx):
// versions saved by name, and the automatic ones Plotra keeps every half hour
// while people write. Tap one to read it, rename or delete it, or put the
// note back to it.

export default function HistoryScreen() {
  const { projectId, noteId } = useLocalSearchParams<{ projectId: string; noteId: string }>();
  const c = useColors();
  const client = useClient();
  const { notes } = useProject(projectId);
  const title = notes.data?.find((n) => n.id === noteId)?.title || "Untitled";
  const list = useResource(historyKey(projectId, noteId), () => history(client, projectId, noteId));
  const data = list.data;
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await saveVersion(client, projectId, noteId, name.trim() || null);
      setName("");
      await list.refresh();
    } catch (e) {
      Alert.alert("Couldn't save a version", historyProblem(e));
    } finally {
      setBusy(false);
    }
  };

  const open = (v: Version) => router.push({ pathname: "/project/[projectId]/history/[noteId]/[versionId]", params: { projectId, noteId, versionId: v.id } });

  return (
    <>
      <Stack.Screen options={{ title: "History" }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: c.background }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: space.lg, paddingBottom: 64, gap: space.lg, maxWidth: 720, width: "100%", alignSelf: "center" }}
        refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} tintColor={c.mutedForeground} />}
      >
        <Banner offline={list.offline} error={list.offline ? null : list.error} onRetry={list.refresh} />
        <Text numberOfLines={2} style={{ color: c.mutedForeground, fontSize: 15 }}>
          Versions of “{title}”
        </Text>

        {data?.canEdit && data.isDocument && (
          <View style={{ gap: space.md }}>
            <Field
              label="Save what it says now"
              placeholder="Name this version (optional)"
              value={name}
              onChangeText={setName}
              maxLength={80}
              returnKeyType="done"
              onSubmitEditing={() => void save()}
            />
            <Button label="Save a version" icon="bookmark" variant="secondary" busy={busy} onPress={() => void save()} />
          </View>
        )}

        {!data ? (
          list.loading ? <Loading /> : <Empty icon="history" title="History isn't here" body="Open it once while you're online to keep it on your phone." />
        ) : data.versions.length === 0 ? (
          <Empty icon="history" title="No versions yet" body="Plotra keeps one automatically every half hour while people write, and you can save named ones any time." />
        ) : (
          <View>
            <SectionLabel>{data.versions.length === 1 ? "1 version" : `${data.versions.length} versions`}</SectionLabel>
            <Card>
              {data.versions.map((v, i) => (
                <View key={v.id}>
                  {i > 0 && <Separator inset={52} />}
                  <Row
                    icon={v.auto ? "history" : "bookmark"}
                    iconColor={v.auto ? c.mutedForeground : c.emberInk}
                    title={versionTitle(v)}
                    subtitle={[ago(v.createdAt), words(v.wordCount), v.authorName].filter(Boolean).join(" · ")}
                    accessibilityHint="Opens this version to read it"
                    onPress={() => open(v)}
                  />
                </View>
              ))}
            </Card>
          </View>
        )}
      </ScrollView>
    </>
  );
}
