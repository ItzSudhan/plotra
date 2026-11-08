import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View, type ScrollViewInstance } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/icon";
import { MarkdownView } from "@/components/markdown-view";
import { useMenu } from "@/components/menu";
import { Banner, Button, Chip, Empty, IconButton, Loading } from "@/components/ui";
import { isOffline } from "@/lib/api";
import { agentKey, deleteThread, loadAgent, loadThread, modes, runChanges, runTurn, undoRun, type AgentMessage, type AgentMode, type NoteRef, type Turn } from "@/lib/agent-api";
import { insertNote, matchNotes, noteMentionAt, stillMentioned, upsert } from "@/lib/agent-text";
import { invalidate, keys, useResource } from "@/lib/cache";
import { openWeb, webUrl } from "@/lib/links";
import type { Wiki } from "@/lib/markdown";
import type { Note } from "@/lib/types";
import { useProject } from "@/lib/project";
import { useClient, useSession } from "@/lib/session";
import { radius, space, useColors } from "@/lib/theme";

// Ask the project's AI (plan.md 2.11), as in the web's panel and with the
// same rules, on the server: AI is off until a workspace owner turns it on,
// each project has its own switch, only people who can edit may use it, and
// it runs on the person's own model. Ask reads and changes nothing; Suggest
// leaves text edits as suggestions; Auto changes things and lists what it
// changed, with Undo. What it writes goes into the live documents, so it
// shows in open editors at once. The answer appears as it's written.
//
// Param `note` (and `title`) comes from a note's menu: the box starts with
// "@Title " so the AI is pointed at it.

const threadKey = (projectId: string) => `agent-thread:${projectId}`;
const modeKey = (projectId: string) => `agent-mode:${projectId}`;
const allModes = Object.keys(modes) as AgentMode[];

export default function Ask() {
  const { projectId, note, title } = useLocalSearchParams<{ projectId: string; note?: string; title?: string }>();
  const c = useColors();
  const client = useClient();
  const { server } = useSession();
  const { project, notes } = useProject(projectId);
  const state = useResource(agentKey(projectId), () => loadAgent(client, projectId));
  const ai = state.data?.ai;
  // Made once, so opening the chat below doesn't run again on every render.
  const startNote = useMemo(() => (note ? { id: note, title: title || "this note" } : null), [note, title]);

  const webFor = () => {
    if (!ai || ai.on) return server;
    if (ai.reason === "workspace" && project?.workspaceSlug) return `${server}/w/${encodeURIComponent(project.workspaceSlug)}/settings?tab=ai`;
    if (ai.reason === "no-model" || ai.reason === "own-machine") return `${server}/settings`;
    return webUrl(server, project);
  };

  return (
    <>
      <Stack.Screen options={{ title: "Ask AI" }} />
      {state.loading && !state.data ? (
        <Loading />
      ) : !ai ? (
        <View style={{ flex: 1, backgroundColor: c.background }}>
          <Banner offline={state.offline} error={state.error} onRetry={state.refresh} />
        </View>
      ) : !ai.on ? (
        <ScrollView style={{ flex: 1, backgroundColor: c.background }}>
          <Banner offline={state.offline} error={state.offline ? null : state.error} onRetry={state.refresh} />
          <Empty
            icon="sparkles"
            title={ai.reason === "no-model" ? "Connect your AI account" : ai.reason === "own-machine" ? "Your AI is on your computer" : "AI is off here"}
            body={ai.message}
            action={
              ai.reason === "server" || ai.reason === "promise" || ai.reason === "edit" ? undefined : (
                <View style={{ gap: space.sm, alignSelf: "stretch" }}>
                  <Button label={ai.reason === "no-model" ? "Open AI settings on the web" : "Open on the web"} icon="web" variant="secondary" onPress={() => void openWeb(webFor())} />
                  <Button label="Check again" variant="ghost" busy={state.refreshing} onPress={() => void state.refresh()} />
                </View>
              )
            }
          />
        </ScrollView>
      ) : (
        <Conversation projectId={projectId} threads={state.data?.threads ?? []} notes={notes.data ?? []} startNote={startNote} onAnswered={() => invalidate(agentKey(projectId))} />
      )}
    </>
  );
}

