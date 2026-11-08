import { Stack, useLocalSearchParams } from "expo-router";
import { Alert, RefreshControl, ScrollView, Text, View } from "react-native";
import { Icon } from "@/components/icon";
import { Banner, Button, Card, Empty, Loading, SectionLabel, Separator, T } from "@/components/ui";
import { useResource } from "@/lib/cache";
import { ago, openWeb } from "@/lib/links";
import { accessDetail, accessLabel, categoryLabel, pluginPromise, readPlugin, storePluginUrl } from "@/lib/plugins-api";
import { useClient, useSession } from "@/lib/session";
import { fonts, space, useColors } from "@/lib/theme";

// One plugin in the store, as its web page shows it: what it does, who made
// it, what it may do, its versions. Installing happens on the web page, which
// asks once more and shows its code in full first.

const size = (characters: number) => (characters < 1000 ? `${characters} characters` : `${Math.round(characters / 100) / 10} KB`);

export default function PluginScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const c = useColors();
  const client = useClient();
  const { server } = useSession();
  const plugin = useResource(slug ? `plugin-store:listing:${slug}` : null, () => readPlugin(client, slug));
  const listing = plugin.data;
  const latest = listing?.releases[0];

  // The same words as the web's install dialog (components/plugins/store-actions.tsx), before sending them there.
  const install = () => {
    if (!listing) return;
    Alert.alert(
      `Install ${listing.name}?`,
      `It's added to every project you open on the web, and in each one it only sees that project. ${accessLabel(listing.access)}: ${
        listing.access === "read" ? "it can read the notes there, and Plotra stops it from changing them." : "it can read, add and change the notes there, as you could."
      }\n\nPlotra makes sure it can't reach the internet or see your other projects or your account. You'll finish installing on the web, where you can switch it off or remove it at any time in Your settings → Plugins.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Continue on the web", onPress: () => void openWeb(storePluginUrl(server, listing.slug)) },
      ],
    );
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.background }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingBottom: space.xxl * 2 }}
      refreshControl={<RefreshControl refreshing={plugin.refreshing} onRefresh={plugin.refresh} tintColor={c.mutedForeground} />}
    >
      <Stack.Screen options={{ title: listing?.name ?? "Plugin" }} />
      <Banner offline={plugin.offline} error={plugin.offline ? null : plugin.error} onRetry={plugin.refresh} />
      {!listing ? (
        plugin.loading ? (
          <Loading />
        ) : (
          <Empty icon="plugin" title="Couldn't open this plugin" body={plugin.error?.message ?? "Pull down to try again."} />
        )
      ) : (
        <>
          <View style={{ paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.sm }}>
            <Text style={{ color: c.foreground, fontFamily: fonts.serif, fontSize: 28, lineHeight: 34 }} accessibilityRole="header">
              {listing.name}
            </Text>
            <T tone="muted" style={{ fontSize: 15, lineHeight: 22 }}>
              {listing.summary}
            </T>
            <T tone="muted" style={{ fontSize: 13, lineHeight: 18 }}>
              {[`By ${listing.author}`, latest && `Version ${latest.version}`, categoryLabel(listing.category), `${listing.installs} ${listing.installs === 1 ? "install" : "installs"}`, `Updated ${ago(listing.updatedAt)}`]
                .filter(Boolean)
                .join(" · ")}
            </T>
          </View>

          <Card style={{ marginHorizontal: space.lg, marginTop: space.lg, padding: space.lg, gap: space.sm }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
              <Icon name={listing.access === "read" ? "eye" : "edit"} size={18} color={c.foreground} />
              <T style={{ fontWeight: "600" }}>{accessLabel(listing.access)}</T>
            </View>
            <T tone="muted" style={{ fontSize: 14, lineHeight: 20 }}>
              {accessDetail(listing.access)}
            </T>
            <T tone="muted" style={{ fontSize: 14, lineHeight: 20 }}>
              {pluginPromise}
            </T>
          </Card>

          <View style={{ paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.sm }}>
            <Button label="Install" icon="web" onPress={install} accessibilityHint="Explains what it may do, then opens its page on the web to install it" />
            <T tone="muted" style={{ fontSize: 13, lineHeight: 18, textAlign: "center" }}>
              Plugins work in Plotra on the web, not in this app.
            </T>
          </View>

          {!!listing.about && (
            <>
              <SectionLabel>About</SectionLabel>
              <T style={{ marginHorizontal: space.lg, fontSize: 15, lineHeight: 22 }} selectable>
                {listing.about}
              </T>
            </>
          )}

          {listing.releases.length > 0 && (
            <>
              <SectionLabel>Versions</SectionLabel>
              <Card style={{ marginHorizontal: space.lg }}>
                {listing.releases.map((release, i) => (
                  <View key={release.id}>
                    {i > 0 && <Separator />}
                    <View style={{ padding: space.md, paddingHorizontal: space.lg, gap: 2 }}>
                      <T style={{ fontWeight: "600" }}>{release.version}</T>
                      <T tone="muted" style={{ fontSize: 13 }}>
                        {ago(release.createdAt)} · {size(release.size)}
                        {release.access === "read" ? " · reads only" : ""}
                      </T>
                      {!!release.notes && (
                        <T tone="muted" style={{ fontSize: 14, lineHeight: 20, marginTop: space.xs }}>
                          {release.notes}
                        </T>
                      )}
                    </View>
                  </View>
                ))}
              </Card>
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}
