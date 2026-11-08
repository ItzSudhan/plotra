import { Image } from "expo-image";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Animated, { Easing, SlideInLeft, SlideInRight, useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChoiceCard, Eyebrow, Glow, Headline, Lede, Rise } from "@/components/onboarding/parts";
import { Button, T } from "@/components/ui";
import { cleanServer } from "@/lib/encoding";
import { useSession } from "@/lib/session";
import { DEFAULT_SERVER, type SignInMode } from "@/lib/sign-in";
import { radius, space, useColors } from "@/lib/theme";

// The first screen, in the desktop app's manner (apps/desktop/static/chooser.html):
// a greeting, where your work lives, and two cards. Plotra Cloud signs in or
// makes an account in the browser, and comes straight back; your own server
// is a second screen that slides in. After signing in, app/onboarding.tsx
// says hello and sets up what a new account needs.

type Screen = "choose" | "server";

export default function Welcome() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { signIn } = useSession();
  const [screen, setScreen] = useState<Screen>("choose");
  const [going, setGoing] = useState<"forward" | "back">("forward");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [address, setAddress] = useState("");

  const go = (next: Screen) => {
    setGoing(next === "server" ? "forward" : "back");
    setMessage(null);
    setScreen(next);
  };

  const start = async (server: string, mode: SignInMode, which: string) => {
    setBusy(which);
    setMessage(null);
    try {
      setMessage(await signIn(server, mode));
    } finally {
      setBusy(null);
    }
  };

  const connect = () => {
    const server = cleanServer(address);
    if (!server) return setMessage("That doesn't look like a web address. Try something like plotra.example.com.");
    void start(server, "sign-in", "server");
  };

  const slide = reduced ? undefined : (going === "forward" ? SlideInRight : SlideInLeft).duration(380).easing(Easing.bezier(0.2, 0.7, 0.2, 1));

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: c.background }}>
      <Glow />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xl, paddingHorizontal: space.xl }}>
        <Animated.View key={screen} entering={slide} style={{ flex: 1 }}>
          {screen === "choose" ? (
            <>
              <Rise>
                <Image source={require("@/assets/images/icon.png")} style={{ width: 64, height: 64, borderRadius: 16, marginBottom: space.xl }} accessibilityLabel="Plotra" />
              </Rise>
              <Eyebrow i={1} />
              <Headline i={2}>
                Your story,{"\n"}
                <Text style={{ color: c.emberInk, fontStyle: "italic" }}>in your pocket.</Text>
              </Headline>
              <Lede i={3}>Read your manuscript on the train, fix a scene in the queue, catch an idea before it goes. It stays in step with Plotra everywhere else.</Lede>

              <View style={{ gap: space.lg, marginTop: space.xl }}>
                <ChoiceCard i={4} glyph="cloud" title="Plotra Cloud" points={["Your Plotra account: the same projects as on the web", "Write with others, live, and get their replies here", "What you open stays on your phone, for offline"]}>
                  <View style={{ gap: space.sm }}>
                    <Button label="Sign in" busy={busy === "sign-in"} disabled={!!busy} onPress={() => void start(DEFAULT_SERVER, "sign-in", "sign-in")} />
                    <Button label="Create an account" variant="secondary" busy={busy === "sign-up"} disabled={!!busy} onPress={() => void start(DEFAULT_SERVER, "sign-up", "sign-up")} />
                  </View>
                </ChoiceCard>
                <ChoiceCard i={5} glyph="server" title="Your own server" points={["A Plotra you or your team run yourselves", "Everything stays on your server"]}>
                  <Button label="Connect…" variant="secondary" disabled={!!busy} onPress={() => go("server")} />
                </ChoiceCard>
              </View>

              {!!message && <Problem>{message}</Problem>}

              <Rise i={6}>
                <T tone="muted" style={{ marginTop: space.xl, fontSize: 13, lineHeight: 19 }}>
                  Signing in happens in your browser, where your password manager and Google sign-in work, and then you&apos;re back here.
                </T>
              </Rise>
            </>
          ) : (
            <>
              <Eyebrow i={0}>Your own server</Eyebrow>
              <Headline i={1}>Where is your Plotra?</Headline>
              <Lede i={2}>The address you open Plotra at in a browser. You&apos;ll sign in there, and come back here.</Lede>
              <Rise i={3} style={{ marginTop: space.xl, gap: space.sm }}>
                <Text style={{ color: c.mutedForeground, fontSize: 13, fontWeight: "600" }}>Address</Text>
                <TextInput
                  value={address}
                  onChangeText={setAddress}
                  autoFocus
                  placeholder="plotra.example.com"
                  placeholderTextColor={c.mutedForeground}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  returnKeyType="go"
                  onSubmitEditing={connect}
                  accessibilityLabel="Your Plotra server's address"
                  style={{ height: 52, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, color: c.foreground, paddingHorizontal: space.lg, fontSize: 17 }}
                />
                <T tone="muted" style={{ fontSize: 13, lineHeight: 18 }}>
                  On your own network, use the computer&apos;s address, like http://192.168.1.4:3000: the phone can&apos;t reach “localhost”.
                </T>
              </Rise>
              {!!message && <Problem>{message}</Problem>}
              <Rise i={4} style={{ marginTop: space.xl, gap: space.sm }}>
                <Button label="Connect and sign in" busy={busy === "server"} disabled={!address.trim() || !!busy} onPress={connect} />
                <Pressable accessibilityRole="button" onPress={() => go("choose")} style={{ alignSelf: "center", padding: space.md }}>
                  <Text style={{ color: c.mutedForeground, fontSize: 15 }}>Back</Text>
                </Pressable>
              </Rise>
            </>
          )}
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Problem({ children }: { children: string }) {
  const c = useColors();
  return (
    <Rise>
      <View accessibilityLiveRegion="polite" style={{ marginTop: space.lg, padding: space.md, borderRadius: radius.md, backgroundColor: c.emberSoft }}>
        <Text style={{ color: c.emberInk, fontSize: 14, lineHeight: 20 }}>{children}</Text>
      </View>
    </Rise>
  );
}
