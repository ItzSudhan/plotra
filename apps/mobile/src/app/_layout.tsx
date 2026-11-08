import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { MenuProvider } from "@/components/menu";
import { PushListener } from "@/components/push-listener";
import { AppearanceProvider } from "@/lib/appearance";
import { OutboxProvider } from "@/lib/outbox";
import { SessionProvider, useSession } from "@/lib/session";
import { useColors, useScheme } from "@/lib/theme";

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppearanceProvider>
        <SessionProvider>
          <OutboxProvider>
            <MenuProvider>
              <Navigation />
            </MenuProvider>
          </OutboxProvider>
        </SessionProvider>
      </AppearanceProvider>
    </GestureHandlerRootView>
  );
}

function Navigation() {
  const { status } = useSession();
  const scheme = useScheme();
  const c = useColors();

  useEffect(() => {
    if (status !== "loading") void SplashScreen.hideAsync();
  }, [status]);

  if (status === "loading") return null;

  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  const theme = { ...base, colors: { ...base.colors, primary: c.ember, background: c.background, card: c.background, text: c.foreground, border: c.border } };
  const signedIn = status === "signedIn";

  return (
    <ThemeProvider value={theme}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerTintColor: c.foreground,
          headerStyle: { backgroundColor: c.background },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: "minimal",
          contentStyle: { backgroundColor: c.background },
        }}
      >
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="project/[projectId]/index" options={{ title: "" }} />
          <Stack.Screen name="project/[projectId]/note/[noteId]" options={{ title: "" }} />
          <Stack.Screen name="project/[projectId]/history/[noteId]/index" options={{ title: "History" }} />
          <Stack.Screen name="project/[projectId]/history/[noteId]/[versionId]" options={{ title: "" }} />
          <Stack.Screen name="project/[projectId]/comments/[noteId]" options={{ title: "Comments" }} />
          <Stack.Screen name="project/[projectId]/chat" options={{ title: "Chat" }} />
          <Stack.Screen name="project/[projectId]/ask" options={{ title: "Ask AI" }} />
          <Stack.Screen name="project/[projectId]/edit/[noteId]" options={{ title: "" }} />
          <Stack.Screen name="project/[projectId]/details/[noteId]" options={{ presentation: "modal", title: "Details" }} />
          <Stack.Screen name="project/[projectId]/new" options={{ presentation: "modal", title: "New note" }} />
          <Stack.Screen name="project/[projectId]/move/[noteId]" options={{ presentation: "modal", title: "Move to…" }} />
          <Stack.Screen name="project/[projectId]/trash" options={{ title: "Trash" }} />
          <Stack.Screen name="project/[projectId]/views/timeline" options={{ title: "Timeline" }} />
          <Stack.Screen name="project/[projectId]/views/event" options={{ presentation: "modal", title: "Event" }} />
          <Stack.Screen name="project/[projectId]/views/corkboard" options={{ title: "Corkboard" }} />
          <Stack.Screen name="project/[projectId]/views/plot-grid" options={{ title: "Plot grid" }} />
          <Stack.Screen name="project/[projectId]/views/codex" options={{ title: "Codex" }} />
          <Stack.Screen name="project/[projectId]/views/entity/[noteId]" options={{ title: "" }} />
          <Stack.Screen name="project/[projectId]/maps/graph" options={{ title: "Graph" }} />
          <Stack.Screen name="project/[projectId]/maps/relationships" options={{ title: "Relationships" }} />
          <Stack.Screen name="project/[projectId]/maps/relationship" options={{ presentation: "modal", title: "Relationship" }} />
          <Stack.Screen name="project/[projectId]/board/[noteId]" options={{ title: "" }} />
          <Stack.Screen name="project/[projectId]/dialogue/[noteId]" options={{ title: "" }} />
          <Stack.Screen name="capture" options={{ presentation: "modal", title: "Quick note" }} />
          {/* Sharing, settings, plugins, export and import */}
          <Stack.Screen name="project/[projectId]/share" options={{ title: "Share" }} />
          <Stack.Screen name="project/[projectId]/settings/index" options={{ title: "Project settings" }} />
          <Stack.Screen name="project/[projectId]/export" options={{ presentation: "modal", title: "Export" }} />
          <Stack.Screen name="import" options={{ presentation: "modal", title: "Import" }} />
          <Stack.Screen name="new-project" options={{ presentation: "modal", title: "New project" }} />
          <Stack.Screen name="settings/index" options={{ title: "Your settings" }} />
          <Stack.Screen name="settings/members" options={{ title: "Members" }} />
          <Stack.Screen name="settings/plugins" options={{ title: "Plugins" }} />
          <Stack.Screen name="settings/plugin-store" options={{ title: "Plugin store" }} />
          <Stack.Screen name="settings/plugin/[slug]" options={{ title: "" }} />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="welcome" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack>
      {signedIn && <PushListener />}
    </ThemeProvider>
  );
}
