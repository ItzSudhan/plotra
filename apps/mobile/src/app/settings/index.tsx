import * as ImagePicker from "expo-image-picker";
import { Stack } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { Field } from "@/components/field";
import { Icon } from "@/components/icon";
import { useMenu } from "@/components/menu";
import { Avatar } from "@/components/person";
import PhotoCrop from "@/components/photo-crop";
import { Banner, Card, Loading, Row, SectionLabel, Separator, T } from "@/components/ui";
import { invalidate, keys, useResource } from "@/lib/cache";
import { openWeb } from "@/lib/links";
import { useClient } from "@/lib/session";
import { emailChoices, getAccount, removePhoto, settingsKeys, updateAccount, uploadPhoto, type EmailPreference } from "@/lib/settings-api";
import { space, useColors } from "@/lib/theme";

// Your own settings, as the web's Your settings has them: your name and
// photo, and how you're emailed about mentions, replies and reviews. Email,
// password, Google, API tokens and deleting the account stay on the web,
// where Plotra's sign-in can check it's really you.

export default function AccountSettings() {
  const c = useColors();
  const client = useClient();
  const menu = useMenu();
  const account = useResource(settingsKeys.account, () => getAccount(client));
  const a = account.data;
  const [name, setName] = useState("");
  const [cropping, setCropping] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);

  // The box follows the name the server has (React's "adjust state while rendering").
  const [seen, setSeen] = useState<string | null>(null);
  if (a && a.name !== seen) {
    setSeen(a.name);
    setName(a.name);
  }

  const refreshAccount = account.refresh;
  /** Your name and photo show on the Account tab too. */
  const changed = useCallback(() => {
    invalidate(keys.me);
    void refreshAccount();
  }, [refreshAccount]);

  const saveName = async () => {
    const next = name.trim();
    if (!a || !next || next === a.name) return;
    try {
      await updateAccount(client, { name: next });
      changed();
    } catch (e) {
      Alert.alert("Couldn't change your name", (e as Error).message);
      setName(a.name);
    }
  };

  const setEmails = async (value: EmailPreference) => {
    account.mutate((v) => (v ? { ...v, emailNotifications: value } : v));
    try {
      await updateAccount(client, { emailNotifications: value });
    } catch (e) {
      Alert.alert("Couldn't change that", (e as Error).message);
    }
    void account.refresh();
  };

  const pick = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.9, base64: true });
    const asset = result.assets?.[0];
    if (result.canceled || !asset?.base64) return;
    setPhotoBusy(true);
    setCropping(`data:${asset.mimeType ?? "image/jpeg"};base64,${asset.base64}`);
  };

  const cropped = useCallback(
    async (result: { base64: string } | { error: string }) => {
      setCropping(null);
      try {
        if ("error" in result) throw new Error(result.error);
        await uploadPhoto(client, result.base64);
        changed();
      } catch (e) {
        Alert.alert("Couldn't change your photo", (e as Error).message);
      } finally {
        setPhotoBusy(false);
      }
    },
    [client, changed],
  );

  const photoMenu = () =>
    menu({
      title: "Your photo",
      message: "It shows wherever your name does: comments, history, the people in a project.",
      items: [
        { label: "Choose a picture", icon: "picture", onPress: () => void pick() },
        ...(a?.image
          ? [
              {
                label: "Remove photo",
                icon: "trash" as const,
                destructive: true,
                onPress: () =>
                  void (async () => {
                    setPhotoBusy(true);
                    try {
                      await removePhoto(client);
                      changed();
                    } catch (e) {
                      Alert.alert("Couldn't remove your photo", (e as Error).message);
                    } finally {
                      setPhotoBusy(false);
                    }
                  })(),
              },
            ]
          : []),
      ],
    });

  const web = (label: string, subtitle: string) => <Row icon="web" title={label} subtitle={subtitle} onPress={() => void openWeb(`${client.server}/settings`)} right={<Icon name="chevronRight" size={14} color={c.mutedForeground} />} />;

  return (
    <>
      <Stack.Screen options={{ title: "Your settings" }} />
      {cropping && <PhotoCrop source={cropping} onDone={cropped} dom={{ style: { width: 1, height: 1, opacity: 0, position: "absolute" } }} />}
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: c.background }}>
        <ScrollView contentContainerStyle={{ paddingBottom: space.xxl * 2 }} keyboardShouldPersistTaps="handled">
          <Banner offline={account.offline} error={account.offline ? null : account.error} onRetry={account.refresh} />
          {!a ? (
            <Loading />
          ) : (
            <>
              <View style={{ alignItems: "center", paddingTop: space.xl, gap: space.sm }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Change your photo"
                  disabled={!a.photoUploads || photoBusy || account.offline}
                  onPress={photoMenu}
                  style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                >
                  <Avatar name={a.name || a.email} image={a.image} size={88} />
                  {photoBusy && (
                    <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", borderRadius: 44, backgroundColor: "rgba(0,0,0,0.35)" }}>
                      <ActivityIndicator color="#fff" />
                    </View>
                  )}
                </Pressable>
                {a.photoUploads ? (
                  <Text accessibilityRole="button" onPress={photoBusy ? undefined : photoMenu} style={{ color: c.emberInk, fontSize: 15 }}>
                    {a.image ? "Change photo" : "Add a photo"}
                  </Text>
                ) : (
                  <T tone="muted" style={{ fontSize: 13 }}>
                    Photos can&apos;t be uploaded on this server.
                  </T>
                )}
              </View>

              <View style={{ padding: space.lg, gap: space.lg }}>
                <Field label="Name" hint="Your byline on comments, history and the people list." value={name} onChangeText={setName} autoComplete="name" returnKeyType="done" onEndEditing={() => void saveName()} />
                <Field label="Email" value={a.email} editable={false} hint="Change it on the web, where you'll confirm the new address." />
              </View>

              <SectionLabel>Notification emails</SectionLabel>
              <T tone="muted" style={{ marginHorizontal: space.lg, marginBottom: space.sm, fontSize: 13, lineHeight: 18 }}>
                Mentions, replies to your comment threads, review requests and decisions. Emails say who did what and where, and never include the text itself.
              </T>
              <Card style={{ marginHorizontal: space.lg }}>
                {emailChoices.map((choice, i) => {
                  const selected = a.emailNotifications === choice.value;
                  return (
                    <View key={choice.value}>
                      {i > 0 && <Separator inset={space.lg} />}
                      <Pressable
                        accessibilityRole="radio"
                        accessibilityState={{ checked: selected }}
                        accessibilityLabel={`${choice.label}. ${choice.description}`}
                        onPress={() => !selected && void setEmails(choice.value)}
                        style={({ pressed }) => ({ flexDirection: "row", gap: space.md, padding: space.lg, backgroundColor: pressed ? c.accent : "transparent" })}
                      >
                        <View style={{ flex: 1, gap: 4 }}>
                          <Text style={{ color: c.foreground, fontSize: 16 }}>{choice.label}</Text>
                          <Text style={{ color: c.mutedForeground, fontSize: 13, lineHeight: 18 }}>{choice.description}</Text>
                        </View>
                        {selected && <Icon name="check" size={18} color={c.emberInk} />}
                      </Pressable>
                    </View>
                  );
                })}
              </Card>

              <SectionLabel>Sign-in and security</SectionLabel>
              <Card style={{ marginHorizontal: space.lg }}>
                {web("Password, email and Google", "On the web, where Plotra can check it's you")}
                <Separator inset={52} />
                {web("API tokens and connected apps", "Including this phone, listed as “Plotra app on …”")}
                <Separator inset={52} />
                {web("Delete your account", "On the web. Workspaces you share need another owner first")}
              </Card>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}
