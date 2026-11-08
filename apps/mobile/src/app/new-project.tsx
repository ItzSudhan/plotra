import { router, Stack } from "expo-router";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { Field } from "@/components/field";
import { Icon } from "@/components/icon";
import { Banner, Card, Chip, Loading, SectionLabel, Separator, T } from "@/components/ui";
import { isOffline } from "@/lib/api";
import { invalidate, keys, useResource } from "@/lib/cache";
import { useClient } from "@/lib/session";
import { createProject, getNewProjectChoices, settingsKeys } from "@/lib/settings-api";
import { space, useColors } from "@/lib/theme";

// A new project, as the web's New project dialog makes one: a title, the kind
// of story (which picks the tools it starts with) and the workspace; empty
// with one scene, or from a starter: a structure with no writing in it.

export default function NewProjectScreen() {
  const c = useColors();
  const client = useClient();
  const me = useResource(keys.me, client.me);
  const choices = useResource(settingsKeys.newProject, () => getNewProjectChoices(client));
  const [title, setTitle] = useState("");
  const [type, setType] = useState("novel");
  const [workspace, setWorkspace] = useState<string | null>(null);
  const [audience, setAudience] = useState("novel");
  const [starter, setStarter] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const workspaces = me.data?.workspaces ?? [];
  const chosenWorkspace = workspace ?? workspaces[0]?.slug ?? null;
  const picked = choices.data?.starters.find((s) => s.id === starter) ?? null;
  // A starter has a name of its own, used when no title is typed.
  const canMake = !!chosenWorkspace && (!!title.trim() || !!picked) && !saving;

  const make = async () => {
    if (!canMake || !chosenWorkspace) return;
    setSaving(true);
    try {
      const { projectId } = await createProject(client, { workspace: chosenWorkspace, title: title.trim(), type: picked?.type ?? type, starter: picked?.id ?? null });
      invalidate(keys.projects);
      router.replace({ pathname: "/project/[projectId]", params: { projectId, title: title.trim() || picked?.label || "" } });
    } catch (e) {
      setSaving(false);
      Alert.alert("Couldn't start the project", isOffline(e) ? "You're offline. Projects are made on Plotra, so this needs a connection." : (e as Error).message);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: "New project",
          headerLeft: () => (
            <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={8}>
              <Text style={{ color: c.foreground, fontSize: 17 }}>Cancel</Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canMake }} onPress={make} disabled={!canMake} hitSlop={8} style={{ opacity: canMake ? 1 : 0.4 }}>
              <Text style={{ color: c.emberInk, fontSize: 17, fontWeight: "600" }}>{saving ? "Starting…" : "Start"}</Text>
            </Pressable>
          ),
        }}
      />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: c.background }}>
        <ScrollView contentContainerStyle={{ paddingBottom: space.xxl * 2 }} keyboardShouldPersistTaps="handled">
          <Banner offline={choices.offline} error={choices.offline ? null : choices.error} onRetry={choices.refresh} />
          {!choices.data ? (
            <Loading />
          ) : (
            <>
              <View style={{ padding: space.lg, gap: space.lg }}>
                <Field label="Title" value={title} onChangeText={setTitle} placeholder={picked?.label ?? "The Long Way Home"} autoFocus maxLength={120} returnKeyType="done" onSubmitEditing={make} />
                {workspaces.length > 1 && (
                  <View style={{ gap: 6 }}>
                    <Text style={{ color: c.mutedForeground, fontSize: 13, fontWeight: "600" }}>Workspace</Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                      {workspaces.map((w) => (
                        <Chip key={w.id} label={w.name} selected={chosenWorkspace === w.slug} onPress={() => setWorkspace(w.slug)} />
                      ))}
                    </View>
                  </View>
                )}
              </View>

              <SectionLabel>What kind of story</SectionLabel>
              <View style={{ paddingHorizontal: space.lg, gap: space.sm }}>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, opacity: picked ? 0.5 : 1 }}>
                  {choices.data.types.map((t) => (
                    <Chip
                      key={t.id}
                      label={t.label}
                      selected={(picked?.type ?? type) === t.id}
                      onPress={() => {
                        setStarter(null);
                        setType(t.id);
                      }}
                    />
                  ))}
                </View>
                <T tone="muted" style={{ fontSize: 13, lineHeight: 18 }}>
                  This picks which tools it starts with. You can change it, and switch tools on and off, in the project&apos;s settings later.
                </T>
              </View>

              <SectionLabel>Or start from a starter</SectionLabel>
              <T tone="muted" style={{ marginHorizontal: space.lg, marginBottom: space.sm, fontSize: 13, lineHeight: 18 }}>
                A structure with no writing in it: acts, chapters, sessions or routes, each with a line on what it&apos;s for, plus the planning notes that kind of writer usually keeps.
              </T>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm, paddingBottom: space.sm }}>
                {choices.data.audiences.map((a) => (
                  <Chip key={a.id} label={a.label} selected={audience === a.id} onPress={() => setAudience(a.id)} />
                ))}
              </ScrollView>
              <Card style={{ marginHorizontal: space.lg }}>
                {choices.data.starters
                  .filter((s) => s.audience === audience)
                  .map((s, i) => {
                    const selected = starter === s.id;
                    return (
                      <View key={s.id}>
                        {i > 0 && <Separator inset={space.lg} />}
                        <Pressable
                          accessibilityRole="radio"
                          accessibilityState={{ checked: selected }}
                          accessibilityLabel={`${s.label}. ${s.description}`}
                          onPress={() => setStarter(selected ? null : s.id)}
                          style={({ pressed }) => ({ flexDirection: "row", gap: space.md, padding: space.lg, backgroundColor: pressed ? c.accent : selected ? c.emberSoft : "transparent" })}
                        >
                          <View style={{ flex: 1, gap: 4 }}>
                            <Text style={{ color: c.foreground, fontSize: 16 }}>{s.label}</Text>
                            <Text style={{ color: c.mutedForeground, fontSize: 13, lineHeight: 18 }}>{s.description}</Text>
                          </View>
                          {selected && <Icon name="check" size={18} color={c.emberInk} />}
                        </Pressable>
                      </View>
                    );
                  })}
              </Card>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}
