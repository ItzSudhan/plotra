import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { MenuProvider } from "@/components/menu";
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
          <Stack.Screen name="project/[projectId]/edit/[noteId]" options={{ presentation: "fullScreenModal", title: "" }} />
          <Stack.Screen name="project/[projectId]/details/[noteId]" options={{ presentation: "modal", title: "Details" }} />
          <Stack.Screen name="project/[projectId]/new" options={{ presentation: "modal", title: "New note" }} />
          <Stack.Screen name="capture" options={{ presentation: "modal", title: "Quick note" }} />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="welcome" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack>
    </ThemeProvider>
  );
}
