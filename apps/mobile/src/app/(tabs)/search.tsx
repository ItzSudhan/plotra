import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import { Icon } from "@/components/icon";
import { TabScreen } from "@/components/screen";
import { Card, Chip, Empty, Loading, Row, SectionLabel, Separator, T } from "@/components/ui";
import { isOffline } from "@/lib/api";
import { keys, readCache, useResource } from "@/lib/cache";
import { kindIcon } from "@/lib/kinds";
import { useClient } from "@/lib/session";
import { radius, space, useColors } from "@/lib/theme";
import type { Hit, Note, Project } from "@/lib/types";

// Words anywhere in your projects. "quoted phrases", or, -word work as on the web.
// Offline, it looks through the titles saved on the phone instead.

/** Searching every project at once asks this many, most recently changed first. */
const MAX_PROJECTS = 12;

type Group = { project: Project; hits: Hit[] };

export default function Search() {
  const c = useColors();
  const client = useClient();
  const projects = useResource(keys.projects, client.projects);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<string | null>(null);
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const run = useRef(0);

  useEffect(() => {
    const q = query.trim();
    const list = projects.data ?? [];
    if (!q || !list.length) return;
    const id = ++run.current;
    const timer = setTimeout(async () => {
      setBusy(true);
      const targets = (scope ? list.filter((p) => p.id === scope) : [...list].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))).slice(0, MAX_PROJECTS);
      let wentOffline = false;
      const found = await Promise.all(
        targets.map(async (project) => {
          try {
            return { project, hits: await client.search(project.id, q, scope ? 40 : 8) };
          } catch (e) {
            if (!isOffline(e)) return { project, hits: [] };
            wentOffline = true;
            return { project, hits: await searchSaved(project.id, q) };
          }
        }),
      );
      if (id !== run.current) return;
      setOffline(wentOffline);
      setGroups(found.filter((g) => g.hits.length));
      setBusy(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, scope, projects.data, client]);

  // Results only count for the words still in the box.
  const shown = query.trim() ? groups : null;

  return (
    <TabScreen title="Search">
      <View style={{ marginHorizontal: space.lg, marginTop: space.sm, flexDirection: "row", alignItems: "center", gap: space.sm, height: 44, borderRadius: radius.md, backgroundColor: c.muted, paddingHorizontal: space.md }}>
        <Icon name="search" size={18} color={c.mutedForeground} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search your notes"
          placeholderTextColor={c.mutedForeground}
          returnKeyType="search"
          autoCorrect={false}
          clearButtonMode="while-editing"
          accessibilityLabel="Search your notes"
          style={{ flex: 1, color: c.foreground, fontSize: 16 }}
        />
      </View>

      {(projects.data?.length ?? 0) > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm, paddingTop: space.md }}>
          <Chip label="All projects" selected={!scope} onPress={() => setScope(null)} />
          {projects.data!.map((p) => (
            <Chip key={p.id} label={p.title} selected={scope === p.id} onPress={() => setScope(p.id)} />
          ))}
        </ScrollView>
      )}

      {offline && (
        <T tone="muted" style={{ marginHorizontal: space.lg, marginTop: space.md, fontSize: 13 }}>
          You&apos;re offline, so this only looks at titles saved on your phone.
        </T>
      )}

      {!query.trim() ? (
        <Empty icon="search" title="Find anything" body={'Search titles and text across your projects. Use "quotes" for a phrase, or a minus to leave a word out.'} />
      ) : busy && !shown ? (
        <Loading />
      ) : shown && shown.length === 0 ? (
        <Empty icon="search" title="Nothing found" body={`No notes match “${query.trim()}”.`} />
      ) : (
        shown?.map(({ project, hits }) => (
          <View key={project.id}>
            <SectionLabel>{project.title}</SectionLabel>
            <Card style={{ marginHorizontal: space.lg }}>
              {hits.map((hit, i) => (
                <View key={hit.id}>
                  {i > 0 && <Separator inset={52} />}
                  <Row
                    icon={kindIcon[hit.kind]}
                    title={hit.title}
                    subtitle={hit.snippet || null}
                    onPress={() => router.push({ pathname: "/project/[projectId]/note/[noteId]", params: { projectId: project.id, noteId: hit.id } })}
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

/** Titles, aliases and tags of the notes saved on the phone that contain every word. */
async function searchSaved(projectId: string, q: string): Promise<Hit[]> {
  const notes = (await readCache<Note[]>(keys.notes(projectId))) ?? [];
  const words = q
    .toLowerCase()
    .replace(/["']/g, "")
    .split(/\s+/)
    .filter((w) => w && !w.startsWith("-") && w !== "or");
  return notes
    .filter((n) => {
      const hay = [n.title, ...n.aliases, ...n.tags, n.synopsis ?? ""].join(" ").toLowerCase();
      return words.every((w) => hay.includes(w));
    })
    .slice(0, 20)
    .map((n) => ({ id: n.id, title: n.title, kind: n.kind, snippet: n.synopsis ?? "" }));
}
