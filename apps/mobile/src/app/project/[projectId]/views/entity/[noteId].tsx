import { router, Stack, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { Icon } from "@/components/icon";
import { MarkdownView } from "@/components/markdown-view";
import { useMenu } from "@/components/menu";
import { Banner, Button, Card, Empty, IconButton, Loading, Separator, Tag, Title } from "@/components/ui";
import { Dot } from "@/components/views/as-of";
import { PromptSheet, type Prompt } from "@/components/views/prompt-sheet";
import { isOffline } from "@/lib/api";
import { keys, useResource } from "@/lib/cache";
import { hasText, kindIcon, kindLabel } from "@/lib/kinds";
import { openWeb, webUrl } from "@/lib/links";
import type { Wiki } from "@/lib/markdown";
import { useProject } from "@/lib/project";
import { useClient, useSession } from "@/lib/session";
import { space, useColors } from "@/lib/theme";
import { resolveLink } from "@/lib/tree";
import { useHorizon } from "@/lib/use-horizon";
import { refreshViews, useViews, viewKeys, viewsApi, type PropertyDef, type PropertyValue, type ViewNode } from "@/lib/views-api";
import { canonLabel, defsFor, editableField, propertyText } from "@/lib/views-model";

// A codex entry's page: what it is, its fields (the web's inspector
// properties, or its world-bible type's), its text, and the notes that
// mention it. Fields of the simple kinds can be changed here; links to other
// notes and multiple choices are changed on the web.

export default function EntityScreen() {
  const { projectId, noteId } = useLocalSearchParams<{ projectId: string; noteId: string }>();
  const c = useColors();
  const client = useClient();
  const { server } = useSession();
  const showMenu = useMenu();
  const { project, notes } = useProject(projectId);
  const views = useViews(projectId);
  const { release, horizon, releases } = useHorizon(projectId, views.data?.nodes);
  const asOf = release?.id ?? null;
  const page = useResource(keys.note(projectId, noteId, asOf), () => client.note(projectId, noteId, asOf));
  const links = useResource(viewKeys.links(projectId, noteId), () => viewsApi.backlinks(client, projectId, noteId));
  const [prompt, setPrompt] = useState<Prompt | null>(null);

  const nodes = useMemo(() => views.data?.nodes ?? [], [views.data]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const node = byId.get(noteId);
  const type = node?.kind === "entity" ? views.data?.entityTypes.find((t) => t.id === node.entityTypeId) : undefined;
  const defs = node && views.data ? defsFor(node, views.data.propertyDefs, views.data.entityTypes) : [];
  const titleOf = (id: string) => byId.get(id)?.title;
  // Under a horizon, "Mentioned in" lists only notes readers know about.
  const mentions = (links.data ?? []).filter((l) => byId.has(l.id) && (!horizon || horizon.knows(l.id)));
  const revealedIn = node?.revealReleaseId ? releases.find((r) => r.id === node.revealReleaseId)?.title : undefined;

  const fail = (e: unknown) => Alert.alert("That didn't save", isOffline(e) ? "You're offline. Try again when you're back online." : (e as Error).message);
  const setField = async (key: string, value: PropertyValue) => {
    views.mutate((data) => data && { ...data, nodes: data.nodes.map((n) => (n.id === noteId ? { ...n, properties: { ...n.properties, [key]: value } } : n)) });
    await viewsApi.setProperties(client, projectId, noteId, { [key]: value });
    refreshViews(projectId);
  };

  const editField = (def: PropertyDef) => {
    if (!node?.canEdit || !editableField(def.type)) return;
    const value = node.properties[def.key];
    if (def.type === "checkbox") return void setField(def.key, !value).catch(fail);
    if (def.type === "select") {
      return showMenu({
        title: def.label,
        items: [
          ...(def.options.choices ?? []).map((choice) => ({ label: `${choice}${choice === value ? " ✓" : ""}`, onPress: () => void setField(def.key, choice).catch(fail) })),
          ...(value ? [{ label: "Clear", icon: "close" as const, destructive: true, onPress: () => void setField(def.key, null).catch(fail) }] : []),
        ],
      });
    }
    setPrompt({
      title: def.label,
      label: def.label,
      value: value === null || value === undefined ? "" : String(value),
      multiline: def.type === "text",
      placeholder: def.type === "date" ? "1820-05-03" : def.type === "url" ? "https://" : undefined,
      validate: (text) => (def.type === "number" && text.trim() && !Number.isFinite(Number(text)) ? "Write a number." : null),
      onSubmit: (text) => setField(def.key, text.trim() ? (def.type === "number" ? Number(text) : text.trim()) : null),
    });
  };

  const onWiki = (wiki: Wiki) => {
    const target = resolveLink(notes.data ?? [], wiki.title);
    if (target) router.push({ pathname: "/project/[projectId]/note/[noteId]", params: { projectId, noteId: target.id } });
    else Alert.alert(`No note called “${wiki.title}”`, "It may have been renamed or moved to the trash.");
  };

  const menu = () =>
    node &&
    showMenu({
      title: node.title || "Untitled",
      items: [
        ...(node.canEdit && hasText(node.kind) ? [{ label: "Edit text", icon: "edit" as const, onPress: () => router.push({ pathname: "/project/[projectId]/edit/[noteId]", params: { projectId, noteId } }) }] : []),
        ...(node.canEdit ? [{ label: "Details", icon: "details" as const, onPress: () => router.push({ pathname: "/project/[projectId]/details/[noteId]", params: { projectId, noteId } }) }] : []),
        { label: "Open on the web", icon: "web", onPress: () => openWeb(webUrl(server, project, noteId)) },
      ],
    });

  if (!node) return views.loading ? <Loading /> : <Empty icon="globe" title="Not in the codex" body="It may have been moved to the trash, or you can't see it any more." />;
  const canon = canonLabel[node.canon];
  const unknown = !!horizon && !horizon.knows(node.id);

  return (
    <>
      <Stack.Screen options={{ title: "", headerRight: () => <IconButton name="more" label="More" onPress={menu} /> }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: c.background }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: space.xxl }}
        refreshControl={
          <RefreshControl
            refreshing={views.refreshing || page.refreshing}
            onRefresh={() => Promise.all([views.refresh(), page.refresh(), links.refresh()]).then(() => {})}
            tintColor={c.mutedForeground}
          />
        }
      >
        <Banner offline={views.offline || page.offline} error={views.offline ? null : (views.error ?? page.error)} onRetry={page.refresh} />
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.md, gap: space.sm }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
            {type ? <Dot color={type.color} size={9} /> : <Icon name={kindIcon[node.kind]} size={14} color={c.mutedForeground} />}
            <Text style={{ color: c.mutedForeground, fontSize: 13 }}>
              {[type?.name ?? kindLabel[node.kind], node.aliases.length ? `also ${node.aliases.join(", ")}` : null, revealedIn ? `revealed in ${revealedIn}` : null].filter(Boolean).join(" · ")}
            </Text>
            {node.canon !== "canon" && (
              <View accessible accessibilityLabel={`${canon.label}: ${canon.description}`} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Dot color={canon.color} size={7} />
                <Text style={{ color: c.mutedForeground, fontSize: 13 }}>{canon.label}</Text>
              </View>
            )}
          </View>
          <Title>{node.title || "Untitled"}</Title>
          {unknown && <Text style={{ color: c.emberInk, fontSize: 13 }}>{"Readers don't know about this yet at this point."}</Text>}
          {!!node.synopsis && <Text style={{ color: c.mutedForeground, fontSize: 16, lineHeight: 23, fontStyle: "italic" }}>{node.synopsis}</Text>}
          {node.tags.length > 0 && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {node.tags.map((t) => (
                <Tag key={t} label={t} />
              ))}
            </View>
          )}
        </View>

        {defs.length > 0 && (
          <Card style={{ marginHorizontal: space.lg, marginTop: space.lg }}>
            {defs.map((def, i) => {
              const text = propertyText(def.type, node.properties[def.key], titleOf);
              const editable = node.canEdit && editableField(def.type);
              return (
                <View key={def.id}>
                  {i > 0 && <Separator inset={space.md} />}
                  <Pressable
                    accessibilityRole={editable ? "button" : undefined}
                    accessibilityLabel={`${def.label}: ${text || "empty"}`}
                    accessibilityHint={editable ? "Changes it." : node.canEdit ? "Changed on the web." : undefined}
                    disabled={!editable}
                    onPress={() => editField(def)}
                    style={({ pressed }) => ({ paddingHorizontal: space.md, paddingVertical: space.md, gap: 2, backgroundColor: pressed ? c.accent : "transparent" })}
                  >
                    <Text style={{ color: c.mutedForeground, fontSize: 12, fontWeight: "600" }}>{def.label}</Text>
                    <Text style={{ color: text ? c.foreground : c.mutedForeground, fontSize: 15 }}>{text || (editable ? "Add" : "—")}</Text>
                  </Pressable>
                </View>
              );
            })}
          </Card>
        )}

        <View style={{ paddingHorizontal: space.lg, paddingTop: space.xl }}>
          {page.loading && !page.data ? (
            <Loading />
          ) : page.data?.markdown?.trim() ? (
            <MarkdownView markdown={page.data.markdown} onWiki={onWiki} />
          ) : (
            <Text style={{ color: c.mutedForeground, fontSize: 15 }}>{page.data?.revealed === false ? "Its page isn't revealed yet at this point." : "Nothing written on this page yet."}</Text>
          )}
          {node.canEdit && hasText(node.kind) && (
            <Button label="Edit text" icon="edit" variant="secondary" style={{ marginTop: space.lg }} onPress={() => router.push({ pathname: "/project/[projectId]/edit/[noteId]", params: { projectId, noteId } })} />
          )}
        </View>

        <Text accessibilityRole="header" style={{ color: c.mutedForeground, fontSize: 13, fontWeight: "600", paddingHorizontal: space.lg, paddingTop: space.xl, paddingBottom: space.sm }}>
          Mentioned in{links.data ? ` (${mentions.length})` : ""}
        </Text>
        {links.data && mentions.length === 0 && <Text style={{ color: c.mutedForeground, fontSize: 14, paddingHorizontal: space.lg }}>Nothing links here yet.</Text>}
        {mentions.map((l) => (
          <MentionRow key={l.id} node={byId.get(l.id)!} context={l.context} onPress={() => router.push({ pathname: "/project/[projectId]/note/[noteId]", params: { projectId, noteId: l.id } })} />
        ))}
      </ScrollView>
      <PromptSheet prompt={prompt} onClose={() => setPrompt(null)} />
    </>
  );
}

function MentionRow({ node, context, onPress }: { node: ViewNode; context: string | null; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: "row", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm, minHeight: 48, backgroundColor: pressed ? c.accent : "transparent" })}
    >
      <View style={{ paddingTop: 2 }}>
        <Icon name={kindIcon[node.kind]} size={16} color={c.mutedForeground} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: c.foreground, fontSize: 15 }}>
          {node.title || "Untitled"}
        </Text>
        {!!context && (
          <Text numberOfLines={2} style={{ color: c.mutedForeground, fontSize: 13 }}>
            {context}
          </Text>
        )}
      </View>
    </Pressable>
  );
}
