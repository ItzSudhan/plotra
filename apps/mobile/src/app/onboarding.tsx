import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Animated, { Easing, SlideInLeft, SlideInRight, useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Eyebrow, Glow, Headline, Lede, OptionCard, Point, Rise } from "@/components/onboarding/parts";
import { Button, Chip, Loading, T } from "@/components/ui";
import { isOffline } from "@/lib/api";
import { invalidate, keys, useResource } from "@/lib/cache";
import { projectTypeLabel } from "@/lib/kinds";
import { createFirstWorkspace, createSampleProject, firstProjectTypes, onboardingSamples } from "@/lib/onboarding-api";
import { pushStatus, registerPush } from "@/lib/push";
import { useClient, useSession } from "@/lib/session";
import { createProject } from "@/lib/settings-api";
import { radius, space, useColors } from "@/lib/theme";

// The first run after signing in, in the manner of the desktop app's first
// window and the web's Cold Open: hello, then only what this account still
// needs. A new account names its first workspace and makes a first project
// (blank, or one of the samples to look around in); anyone can turn on
// notifications. Then the Library, or the project just made. Each screen
// slides in the way you're going, and its parts rise into place.

type Step = "hello" | "workspace" | "project" | "notify";

export default function Onboarding() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const client = useClient();
  const { finishOnboarding } = useSession();
  const me = useResource(keys.me, client.me);
  const projects = useResource(keys.projects, client.projects);

  const [step, setStep] = useState<Step>("hello");
  const [going, setGoing] = useState<"forward" | "back">("forward");
  const [canNotify, setCanNotify] = useState(false);
  const [workspace, setWorkspace] = useState<string | null>(null);
  const [made, setMade] = useState<{ projectId: string; title: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void pushStatus().then((s) => setCanNotify(s === "ask"));
  }, []);

  const firstName = (me.data?.user.name || "").trim().split(/\s+/)[0] || "";
  const slug = workspace ?? me.data?.workspaces[0]?.slug ?? null;
  const loaded = !!me.data && !!projects.data;

  // What this account still needs, in order.
  const steps = useMemo<Step[]>(() => {
    if (!me.data || !projects.data) return ["hello"];
    return [
      "hello",
      ...(me.data.workspaces.length === 0 ? (["workspace"] as const) : []),
      ...(projects.data.length === 0 ? (["project"] as const) : []),
      ...(canNotify ? (["notify"] as const) : []),
    ];
  }, [me.data, projects.data, canNotify]);

  const finish = (opened = made) => {
    invalidate(keys.me);
    invalidate(keys.projects);
    finishOnboarding();
    // Once the Library is there to come back to.
    if (opened) setTimeout(() => router.push({ pathname: "/project/[projectId]", params: { projectId: opened.projectId, title: opened.title } }), 250);
  };

  const next = (from: Step, opened = made) => {
    setError(null);
    const at = steps.indexOf(from);
    const following = steps.slice(at + 1).find((s) => s !== "workspace" || !workspace);
    if (!following) return finish(opened);
    setGoing("forward");
    setStep(following);
  };

  const back = (from: Step) => {
    const at = steps.indexOf(from);
    if (at <= 0) return;
    setError(null);
    setGoing("back");
    setStep(steps[at - 1]);
  };

  const attempt = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(isOffline(e) ? "You're offline. Try again when you're back online." : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const slide = reduced ? undefined : (going === "forward" ? SlideInRight : SlideInLeft).duration(380).easing(Easing.bezier(0.2, 0.7, 0.2, 1));

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: c.background }}>
      <Glow />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xl, paddingHorizontal: space.xl }}>
        <Animated.View key={step} entering={slide} style={{ flex: 1 }}>
          {step === "hello" && (
            <Hello
              name={firstName}
              ready={loaded || !!me.error}
              onNext={() => next("hello")}
            />
          )}
          {step === "workspace" && (
            <WorkspaceStep
              suggested={firstName ? `${firstName}'s workspace` : "My workspace"}
              busy={busy}
              error={error}
              onBack={() => back("workspace")}
              onCreate={(name) =>
                void attempt(async () => {
                  const created = await createFirstWorkspace(client, name);
                  setWorkspace(created.slug);
                  invalidate(keys.me);
                  next("workspace");
                })
              }
            />
          )}
          {step === "project" && (
            <ProjectStep
              busy={busy}
              error={error}
              onBack={() => back("project")}
              onSkip={() => next("project")}
              onBlank={(title, type) =>
                void attempt(async () => {
                  if (!slug) throw new Error("Name your workspace first.");
                  const created = await createProject(client, { workspace: slug, title, type });
                  const opened = { projectId: created.projectId, title };
                  setMade(opened);
                  next("project", opened);
                })
              }
              onSample={(sampleId) =>
                void attempt(async () => {
                  if (!slug) throw new Error("Name your workspace first.");
                  const opened = await createSampleProject(client, slug, sampleId);
                  setMade(opened);
                  next("project", opened);
                })
              }
            />
          )}
          {step === "notify" && (
            <NotifyStep
              busy={busy}
              onBack={() => back("notify")}
              onTurnOn={() =>
                void attempt(async () => {
                  await registerPush(client, { ask: true }).catch(() => "unavailable");
                  finish();
                })
              }
              onSkip={() => finish()}
            />
          )}
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Hello({ name, ready, onNext }: { name: string; ready: boolean; onNext: () => void }) {
  const c = useColors();
  return (
    <View style={{ flex: 1 }}>
      <Eyebrow i={0} />
      <Headline i={1}>
        {name ? "Welcome, " : "Welcome to "}
        <Text style={{ color: c.emberInk, fontStyle: "italic" }}>{name ? `${name}.` : "Plotra."}</Text>
      </Headline>
      <Lede i={2}>Plotra on your phone is the same story as everywhere else, ready for the minutes in between.</Lede>
      <View style={{ gap: space.lg, marginTop: space.xl }}>
        <Point i={3} glyph="edit" title="Write anywhere" body="The same notes as on the web, with all their formatting. Co-writers appear as they type." />
        <Point i={4} glyph="offline" title="On the train, too" body="What you open stays on your phone. Write offline; it's sent when you're back." />
        <Point i={5} glyph="capture" title="Catch an idea" body="The bolt in the Library makes a quick note in any project." />
      </View>
      <View style={{ flex: 1, minHeight: space.xl }} />
      <Rise i={6} style={{ marginTop: space.xl }}>
        {ready ? <Button label="Continue" onPress={onNext} /> : <Loading />}
      </Rise>
    </View>
  );
}

