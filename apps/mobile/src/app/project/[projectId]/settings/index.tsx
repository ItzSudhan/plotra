import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Switch, Text, View } from "react-native";
import { Field } from "@/components/field";
import { Icon } from "@/components/icon";
import { useMenu } from "@/components/menu";
import { Banner, Button, Card, Chip, Loading, Row, SectionLabel, Separator, T } from "@/components/ui";
import { invalidate, keys, useResource } from "@/lib/cache";
import { openWeb, webUrl } from "@/lib/links";
import { useProject } from "@/lib/project";
import { useClient } from "@/lib/session";
import { deleteProject, getProjectSettings, settingsKeys, updateProjectSettings, type ProjectSettingsPatch, type ProjectSettingsView } from "@/lib/settings-api";
import { radius, space, useColors } from "@/lib/theme";

// Project settings, as the web's Project settings → General and Tools have
// them (apps/app/components/workspace/project-settings-dialog.tsx): the
// title, the kind of story, the tools, and the rest a writer changes. The
// workflow, words, labels, kinds, webhooks and GitHub stay on the web.
// Changes save as they're made, for everyone in the project.

const versionChoices = [
  { value: 10, label: "10 min" },
  { value: 30, label: "30 min" },
  { value: 60, label: "1 hour" },
  { value: 180, label: "3 hours" },
  { value: 0, label: "Never" },
];

