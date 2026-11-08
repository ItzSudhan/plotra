import { router, Stack } from "expo-router";
import { useEffect, useState } from "react";
import { RefreshControl, ScrollView, TextInput, View } from "react-native";
import { Icon } from "@/components/icon";
import { Banner, Card, Chip, Empty, Loading, Row, SectionLabel, Separator, T } from "@/components/ui";
import { useResource } from "@/lib/cache";
import { accessLabel, browsePlugins, categoryLabel, pluginCategories, type StoreEntry, type StoreSort } from "@/lib/plugins-api";
import { useClient } from "@/lib/session";
import { radius, space, useColors } from "@/lib/theme";

// The plugin store, as on the web's /plugins page: Plotra's own first, then
// what people published, searched, by category, most installed or newest.
// Tapping one shows what it does and what it may do (settings/plugin/[slug]).

const sorts: { id: StoreSort; label: string }[] = [
  { id: "popular", label: "Most installed" },
  { id: "new", label: "Newest" },
];

export default function PluginStoreScreen() {
  const c = useColors();
  const client = useClient();
  const [typed, setTyped] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<StoreSort>("popular");

  // Search once they pause typing, not on every letter.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(typed.trim()), 350);
    return () => clearTimeout(timer);
  }, [typed]);

  const store = useResource(`plugin-store:${sort}:${category}:${query}`, () => browsePlugins(client, { query, category, sort }));
  const data = store.data;
  const filtered = !!(query || category);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.background }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingBottom: space.xxl * 2 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={store.refreshing} onRefresh={store.refresh} tintColor={c.mutedForeground} />}
    >
      <Stack.Screen options={{ title: "Plugin store" }} />
      <T tone="muted" style={{ marginHorizontal: space.lg, marginTop: space.md, fontSize: 14, lineHeight: 20 }}>
        A plugin only sees the project you have open and can&apos;t reach the internet. Plugins work in Plotra on the web, so you install them there.
      </T>

      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginHorizontal: space.lg, marginTop: space.md, paddingHorizontal: space.md, height: 44, borderRadius: radius.md, backgroundColor: c.accent }}>
        <Icon name="search" size={16} color={c.mutedForeground} />
        <TextInput
          value={typed}
          onChangeText={setTyped}
          placeholder="Search plugins"
          placeholderTextColor={c.mutedForeground}
          accessibilityLabel="Search plugins"
          returnKeyType="search"
          autoCorrect={false}
          clearButtonMode="while-editing"
          onSubmitEditing={() => setQuery(typed.trim())}
          style={{ flex: 1, color: c.foreground, fontSize: 16 }}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm, paddingTop: space.md }}>
        {[{ id: "", label: "All" }, ...pluginCategories].map((cat) => (
          <Chip key={cat.id || "all"} label={cat.label} selected={category === cat.id} onPress={() => setCategory(cat.id)} />
        ))}
      </ScrollView>
      <View style={{ flexDirection: "row", gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.sm }}>
        {sorts.map((s) => (
          <Chip key={s.id} label={s.label} selected={sort === s.id} onPress={() => setSort(s.id)} />
        ))}
      </View>

      <Banner offline={store.offline} error={store.offline ? null : store.error} onRetry={store.refresh} />

      {!data ? (
        store.loading ? (
          <Loading />
        ) : (
          <Empty icon="plugin" title="Couldn't open the store" body="Pull down to try again." />
        )
      ) : (
        <>
          {data.official.length > 0 && (
            <>
              <SectionLabel>Made by Plotra</SectionLabel>
              <List entries={data.official} official />
            </>
          )}
          <SectionLabel>From people who write with Plotra</SectionLabel>
          {data.unreachable ? (
            <T tone="muted" style={{ marginHorizontal: space.lg, fontSize: 14, lineHeight: 20 }}>
              {data.unreachable} Plugins you have keep working.
            </T>
          ) : data.community.length === 0 ? (
            <T tone="muted" style={{ marginHorizontal: space.lg, fontSize: 14, lineHeight: 20 }}>
              {filtered ? "No plugins from the community match that." : "None yet."}
            </T>
          ) : (
            <List entries={data.community} />
          )}
        </>
      )}
    </ScrollView>
  );
}

function List({ entries, official = false }: { entries: StoreEntry[]; official?: boolean }) {
  const c = useColors();
  return (
    <Card style={{ marginHorizontal: space.lg }}>
      {entries.map((entry, i) => (
        <View key={entry.slug}>
          {i > 0 && <Separator inset={52} />}
          <Row
            icon={official ? "verified" : "plugin"}
            iconColor={c.emberInk}
            title={entry.name}
            subtitle={[entry.summary, [official ? null : entry.author, categoryLabel(entry.category), accessLabel(entry.access)].filter(Boolean).join(" · ")].filter(Boolean).join("\n")}
            onPress={() => router.push({ pathname: "/settings/plugin/[slug]", params: { slug: entry.slug } })}
            right={<Icon name="chevronRight" size={14} color={c.mutedForeground} />}
          />
        </View>
      ))}
    </Card>
  );
}
