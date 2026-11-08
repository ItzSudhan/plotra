import { router, Stack } from "expo-router";
import { ScrollView, View } from "react-native";
import { Icon } from "@/components/icon";
import { Card, Row, SectionLabel, Separator, T } from "@/components/ui";
import { openWeb } from "@/lib/links";
import { yourPluginsUrl } from "@/lib/plugins-api";
import { useSession } from "@/lib/session";
import { space, useColors } from "@/lib/theme";

// Plugins, as the phone has them. They're the person's own (not a project's or
// a workspace's: every project they open on the web gets them) and they run in
// Plotra on the web. Plotra keeps adding, switching and removing them to the
// signed-in web app, never an app's token (apps/app/lib/plugin-actions.ts), so
// here they browse the store and open the web for the rest.

export default function PluginsScreen() {
  const c = useColors();
  const { server } = useSession();
  const chevron = <Icon name="chevronRight" size={14} color={c.mutedForeground} />;
  const web = <Icon name="web" size={16} color={c.mutedForeground} />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.background }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: space.xxl * 2 }}>
      <Stack.Screen options={{ title: "Plugins" }} />
      <View style={{ flexDirection: "row", gap: space.md, padding: space.lg, paddingBottom: 0 }}>
        <Icon name="plugin" size={28} color={c.emberInk} />
        <View style={{ flex: 1, gap: space.sm }}>
          <T style={{ fontSize: 15, lineHeight: 22 }}>
            Plugins add extra tools to Plotra: a new command, a panel beside your writing, another way to export. They&apos;re made by people who write with Plotra.
          </T>
          <T tone="muted" style={{ fontSize: 14, lineHeight: 20 }}>
            Plugins work in Plotra on the web, not in this app. Yours are added to every project you open there, whichever workspace it&apos;s in.
          </T>
        </View>
      </View>

      <SectionLabel>Your plugins</SectionLabel>
      <Card style={{ marginHorizontal: space.lg }}>
        <Row
          icon="details"
          title="Install, switch or remove"
          subtitle="Opens Your settings → Plugins on the web"
          accessibilityHint="Opens Plotra on the web"
          onPress={() => void openWeb(yourPluginsUrl(server))}
          right={web}
        />
      </Card>
      <T tone="muted" style={{ marginHorizontal: space.lg, marginTop: space.sm, fontSize: 13, lineHeight: 18 }}>
        To keep your account safe, Plotra only lets you change your plugins while you&apos;re signed in on the web, not from an app.
      </T>

      <SectionLabel>Find more</SectionLabel>
      <Card style={{ marginHorizontal: space.lg }}>
        <Row icon="search" title="Browse the plugin store" subtitle="See what each one does and what it may do" onPress={() => router.push("/settings/plugin-store")} right={chevron} />
        <Separator inset={52} />
        <Row icon="info" title="About plugins" subtitle="How they work and how to make your own" accessibilityHint="Opens the guide on the web" onPress={() => void openWeb("https://docs.plotra.ink/docs/developers/plugins")} right={web} />
      </Card>
    </ScrollView>
  );
}