export default function ProjectSettingsScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const c = useColors();
  const client = useClient();
  const menu = useMenu();
  const { project } = useProject(projectId);
  const data = useResource(settingsKeys.projectSettings(projectId), () => getProjectSettings(client, projectId));
  const s = data.data;
  const [title, setTitle] = useState("");
  const [logline, setLogline] = useState("");
  const [typeBefore, setTypeBefore] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);

  // The boxes start from what the server has, and follow it when it changes (React's "adjust state while rendering").
  const [seen, setSeen] = useState<string | null>(null);
  const server = s ? `${s.title}\n${s.description ?? ""}` : null;
  if (s && server !== seen) {
    setSeen(server);
    setTitle(s.title);
    setLogline(s.description ?? "");
  }

  const save = async (patch: ProjectSettingsPatch, optimistic?: (v: ProjectSettingsView) => ProjectSettingsView) => {
    if (optimistic) data.mutate((v) => (v ? optimistic(v) : v));
    try {
      await updateProjectSettings(client, projectId, patch);
      if (patch.title !== undefined || patch.type !== undefined) invalidate(keys.projects);
    } catch (e) {
      Alert.alert("Couldn't save that", (e as Error).message);
    }
    await data.refresh();
  };

  const confirmDelete = () => {
    if (!s) return;
    Alert.alert(`Delete “${s.title}”?`, "Every note, version, comment and uploaded file in it is deleted, for everyone it's shared with. Projects that use it as their shared world lose the link. This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete forever",
        style: "destructive",
        onPress: async () => {
          setDeleting(true);
          try {
            await deleteProject(client, projectId, typed);
            invalidate(keys.projects);
            router.dismissTo("/");
            Alert.alert(`Deleted “${s.title}”.`);
          } catch (e) {
            setDeleting(false);
            Alert.alert("Couldn't delete it", (e as Error).message);
          }
        },
      },
    ]);
  };

  const web = project ? webUrl(client.server, project) : client.server;
  const locked = !s?.canManage;
  const typeLabel = (id: string) => s?.types.find((t) => t.id === id)?.label ?? id;
  const changedTools = s?.modules.filter((m) => m.on !== m.byDefault) ?? [];

  return (
    <>
      <Stack.Screen options={{ title: "Project settings" }} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: c.background }}>
        <ScrollView contentContainerStyle={{ paddingBottom: space.xxl * 2 }} keyboardShouldPersistTaps="handled">
          <Banner offline={data.offline} error={data.offline ? null : data.error} onRetry={data.refresh} />
          {!s ? (
            <Loading />
          ) : (
            <>
              {locked && (
                <View style={{ flexDirection: "row", gap: space.sm, margin: space.lg, marginBottom: 0, padding: space.md, borderRadius: radius.md, backgroundColor: c.muted }}>
                  <Icon name="lock" size={16} color={c.mutedForeground} />
                  <T tone="muted" style={{ flex: 1, fontSize: 13, lineHeight: 18 }}>
                    Only the workspace&apos;s owners and admins can change these settings. You can see them here.
                  </T>
                </View>
              )}

              <View style={{ padding: space.lg, gap: space.lg }}>
                <Field
                  label="Title"
                  value={title}
                  onChangeText={setTitle}
                  editable={!locked}
                  returnKeyType="done"
                  onEndEditing={() => title.trim() && title.trim() !== s.title && void save({ title: title.trim() })}
                />
                <Field
                  label="Logline"
                  value={logline}
                  onChangeText={setLogline}
                  editable={!locked}
                  multiline
                  placeholder="One or two sentences. Used on the series bible and the public wiki."
                  onEndEditing={() => logline.trim() !== (s.description ?? "") && void save({ description: logline.trim() || null })}
                />
              </View>

              <SectionLabel>What kind of story</SectionLabel>
              <View style={{ paddingHorizontal: space.lg, gap: space.sm }}>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                  {s.types.map((t) => (
                    <Chip
                      key={t.id}
                      label={t.label}
                      selected={s.type === t.id}
                      onPress={
                        locked || s.type === t.id
                          ? undefined
                          : () => {
                              setTypeBefore(s.type);
                              void save({ type: t.id }, (v) => ({ ...v, type: t.id }));
                            }
                      }
                    />
                  ))}
                </View>
                <T tone="muted" style={{ fontSize: 13, lineHeight: 18 }}>
                  This picks which tools start switched on. Tools you&apos;ve switched on or off yourself stay as they are.
                </T>
                {typeBefore && typeBefore !== s.type && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: c.muted }}>
                    <T style={{ flex: 1, fontSize: 13, lineHeight: 18 }}>
                      Now a {typeLabel(s.type)}. Its usual tools are switched on; any you set yourself stay as they were.
                    </T>
                    <Button
                      label="Undo"
                      variant="ghost"
                      style={{ height: 36, paddingHorizontal: space.md }}
                      onPress={() => {
                        const back = typeBefore;
                        setTypeBefore(null);
                        void save({ type: back }, (v) => ({ ...v, type: back }));
                      }}
                    />
                  </View>
                )}
              </View>

              <SectionLabel>New scenes are written as</SectionLabel>
              <View style={{ paddingHorizontal: space.lg, gap: space.sm }}>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                  {s.formats.map((f) => (
                    <Chip key={f.id} label={f.label} selected={s.format === f.id} onPress={locked ? undefined : () => void save({ format: f.id }, (v) => ({ ...v, format: f.id }))} />
                  ))}
                </View>
                <T tone="muted" style={{ fontSize: 13 }}>
                  {s.formats.find((f) => f.id === s.format)?.description}
                </T>
              </View>

              <SectionLabel
                right={
                  !locked && changedTools.length > 0 ? (
                    <Text
                      accessibilityRole="button"
                      onPress={() => void save({ modules: Object.fromEntries(changedTools.map((m) => [m.id, null])) })}
                      style={{ color: c.emberInk, fontSize: 13 }}
                    >
                      Back to the defaults
                    </Text>
                  ) : undefined
                }
              >
                Tools · {s.modules.filter((m) => m.on).length} of {s.modules.length} on
              </SectionLabel>
              <Card style={{ marginHorizontal: space.lg }}>
                {s.modules.map((m, i) => (
                  <View key={m.id}>
                    {i > 0 && <Separator inset={space.lg} />}
                    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.md, padding: space.lg }}>
                      <View style={{ flex: 1, gap: 4 }}>
                        <Text style={{ color: c.foreground, fontSize: 16, fontWeight: "500" }}>{m.label}</Text>
                        <Text style={{ color: c.mutedForeground, fontSize: 13, lineHeight: 18 }}>{m.description}</Text>
                      </View>
                      <Switch
                        value={m.on}
                        disabled={locked}
                        accessibilityLabel={m.label}
                        // Back to the type's default clears the choice, so a later change of type applies again.
                        onValueChange={(on) => void save({ modules: { [m.id]: on === m.byDefault ? null : on } }, (v) => ({ ...v, modules: v.modules.map((x) => (x.id === m.id ? { ...x, on } : x)) }))}
                      />
                    </View>
                  </View>
                ))}
              </Card>

              <SectionLabel>Shared world bible</SectionLabel>
              <Card style={{ marginHorizontal: space.lg }}>
                <Row
                  icon="globe"
                  title={s.worldId ? (s.worlds.find((w) => w.id === s.worldId)?.title ?? "The linked world") : "None: this project keeps its own world"}
                  subtitle="A series, a show and a game can share one world: its characters, places and entities appear in this project's codex."
                  onPress={
                    locked
                      ? undefined
                      : () =>
                          menu({
                            title: "Shared world bible",
                            message: "Who can see the world is still decided by the world project's own sharing.",
                            items: [
                              { label: "None: keep its own world", onPress: () => void save({ worldId: null }, (v) => ({ ...v, worldId: null })) },
                              ...s.worlds.map((w) => ({ label: `${w.title} (${w.type})`, onPress: () => void save({ worldId: w.id }, (v) => ({ ...v, worldId: w.id })) })),
                            ],
                          })
                  }
                  right={!locked ? <Icon name="chevronDown" size={12} color={c.mutedForeground} /> : undefined}
                />
              </Card>

              <SectionLabel>Automatic versions</SectionLabel>
              <View style={{ paddingHorizontal: space.lg, gap: space.sm }}>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                  {versionChoices.map((v) => (
                    <Chip
                      key={v.value}
                      label={v.label}
                      selected={s.autoVersionMinutes === v.value}
                      onPress={locked ? undefined : () => void save({ autoVersionMinutes: v.value }, (x) => ({ ...x, autoVersionMinutes: v.value }))}
                    />
                  ))}
                </View>
                <T tone="muted" style={{ fontSize: 13, lineHeight: 18 }}>
                  While someone writes, a note&apos;s text is kept in its history this often, 40 to a note, the oldest giving way. Named versions are always kept.
                </T>
              </View>

              <Card style={{ marginHorizontal: space.lg, marginTop: space.xl }}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.md, padding: space.lg }}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ color: c.foreground, fontSize: 16, fontWeight: "500" }}>Offer as a template</Text>
                    <Text style={{ color: c.mutedForeground, fontSize: 13, lineHeight: 18 }}>
                      Anyone in its workspace can start a project from it. The new one gets its type, tools, words, labels, workflow and kinds, and its folders and chapters, empty. None of its text is copied.
                    </Text>
                  </View>
                  <Switch value={s.template} disabled={locked} accessibilityLabel="Offer as a template" onValueChange={(template) => void save({ template }, (v) => ({ ...v, template }))} />
                </View>
              </Card>

              <SectionLabel>More</SectionLabel>
              <Card style={{ marginHorizontal: space.lg }}>
                <Row icon="people" title="Share" subtitle="People, roles and the read-only link" onPress={() => router.push({ pathname: "/project/[projectId]/share", params: { projectId } })} right={<Icon name="chevronRight" size={14} color={c.mutedForeground} />} />
                <Separator inset={52} />
                <Row icon="plugin" title="Plugins" subtitle="They run on the web, in every project you open" onPress={() => router.push("/settings/plugins")} right={<Icon name="chevronRight" size={14} color={c.mutedForeground} />} />
                <Separator inset={52} />
                <Row icon="exportFile" title="Export" subtitle="Word, Markdown, EPUB, a Plotra file and more" onPress={() => router.push({ pathname: "/project/[projectId]/export", params: { projectId } })} right={<Icon name="chevronRight" size={14} color={c.mutedForeground} />} />
                <Separator inset={52} />
                <Row icon="importFile" title="Import into this project" subtitle="A file from your phone" onPress={() => router.push({ pathname: "/import", params: { projectId } })} right={<Icon name="chevronRight" size={14} color={c.mutedForeground} />} />
                <Separator inset={52} />
                <Row icon="web" title="Workflow, words, labels and kinds" subtitle="On the web" onPress={() => void openWeb(web)} right={<Icon name="chevronRight" size={14} color={c.mutedForeground} />} />
                <Separator inset={52} />
                <Row icon="web" title="Webhooks and GitHub" subtitle="On the web. For connecting Plotra to other services; you don't need these to write." onPress={() => void openWeb(web)} right={<Icon name="chevronRight" size={14} color={c.mutedForeground} />} />
              </Card>

              {s.canManage && (
                <View style={{ margin: space.lg, marginTop: space.xl, padding: space.lg, gap: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: c.destructive }}>
                  <Text style={{ color: c.destructive, fontSize: 16, fontWeight: "600" }}>Delete this project</Text>
                  <T tone="muted" style={{ fontSize: 13, lineHeight: 18 }}>
                    Everything in it goes, for everyone it&apos;s shared with. This can&apos;t be undone. To be sure, type its title: {s.title}
                  </T>
                  <Field label="Type the project's title" value={typed} onChangeText={setTyped} placeholder={s.title} autoCapitalize="none" autoCorrect={false} />
                  <Button label="Delete project…" variant="destructive" busy={deleting} disabled={typed.trim() !== s.title.trim() || data.offline} onPress={confirmDelete} />
                </View>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}
