import { Image } from "expo-image";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, T } from "@/components/ui";
import { cleanServer } from "@/lib/encoding";
import { useSession } from "@/lib/session";
import { DEFAULT_SERVER } from "@/lib/sign-in";
import { fonts, radius, space, useColors } from "@/lib/theme";

// The first screen: what Plotra is, and signing in through the browser. A
// self-hosted Plotra is one address away, under "Use your own server".

export default function Welcome() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { signIn } = useSession();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [own, setOwn] = useState(false);
  const [address, setAddress] = useState("");

  const go = async () => {
    const server = own ? cleanServer(address) : DEFAULT_SERVER;
    if (!server) {
      setMessage("That doesn't look like a web address. Try something like plotra.example.com.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      setMessage(await signIn(server));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 48, paddingBottom: insets.bottom + space.xl, paddingHorizontal: space.xl }} keyboardShouldPersistTaps="handled">
        <Image source={require("@/assets/images/icon.png")} style={{ width: 72, height: 72, borderRadius: 18 }} accessibilityLabel="Plotra" />
        <Text style={{ marginTop: space.xl, color: c.foreground, fontFamily: fonts.serif, fontSize: 40, lineHeight: 44, letterSpacing: -1 }}>
          Your story,{"\n"}
          <Text style={{ color: c.emberInk, fontStyle: "italic" }}>in your pocket.</Text>
        </Text>
        <T tone="muted" style={{ marginTop: space.lg, fontSize: 17, lineHeight: 25 }}>
          Read your manuscript on the train, fix a scene in the queue, catch an idea before it goes. Everything stays in step with Plotra on your computer.
        </T>

        <View style={{ flex: 1, minHeight: space.xxl }} />

        {own && (
          <View style={{ marginBottom: space.lg, gap: space.sm }}>
            <T tone="muted" style={{ fontSize: 13 }}>
              Your Plotra server
            </T>
            <TextInput
              value={address}
              onChangeText={setAddress}
              placeholder="plotra.example.com"
              placeholderTextColor={c.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="go"
              onSubmitEditing={go}
              accessibilityLabel="Your Plotra server's address"
              style={{ height: 50, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, color: c.foreground, paddingHorizontal: space.lg, fontSize: 16 }}
            />
          </View>
        )}

        {!!message && (
          <T tone="destructive" style={{ marginBottom: space.md, fontSize: 14, lineHeight: 20 }} accessibilityLiveRegion="polite">
            {message}
          </T>
        )}

        <Button label={own ? "Sign in to your server" : "Sign in or create an account"} onPress={go} busy={busy} />
        <T tone="muted" style={{ marginTop: space.md, fontSize: 13, lineHeight: 18, textAlign: "center" }}>
          You&apos;ll sign in on the Plotra website, then come straight back here.
        </T>
        <Pressable accessibilityRole="button" onPress={() => setOwn((v) => !v)} style={{ alignSelf: "center", padding: space.md, marginTop: space.sm }}>
          <Text style={{ color: c.mutedForeground, fontSize: 14, textDecorationLine: "underline" }}>{own ? "Use Plotra Cloud" : "Use your own server"}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
