import Constants from "expo-constants";
import { Image } from "expo-image";
import { Alert, Share, Text, View } from "react-native";
import { Icon } from "@/components/icon";
import { TabScreen } from "@/components/screen";
import { Banner, Card, Chip, Row, SectionLabel, Separator, T } from "@/components/ui";
import { useAppearance, type Appearance, type TextSize } from "@/lib/appearance";
import { keys, useResource } from "@/lib/cache";
import { ago, openWeb } from "@/lib/links";
import { useOutbox, type Queued } from "@/lib/outbox";
import { useClient, useSession } from "@/lib/session";
import { space, useColors } from "@/lib/theme";

const appearances: { id: Appearance; label: string }[] = [
  { id: "system", label: "Like my phone" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

const sizes: { id: TextSize; label: string }[] = [
  { id: "small", label: "Small" },
  { id: "medium", label: "Medium" },
  { id: "large", label: "Large" },
];

export default function Account() {
  const c = useColors();
  const client = useClient();
  const { server, signOut } = useSession();
  const me = useResource(keys.me, client.me);
  const { appearance, setAppearance, textSize, setTextSize } = useAppearance();
  const { pending, failed, flush, discard } = useOutbox();
  const user = me.data?.user;
  const avatar = user?.image ? (user.image.startsWith("/") ? server + user.image : user.image) : null;

  const confirmSignOut = () =>
    Alert.alert(
      "Sign out of Plotra?",
      pending.length || failed.length
        ? "Changes that haven't been sent yet will be lost. Your projects stay safe on Plotra."
        : "Your projects stay safe on Plotra. What's saved on this phone is cleared.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Sign out", style: "destructive", onPress: () => void signOut() },
      ],
    );

  const showFailed = (item: Queued) =>
    Alert.alert(`Couldn't send a change to “${item.title}”`, item.error, [
      { text: "Keep it", style: "cancel" },
      item.type === "text" || item.type === "create"
        ? { text: "Share the text", onPress: () => void Share.share({ message: item.type === "text" ? item.markdown : (item.input.markdown ?? item.input.title) }) }
        : { text: "Try again", onPress: () => void flush() },
      { text: "Let it go", style: "destructive", onPress: () => discard(item.id) },
    ]);

  return (
    <TabScreen title="Account" refreshing={me.refreshing} onRefresh={me.refresh}>
      <Banner offline={me.offline} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingTop: space.lg }}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={{ width: 56, height: 56, borderRadius: 28 }} accessibilityIgnoresInvertColors />
        ) : (
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: c.emberSoft, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: c.emberInk, fontSize: 22, fontWeight: "600" }}>{(user?.name || user?.email || "?").charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.foreground, fontSize: 18, fontWeight: "600" }}>{user?.name || "…"}</Text>
          <Text style={{ color: c.mutedForeground, fontSize: 14 }}>{user?.email}</Text>
          {server !== "https://app.plotra.ink" && <Text style={{ color: c.mutedForeground, fontSize: 12, marginTop: 2 }}>{server.replace(/^https?:\/\//, "")}</Text>}
        </View>
      </View>

      {(pending.length > 0 || failed.length > 0) && (
        <>
          <SectionLabel>Waiting to send</SectionLabel>
          <Card style={{ marginHorizontal: space.lg }}>
            {[...failed, ...pending].map((item, i) => (
              <View key={item.id}>
                {i > 0 && <Separator inset={52} />}
                <Row
                  icon={item.error ? "info" : "sync"}
                  iconColor={item.error ? c.destructive : c.mutedForeground}
                  title={item.title || "Untitled"}
                  subtitle={item.error ? `Couldn't send: ${item.error}` : `${item.type === "create" ? "New note" : item.type === "text" ? "Text" : "Details"} · saved ${ago(item.queuedAt)}`}
                  onPress={item.error ? () => showFailed(item) : () => void flush()}
                />
              </View>
            ))}
          </Card>
          <T tone="muted" style={{ marginHorizontal: space.lg, marginTop: space.sm, fontSize: 13, lineHeight: 18 }}>
            These go to Plotra by themselves when you&apos;re back online.
          </T>
        </>
      )}

      <SectionLabel>Appearance</SectionLabel>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, paddingHorizontal: space.lg }}>
        {appearances.map((a) => (
          <Chip key={a.id} label={a.label} selected={appearance === a.id} onPress={() => setAppearance(a.id)} />
        ))}
      </View>

      <SectionLabel>Reading text</SectionLabel>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, paddingHorizontal: space.lg }}>
        {sizes.map((s) => (
          <Chip key={s.id} label={s.label} selected={textSize === s.id} onPress={() => setTextSize(s.id)} />
        ))}
      </View>

      <SectionLabel>Plotra on the web</SectionLabel>
      <Card style={{ marginHorizontal: space.lg }}>
        <Row icon="web" title="Open Plotra" subtitle="Boards, timelines, the graph and everything else" onPress={() => openWeb(server)} right={<Icon name="chevronRight" size={14} color={c.mutedForeground} />} />
        <Separator inset={52} />
        <Row icon="details" title="Settings" subtitle="Your profile, notifications, and the apps signed in to your account" onPress={() => openWeb(`${server}/settings`)} right={<Icon name="chevronRight" size={14} color={c.mutedForeground} />} />
        <Separator inset={52} />
        <Row icon="info" title="Help" subtitle="Guides for every part of Plotra" onPress={() => openWeb("https://docs.plotra.ink")} right={<Icon name="chevronRight" size={14} color={c.mutedForeground} />} />
      </Card>

      <Card style={{ marginHorizontal: space.lg, marginTop: space.xl }}>
        <Row icon="signOut" iconColor={c.destructive} title="Sign out" onPress={confirmSignOut} />
      </Card>

      <T tone="muted" style={{ textAlign: "center", fontSize: 12, marginTop: space.xl }}>
        Plotra {Constants.expoConfig?.version ?? ""}
      </T>
    </TabScreen>
  );
}