type Props = {
  projectId: string;
  threads: { id: string; title: string; updatedAt: string }[];
  notes: Note[];
  startNote: NoteRef | null;
  onAnswered: () => void;
};

function Conversation({ projectId, threads, notes, startNote, onAnswered }: Props) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const client = useClient();
  const showMenu = useMenu();

  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentMessage[] | null>(null);
  const [mode, setMode] = useState<AgentMode>("suggest");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stopper = useRef<AbortController | null>(null);
  const scroll = useRef<ScrollViewInstance>(null);

  const open = useCallback(
    async (id: string | null) => {
      stopper.current?.abort();
      setError(null);
      if (!id) {
        // A new conversation exists on the server once its first message is sent.
        setThreadId(Crypto.randomUUID());
        setMessages([]);
        return;
      }
      setThreadId(id);
      setMessages(null);
      try {
        setMessages(await loadThread(client, projectId, id));
      } catch (e) {
        setError(isOffline(e) ? "You're offline. Your chats with the AI open when you're back online." : (e as Error).message);
        setMessages([]);
      }
    },
    [client, projectId],
  );

  // Back to the chat and the mode last used in this project, unless a note sent us here to start one.
  useEffect(() => {
    void (async () => {
      const [saved, savedMode] = await Promise.all([AsyncStorage.getItem(threadKey(projectId)).catch(() => null), AsyncStorage.getItem(modeKey(projectId)).catch(() => null)]);
      if (savedMode && (allModes as string[]).includes(savedMode)) setMode(savedMode as AgentMode);
      void open(startNote ? null : saved);
    })();
    return () => stopper.current?.abort();
  }, [open, projectId, startNote]);
  useEffect(() => {
    if (threadId && messages?.length) void AsyncStorage.setItem(threadKey(projectId), threadId).catch(() => {});
  }, [messages?.length, projectId, threadId]);
  const pickMode = (next: AgentMode) => {
    setMode(next);
    void AsyncStorage.setItem(modeKey(projectId), next).catch(() => {});
  };

  // The box, with "@" to point at a note.
  const [text, setText] = useState(startNote ? `@${startNote.title} ` : "");
  const [caret, setCaret] = useState(text.length);
  const [picked, setPicked] = useState<NoteRef[]>(startNote ? [startNote] : []);
  const query = noteMentionAt(text, caret);
  const matches = useMemo(() => (query === null ? [] : matchNotes(notes, query)), [notes, query]);
  const pickNote = (n: NoteRef) => {
    const next = insertNote(text, caret, n.title);
    setText(next.text);
    setCaret(next.caret);
    setPicked((list) => (list.some((m) => m.id === n.id) ? list : [...list, { id: n.id, title: n.title }]));
  };

  const go = async (turn: Omit<Turn, "threadId" | "projectId" | "mode">) => {
    if (!threadId || busy) return;
    const controller = new AbortController();
    stopper.current = controller;
    setBusy(true);
    setError(null);
    try {
      await runTurn(
        client,
        { threadId, projectId, mode, ...turn },
        (event) => {
          if ("message" in event) setMessages((list) => upsert(list ?? [], event.message));
          else if ("error" in event) setError(event.error);
        },
        controller.signal,
      );
    } catch (e) {
      if (!controller.signal.aborted) setError(isOffline(e) ? "You're offline. The AI needs a connection; try again when you're back online." : (e as Error).message);
    } finally {
      if (stopper.current === controller) stopper.current = null;
      setBusy(false);
      // The saved conversation, with the server's ids (what "Try again" and the changes list need).
      try {
        const saved = await loadThread(client, projectId, threadId);
        if (saved.length) setMessages(saved);
      } catch {}
      onAnswered();
      // It may have added, moved or renamed notes, or changed their text.
      invalidate(keys.notes(projectId));
      invalidate(`note:${projectId}:`);
    }
  };

  const send = () => {
    const message = text.trim();
    if (!message || busy) return;
    const mentions = stillMentioned(message, picked);
    // Shown at once; the saved copy replaces it when the answer is in.
    setMessages((list) => [
      ...(list ?? []),
      { id: `local-${Date.now()}`, role: "user", items: [{ type: "text", text: message }], mentions, used: [], approvals: [], approvalReason: null, runId: null, mode, tokens: null },
    ]);
    setText("");
    setCaret(0);
    setPicked([]);
    void go({ text: message, mentions: mentions.map((m) => m.id) });
  };

  // Answers to what the last answer asked; it carries on once every one has a yes or a no.
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const last = messages?.at(-1);
  const asking = !busy && last?.role === "assistant" && last.approvals.length > 0 ? last : null;
  const answer = (id: string, approved: boolean) => {
    if (!asking) return;
    const next = { ...answers, [id]: approved };
    setAnswers(next);
    if (asking.approvals.every((a) => a.id in next)) {
      setAnswers({});
      void go({ approvals: asking.approvals.map((a) => ({ id: a.id, approved: next[a.id] })) });
    }
  };
  const answerAll = (approved: boolean) => {
    if (!asking) return;
    setAnswers({});
    void go({ approvals: asking.approvals.map((a) => ({ id: a.id, approved })) });
  };

  const retry = () => {
    const lastAnswer = messages?.at(-1)?.role === "assistant" ? messages.at(-1) : undefined;
    void go({ regenerate: { messageId: lastAnswer?.id ?? null } });
  };

  const openNote = (id: string) => router.push({ pathname: "/project/[projectId]/note/[noteId]", params: { projectId, noteId: id } });
  const onWiki = (wiki: Wiki) => {
    const found = notes.find((n) => n.title.trim().toLowerCase() === wiki.title.trim().toLowerCase() || n.aliases.some((a) => a.toLowerCase() === wiki.title.toLowerCase()));
    if (found) openNote(found.id);
  };

  const chatsMenu = () =>
    showMenu({
      title: "Your chats with the AI here",
      items: [
        { label: "New chat", icon: "add", onPress: () => void open(null) },
        ...threads.slice(0, 12).map((t) => ({ label: t.title || "Untitled chat", icon: "chat" as const, onPress: () => void open(t.id) })),
        ...(messages?.length && threadId
          ? [
              {
                label: "Delete this chat",
                icon: "trash" as const,
                destructive: true,
                onPress: () =>
                  Alert.alert("Delete this chat?", "Its messages are deleted for good. What the AI already changed in your notes stays.", [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Delete chat",
                      style: "destructive",
                      onPress: async () => {
                        try {
                          await deleteThread(client, projectId, threadId);
                          void AsyncStorage.removeItem(threadKey(projectId)).catch(() => {});
                          onAnswered();
                          void open(null);
                        } catch (e) {
                          Alert.alert("Couldn't delete it", isOffline(e) ? "You're offline. Try again when you're back online." : (e as Error).message);
                        }
                      },
                    },
                  ]),
              },
            ]
          : []),
      ],
    });

  const lastAssistant = messages?.findLast((m) => m.role === "assistant")?.id;

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={{ flexDirection: "row" }}>
              <IconButton name="history" label="Your chats" onPress={chatsMenu} />
              <IconButton name="add" label="New chat" onPress={() => void open(null)} disabled={busy} />
            </View>
          ),
        }}
      />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 44 : 0} style={{ flex: 1, backgroundColor: c.background }}>
        <View accessibilityRole="radiogroup" accessibilityLabel="What the AI may do" style={{ paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.xs }}>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            {allModes.map((m) => (
              <Chip key={m} label={modes[m].label} selected={m === mode} onPress={() => pickMode(m)} />
            ))}
          </View>
          <Text style={{ color: c.mutedForeground, fontSize: 13, lineHeight: 18 }}>{modes[mode].description}</Text>
        </View>

        <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ padding: space.lg, gap: space.lg }} keyboardShouldPersistTaps="handled" onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
          {messages === null ? (
            <Loading />
          ) : messages.length === 0 ? (
            <View style={{ gap: space.md, paddingTop: space.lg }}>
              <Text style={{ color: c.mutedForeground, fontSize: 15, lineHeight: 22, textAlign: "center" }}>
                {mode === "ask"
                  ? "Ask anything about this project. The AI looks it up in your notes and links the ones it used."
                  : "Say what to write or change. The AI looks things up in your notes first, and lists everything it changed."}
              </Text>
              <Text style={{ color: c.mutedForeground, fontSize: 13, lineHeight: 18, textAlign: "center" }}>
                Type @ to point at a note. What it reads is sent to the AI company you chose in your AI settings.
              </Text>
            </View>
          ) : (
            messages.map((m) => (
              <MessageView key={m.id} message={m} streaming={busy && m.id === lastAssistant} projectId={projectId} notes={notes} onOpenNote={openNote} onWiki={onWiki} />
            ))
          )}
          {busy && messages?.at(-1)?.role === "user" && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
              <ActivityIndicator color={c.mutedForeground} />
              <Text style={{ color: c.mutedForeground, fontSize: 14 }}>Thinking…</Text>
            </View>
          )}
          {asking && (
            <View accessibilityLabel="The AI is asking before it changes something" style={{ gap: space.sm, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.emberSoft }}>
              <Text style={{ color: c.foreground, fontSize: 15, fontWeight: "600" }}>
                {asking.approvals.length === 1 ? "Allow this change?" : `Allow these ${asking.approvals.length} changes?`}
                {asking.approvalReason ? <Text style={{ fontWeight: "400", color: c.mutedForeground }}> {asking.approvalReason}</Text> : null}
              </Text>
              {asking.approvals.map((a) => {
                const target = a.nodeId ? notes.find((n) => n.id === a.nodeId)?.title : null;
                const label = `${a.text}${target ? ` ${target}` : ""}`;
                const chosen = answers[a.id];
                return (
                  <View key={a.id} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                    <Text style={{ flex: 1, color: c.foreground, fontSize: 15 }}>{label}</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Don't: ${label}`} accessibilityState={{ selected: chosen === false }} onPress={() => answer(a.id, false)} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: space.md }}>
                      <Text style={{ color: c.mutedForeground, fontSize: 15, fontWeight: chosen === false ? "700" : "400" }}>Don&apos;t</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Allow: ${label}`}
                      accessibilityState={{ selected: chosen === true }}
                      onPress={() => answer(a.id, true)}
                      style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: c.foreground }}
                    >
                      <Text style={{ color: c.background, fontSize: 15, fontWeight: "600" }}>Allow</Text>
                    </Pressable>
                  </View>
                );
              })}
              {asking.approvals.length > 1 && (
                <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: space.sm }}>
                  <Button label="Allow none" variant="ghost" onPress={() => answerAll(false)} />
                  <Button label="Allow all" onPress={() => answerAll(true)} />
                </View>
              )}
            </View>
          )}
          {!!error && (
            <View accessibilityRole="alert" style={{ gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: c.muted }}>
              <Text style={{ color: c.foreground, fontSize: 15, lineHeight: 21 }}>{error}</Text>
              {!busy && !!messages?.length && (
                <Pressable accessibilityRole="button" onPress={retry} style={{ minHeight: 44, justifyContent: "center" }}>
                  <Text style={{ color: c.emberInk, fontSize: 15, fontWeight: "600" }}>Try again</Text>
                </Pressable>
              )}
            </View>
          )}
        </ScrollView>

        <View style={{ borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.card, paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: Math.max(insets.bottom, space.sm) }}>
          {matches.length > 0 && (
            <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingBottom: space.sm }}>
              {matches.map((n) => (
                <Pressable
                  key={n.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Point at ${n.title}`}
                  onPress={() => pickNote(n)}
                  style={({ pressed }) => ({ height: 34, justifyContent: "center", paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: pressed ? c.muted : c.accent })}
                >
                  <Text numberOfLines={1} style={{ color: c.foreground, fontSize: 14, maxWidth: 220 }}>
                    @{n.title || "Untitled"}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space.xs }}>
            <TextInput
              value={text}
              onChangeText={(next) => {
                setText(next);
                setCaret(next.length - (text.length - caret));
              }}
              onSelectionChange={(e) => setCaret(e.nativeEvent.selection.end)}
              multiline
              maxLength={8000}
              placeholder={mode === "ask" ? "Ask about this project… (@ for a note)" : "Say what to write or change… (@ for a note)"}
              placeholderTextColor={c.mutedForeground}
              accessibilityLabel="Message to the AI"
              style={{ flex: 1, maxHeight: 160, minHeight: 44, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.background, color: c.foreground, paddingHorizontal: space.md, paddingTop: 11, paddingBottom: 11, fontSize: 16 }}
            />
            {busy ? (
              <IconButton name="stop" label="Stop" color={c.foreground} onPress={() => stopper.current?.abort()} />
            ) : (
              <IconButton name="send" label="Send" color={c.ember} disabled={!text.trim() || !threadId} onPress={send} />
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

function MessageView({
  message,
  streaming,
  projectId,
  notes,
  onOpenNote,
  onWiki,
}: {
  message: AgentMessage;
  streaming: boolean;
  projectId: string;
  notes: Note[];
  onOpenNote: (id: string) => void;
  onWiki: (wiki: Wiki) => void;
}) {
  const c = useColors();
  const titleOf = (id: string) => notes.find((n) => n.id === id)?.title ?? null;

  if (message.role === "user") {
    return (
      <View style={{ alignItems: "flex-end", gap: space.xs, marginLeft: space.xxl }}>
        <View style={{ borderRadius: radius.lg, backgroundColor: c.accent, paddingHorizontal: space.md, paddingVertical: space.sm }}>
          <Text selectable style={{ color: c.foreground, fontSize: 16, lineHeight: 23 }}>
            {message.items.map((i) => (i.type === "text" ? i.text : "")).join("\n")}
          </Text>
        </View>
        {message.mentions.length > 0 && <NoteChips notes={message.mentions} titleOf={titleOf} onOpen={onOpenNote} />}
      </View>
    );
  }

  return (
    <View style={{ gap: space.sm }}>
      {message.items.map((item, i) =>
        item.type === "text" ? (
          <MarkdownView key={i} markdown={item.text} onWiki={onWiki} />
        ) : (
          <View key={item.id} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            {item.state === "running" ? (
              <ActivityIndicator size="small" color={c.mutedForeground} />
            ) : (
              <Icon name={item.state === "done" ? "check" : item.state === "waiting" ? "info" : "close"} size={14} color={c.mutedForeground} />
            )}
            <Text style={{ flex: 1, color: c.mutedForeground, fontSize: 14 }}>
              {item.text}
              {item.nodeId && titleOf(item.nodeId) !== null ? (
                <Text onPress={() => onOpenNote(item.nodeId!)} style={{ color: c.foreground, fontStyle: "italic" }}>
                  {" "}
                  {titleOf(item.nodeId)}
                </Text>
              ) : null}
              {item.state === "running" ? "…" : item.state === "waiting" ? " (waiting for you)" : item.state === "denied" ? " (not allowed)" : item.state === "failed" ? " (didn't work)" : ""}
            </Text>
          </View>
        ),
      )}
      {!streaming && message.runId && message.mode && message.mode !== "ask" && <Changes projectId={projectId} runId={message.runId} titleOf={titleOf} onOpen={onOpenNote} />}
      {message.used.length > 0 && (
        <View style={{ gap: space.xs }}>
          <Text style={{ color: c.mutedForeground, fontSize: 12 }}>Notes used</Text>
          <NoteChips notes={message.used.slice(0, 10)} titleOf={titleOf} onOpen={onOpenNote} />
        </View>
      )}
      {!streaming && message.tokens && (
        <Text style={{ color: c.mutedForeground, fontSize: 12 }} accessibilityHint="Your AI company bills by these; Plotra doesn't charge.">
          {message.tokens.in.toLocaleString()} tokens in · {message.tokens.out.toLocaleString()} out
        </Text>
      )}
    </View>
  );
}

function NoteChips({ notes, titleOf, onOpen }: { notes: NoteRef[]; titleOf: (id: string) => string | null; onOpen: (id: string) => void }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
      {notes.map((n) => {
        const title = titleOf(n.id);
        return (
          <Pressable
            key={n.id}
            accessibilityRole="button"
            accessibilityLabel={title === null ? `${n.title}, no longer in the project` : `Open ${title}`}
            disabled={title === null}
            onPress={() => onOpen(n.id)}
            style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 4, minHeight: 32, paddingHorizontal: space.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: c.border, opacity: pressed ? 0.6 : 1 })}
          >
            <Icon name="scene" size={12} color={c.mutedForeground} />
            <Text numberOfLines={1} style={{ color: c.mutedForeground, fontSize: 13, maxWidth: 200, textDecorationLine: title === null ? "line-through" : "none" }}>
              {title ?? n.title}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** What a run changed, under its answer, with "Undo run" (as on the web). */
function Changes({ projectId, runId, titleOf, onOpen }: { projectId: string; runId: string; titleOf: (id: string) => string | null; onOpen: (id: string) => void }) {
  const c = useColors();
  const client = useClient();
  const changes = useResource(`agent-run:${projectId}:${runId}`, () => runChanges(client, projectId, runId));
  const [open, setOpen] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const data = changes.data;
  if (!data?.changes.length) return null;
  const count = data.changes.length;

  const undo = () =>
    Alert.alert("Undo this run?", "Everything it changed is taken back, newest first.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Undo run",
        style: "destructive",
        onPress: async () => {
          setUndoing(true);
          try {
            const { failed } = await undoRun(client, projectId, runId);
            changes.mutate((d) => d && { ...d, undone: true });
            invalidate(keys.notes(projectId));
            invalidate(`note:${projectId}:`);
            if (failed.length) Alert.alert("Mostly undone", `${failed.length === 1 ? "One change" : `${failed.length} changes`} couldn't be taken back: ${failed[0]}`);
          } catch (e) {
            Alert.alert("Couldn't undo that run", isOffline(e) ? "You're offline. Try again when you're back online." : (e as Error).message);
          } finally {
            setUndoing(false);
          }
        },
      },
    ]);

  return (
    <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.xs }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: space.xs, minHeight: 44 }}>
          <Icon name={open ? "chevronDown" : "chevronRight"} size={12} color={c.mutedForeground} />
          <Text style={{ color: c.mutedForeground, fontSize: 14, textDecorationLine: data.undone ? "line-through" : "none" }}>
            {count} {count === 1 ? "change" : "changes"}
          </Text>
        </Pressable>
        {data.undone ? (
          <Text style={{ color: c.mutedForeground, fontSize: 14 }}>Undone</Text>
        ) : (
          <Pressable accessibilityRole="button" disabled={undoing} onPress={undo} style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: space.xs, opacity: undoing ? 0.5 : 1 }}>
            <Icon name="undo" size={14} color={c.foreground} />
            <Text style={{ color: c.foreground, fontSize: 14, fontWeight: "600" }}>{undoing ? "Undoing…" : "Undo run"}</Text>
          </Pressable>
        )}
      </View>
      {open &&
        data.changes.map((ch) => (
          <Text
            key={ch.id}
            onPress={ch.nodeId && titleOf(ch.nodeId) !== null ? () => onOpen(ch.nodeId!) : undefined}
            style={{ color: c.mutedForeground, fontSize: 14, paddingVertical: 4, paddingLeft: space.md }}
          >
            {ch.summary}
          </Text>
        ))}
    </View>
  );
}