function WorkspaceStep({ suggested, busy, error, onBack, onCreate }: { suggested: string; busy: boolean; error: string | null; onBack: () => void; onCreate: (name: string) => void }) {
  const c = useColors();
  const [name, setName] = useState(suggested);
  return (
    <View style={{ flex: 1 }}>
      <Eyebrow i={0}>One thing first</Eyebrow>
      <Headline i={1}>Name your workspace</Headline>
      <Lede i={2}>It holds your projects and the people you write with. You can rename it any time.</Lede>
      <Rise i={3} style={{ marginTop: space.xl, gap: space.sm }}>
        <TextInput
          value={name}
          onChangeText={setName}
          autoFocus
          selectTextOnFocus
          maxLength={80}
          returnKeyType="next"
          onSubmitEditing={() => name.trim() && onCreate(name)}
          accessibilityLabel="Workspace name"
          style={{ height: 52, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, color: c.foreground, paddingHorizontal: space.lg, fontSize: 17 }}
        />
      </Rise>
      {!!error && <Problem>{error}</Problem>}
      <View style={{ flex: 1, minHeight: space.xl }} />
      <Rise i={4} style={{ gap: space.sm }}>
        <Button label="Continue" busy={busy} disabled={!name.trim()} onPress={() => onCreate(name)} />
        <BackLink onPress={onBack} />
      </Rise>
    </View>
  );
}

