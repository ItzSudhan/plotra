import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Icon } from "@/components/icon";
import { TabScreen } from "@/components/screen";
import { Banner, Button, Card, Empty, IconButton, Loading, Row, SectionLabel, Separator } from "@/components/ui";
import { keys, useResource } from "@/lib/cache";
import { kindIcon, projectTypeLabel } from "@/lib/kinds";
import { ago, openWeb } from "@/lib/links";
import { useOutbox } from "@/lib/outbox";
import { listRecent, type Recent } from "@/lib/recent";
import { useClient } from "@/lib/session";
import { refreshTextIndex } from "@/lib/text-index";
import { radius, space, useColors } from "@/lib/theme";
import type { Project } from "@/lib/types";

// Home: notes opened lately, then every project, by workspace.

export default function Library() {
  const c = useColors();
  const client = useClient();
  const projects = useResource(keys.projects, client.projects);
  const { pending, failed } = useOutbox();
  const [recent, setRecent] = useState<Recent[]>([]);

  useFocusEffect(
    useCallback(() => {
      void listRecent().then(setRecent);
    }, []),
  );

  const groups = useMemo(() => groupByWorkspace(projects.data ?? []), [projects.data]);

  // Keep every project's text on the phone, for searching offline. One at a time, in the background.
  useEffect(() => {
    if (!projects.data || projects.offline) return;
    let stop = false;
    void (async () => {
      for (const p of projects.data ?? []) {
        if (stop) return;
        await refreshTextIndex(client, p.id);
      }
    })();
    return () => {
      stop = true;
    };
  }, [projects.data, projects.offline, client]);

  return (
    <TabScreen
      title="Library"
      refreshing={projects.refreshing}
      onRefresh={projects.refresh}
      actions={<IconButton name="capture" label="Quick note" onPress={() => router.push("/capture")} color={c.emberInk} />}
    >
      <Banner offline={projects.offline} error={projects.offline ? null : projects.error} onRetry={projects.refresh} />

      {(pending.length > 0 || failed.length > 0) && (
        <Pressable accessibilityRole="button" onPress={() => router.navigate("/account")} style={{ marginHorizontal: space.lg, marginTop: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: c.muted, flexDirection: "row", gap: space.sm, alignItems: "center" }}>
          <Icon name="sync" size={16} color={c.mutedForeground} />
          <Text style={{ flex: 1, color: c.mutedForeground, fontSize: 13 }}>
            {failed.length > 0 ? `${failed.length} ${failed.length === 1 ? "change" : "changes"} couldn't be sent. Tap to see.` : `${pending.length} ${pending.length === 1 ? "change is" : "changes are"} waiting to be sent.`}
          </Text>
        </Pressable>
      )}

      {recent.length > 0 && (
        <>
          <SectionLabel>Lately</SectionLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm }}>
            {recent.map((r) => (
              <Pressable
                key={r.noteId}
                accessibilityRole="button"
                accessibilityLabel={`${r.title}, in ${r.projectTitle}`}
                onPress={() => router.push({ pathname: "/project/[projectId]/note/[noteId]", params: { projectId: r.projectId, noteId: r.noteId } })}
                style={({ pressed }) => ({ width: 168, padding: space.md, borderRadius: radius.lg, backgroundColor: pressed ? c.accent : c.card, borderWidth: 1, borderColor: c.border, gap: 6 })}
              >
                <Icon name={kindIcon[r.kind]} size={18} color={c.emberInk} />
                <Text numberOfLines={2} style={{ color: c.foreground, fontSize: 15, fontWeight: "500", minHeight: 38 }}>
                  {r.title || "Untitled"}
                </Text>
                <Text numberOfLines={1} style={{ color: c.mutedForeground, fontSize: 12 }}>
                  {r.projectTitle} · {ago(r.at)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </>
      )}

      {projects.loading && !projects.data ? (
        <Loading />
      ) : projects.data && projects.data.length === 0 ? (
        <Empty
          icon="book"
          title="No projects yet"
          body="Start your first project on Plotra's website. It shows up here as soon as it's made."
          action={<Button label="Start a project" icon="web" variant="secondary" onPress={() => openWeb(client.server)} />}
        />
      ) : (
        groups.map((group) => (
          <View key={group.name}>
            <SectionLabel>{group.name}</SectionLabel>
            <Card style={{ marginHorizontal: space.lg }}>
              {group.projects.map((p, i) => (
                <View key={p.id}>
                  {i > 0 && <Separator inset={52} />}
                  <Row
                    icon="book"
                    iconColor={c.emberInk}
                    title={p.title}
                    subtitle={`${projectTypeLabel(p.type)} · ${ago(p.updatedAt)}`}
                    right={<Icon name="chevronRight" size={14} color={c.mutedForeground} />}
                    onPress={() => router.push({ pathname: "/project/[projectId]", params: { projectId: p.id, title: p.title } })}
                  />
                </View>
              ))}
            </Card>
          </View>
        ))
      )}
    </TabScreen>
  );
}

function groupByWorkspace(projects: Project[]): { name: string; projects: Project[] }[] {
  const map = new Map<string, Project[]>();
  for (const p of [...projects].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))) {
    const name = p.workspaceName ?? "Shared with you";
    map.set(name, [...(map.get(name) ?? []), p]);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, list]) => ({ name, projects: list }));
}