function ProjectStep({
  busy,
  error,
  onBack,
  onSkip,
  onBlank,
  onSample,
}: {
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onSkip: () => void;
  onBlank: (title: string, type: string) => void;
  onSample: (sampleId: string) => void;
}) {
  const c = useColors();
  const client = useClient();
  const samples = useResource("onboarding-samples", () => onboardingSamples(client));
  const [choice, setChoice] = useState<string>("blank");
  const [title, setTitle] = useState("");
  const [type, setType] = useState<string>("novel");

  const go = () => (choice === "blank" ? onBlank(title.trim() || "Untitled", type) : onSample(choice));

  return (
    <View style={{ flex: 1 }}>
      <Eyebrow i={0}>Your first project</Eyebrow>
      <Headline i={1}>What are you writing?</Headline>
      <Lede i={2}>Start your own, or open a sample to look around in. Either can be deleted later.</Lede>

      <View style={{ gap: space.sm, marginTop: space.xl }}>
        <Rise i={3}>
          <OptionCard selected={choice === "blank"} onPress={() => setChoice("blank")} glyph="book" title="My own story" body="An empty project, ready for its first scene." />
        </Rise>
        {choice === "blank" && (
          <Rise style={{ gap: space.sm, paddingVertical: space.sm }}>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Its title (you can change it)"
              placeholderTextColor={c.mutedForeground}
              maxLength={120}
              accessibilityLabel="Project title"
              style={{ height: 50, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, color: c.foreground, paddingHorizontal: space.lg, fontSize: 16 }}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }} accessibilityRole="radiogroup" accessibilityLabel="Kind of story">
              {firstProjectTypes.map((t) => (
                <Chip key={t} label={projectTypeLabel(t)} selected={type === t} onPress={() => setType(t)} />
              ))}
            </ScrollView>
          </Rise>
        )}
        {(samples.data ?? []).map((s, i) => (
          <Rise key={s.id} i={4 + i}>
            <OptionCard selected={choice === s.id} onPress={() => setChoice(s.id)} glyph={s.type === "ttrpg" ? "globe" : "research"} title={`Sample: ${s.label}`} body={s.description} />
          </Rise>
        ))}
      </View>

      {!!error && <Problem>{error}</Problem>}
      <View style={{ flex: 1, minHeight: space.xl }} />
      <Rise i={7} style={{ gap: space.sm, marginTop: space.xl }}>
        <Button label={choice === "blank" ? "Start writing" : "Open the sample"} busy={busy} onPress={go} />
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <BackLink onPress={onBack} />
          <Pressable accessibilityRole="button" onPress={onSkip} disabled={busy} style={{ padding: space.md }}>
            <Text style={{ color: c.mutedForeground, fontSize: 15 }}>Not now</Text>
          </Pressable>
        </View>
      </Rise>
    </View>
  );
}

function NotifyStep({ busy, onBack, onTurnOn, onSkip }: { busy: boolean; onBack: () => void; onTurnOn: () => void; onSkip: () => void }) {
  const c = useColors();
  return (
    <View style={{ flex: 1 }}>
      <Eyebrow i={0}>Last thing</Eyebrow>
      <Headline i={1}>Hear when someone needs you</Headline>
      <Lede i={2}>A notification when you&apos;re mentioned, someone replies to you, shares a project or asks for your review. Nothing else, and you can turn it off in Account.</Lede>
      <View style={{ gap: space.lg, marginTop: space.xl }}>
        <Point i={3} glyph="bellOn" title="Replies and mentions" body="Tap one to open the thread, the chat or the note." />
      </View>
      <View style={{ flex: 1, minHeight: space.xl }} />
      <Rise i={4} style={{ gap: space.sm, marginTop: space.xl }}>
        <Button label="Turn on notifications" icon="bell" busy={busy} onPress={onTurnOn} />
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <BackLink onPress={onBack} />
          <Pressable accessibilityRole="button" onPress={onSkip} disabled={busy} style={{ padding: space.md }}>
            <Text style={{ color: c.mutedForeground, fontSize: 15 }}>Not now</Text>
          </Pressable>
        </View>
      </Rise>
    </View>
  );
}

function BackLink({ onPress }: { onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ padding: space.md, alignSelf: "flex-start" }}>
      <Text style={{ color: c.mutedForeground, fontSize: 15 }}>Back</Text>
    </Pressable>
  );
}

function Problem({ children }: { children: string }) {
  const c = useColors();
  return (
    <Rise>
      <View accessibilityLiveRegion="polite" style={{ marginTop: space.lg, padding: space.md, borderRadius: radius.md, backgroundColor: c.emberSoft }}>
        <T style={{ color: c.emberInk, fontSize: 14, lineHeight: 20 }}>{children}</T>
      </View>
    </Rise>
  );
}
