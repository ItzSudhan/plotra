import * as Clipboard from "expo-clipboard";
import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, AppState, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMenu } from "@/components/menu";
import { Banner, Empty, IconButton, Loading } from "@/components/ui";
import { isOffline } from "@/lib/api";
import { invalidate, useResource } from "@/lib/cache";
import { CHAT_PAGE, chatNotice, deleteChat, joinsPrevious, loadChat, mergeMessages, sendChat, type ChatMessage, type ChatPerson, type ChatView } from "@/lib/chat-api";
import { ago } from "@/lib/links";
import { insertMention, mentionAt, splitMentions, suggest } from "@/lib/mentions";
import { joinPresence, type PresenceLink } from "@/lib/presence";
import { useClient } from "@/lib/session";
import { radius, space, useColors } from "@/lib/theme";

// The project's chat, or a note's (param `note`): talk about the work, apart
// from comments, which are about the words. Newest at the bottom, older ones
// as you scroll up. "@Name" tells that person, as on the web. New messages
// arrive at once over the project's presence room, as they do on the web
// (lib/presence.ts); the chat also looks again every so often while it's
// open, and when you come back to it, in case that room can't be reached.

/** How often to look again while open: rarely when notices arrive live, more often when they don't. */
const POLL_LIVE_MS = 30_000;
const POLL_MS = 8_000;

export default function ChatScreen() {
  const { projectId, note, title } = useLocalSearchParams<{ projectId: string; note?: string; title?: string }>();
  const noteId = note || null;
  const c = useColors();
  const insets = useSafeAreaInsets();
  const client = useClient();
  const showMenu = useMenu();
  const key = `chat:${projectId}:${noteId ?? "project"}`;
  const view = useResource<ChatView>(key, () => loadChat(client, projectId, noteId));
  const { mutate } = view;
  const data = view.data;

  // Pages further back, loaded as you scroll up; the latest page is the resource above.
  const [older, setOlder] = useState<ChatMessage[]>([]);
  const [noOlder, setNoOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const messages = useMemo(() => mergeMessages(older, data?.messages ?? []), [older, data?.messages]);
  const hasOlder = !noOlder && (data?.messages.length ?? 0) >= CHAT_PAGE;

  const people = useMemo(() => new Map((data?.people ?? []).map((p) => [p.id, p])), [data?.people]);
  const names = useMemo(() => (data?.people ?? []).map((p) => p.name), [data?.people]);

  // Live: someone posted in this chat, here or on the web.
  const presence = useRef<PresenceLink | null>(null);
  const [live, setLive] = useState(false);
  useEffect(() => {
    const link = joinPresence(client, projectId, (notice) => notice === chatNotice(noteId) && invalidate(key), setLive);
    presence.current = link;
    return () => {
      link.close();
      presence.current = null;
    };
  }, [client, key, noteId, projectId]);

  useFocusEffect(
    useCallback(() => {
      invalidate(key);
      const timer = setInterval(() => invalidate(key), live ? POLL_LIVE_MS : POLL_MS);
      const sub = AppState.addEventListener("change", (state) => state === "active" && invalidate(key));
      return () => {
        clearInterval(timer);
        sub.remove();
      };
    }, [key, live]),
  );

  const loadOlder = async () => {
    const first = messages[0];
    if (!hasOlder || loadingOlder || !first) return;
    setLoadingOlder(true);
    try {
      const page = await loadChat(client, projectId, noteId, first.createdAt);
      setOlder((list) => mergeMessages(page.messages, list));
      if (page.messages.length < CHAT_PAGE) setNoOlder(true);
    } catch {
      // Offline: scrolling up again tries again.
    } finally {
      setLoadingOlder(false);
    }
  };

  const [text, setText] = useState("");
  const [caret, setCaret] = useState(0);
  const [busy, setBusy] = useState(false);
  const mention = mentionAt(text, caret);
  const matches = mention ? suggest(data?.people ?? [], mention.query) : [];
  const pick = (person: ChatPerson) => {
    if (!mention) return;
    const next = insertMention(text, mention, person.name);
    setText(next.text);
    setCaret(next.caret);
  };

  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const message = await sendChat(client, projectId, noteId, body);
      mutate((current) => current && { ...current, messages: mergeMessages([], [...current.messages, message]) });
      setText("");
      setCaret(0);
      presence.current?.notify(chatNotice(noteId));
    } catch (e) {
      Alert.alert("Couldn't send it", isOffline(e) ? "You're offline. Your message is still in the box; send it when you're back online." : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = (message: ChatMessage) =>
    Alert.alert("Delete this message?", "It's removed for everyone in the chat. This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteChat(client, projectId, noteId, message.id);
            mutate((current) => current && { ...current, messages: current.messages.filter((m) => m.id !== message.id) });
            setOlder((list) => list.filter((m) => m.id !== message.id));
            presence.current?.notify(chatNotice(noteId));
          } catch (e) {
            Alert.alert("Couldn't delete it", isOffline(e) ? "You're offline. Try again when you're back online." : (e as Error).message);
          }
        },
      },
    ]);

  const hold = (message: ChatMessage) =>
    showMenu({
      items: [
        { label: "Copy text", icon: "share", onPress: () => void Clipboard.setStringAsync(message.body) },
        ...(message.mine || data?.canManage ? [{ label: "Delete", icon: "trash" as const, destructive: true, onPress: () => remove(message) }] : []),
      ],
    });

  // Newest first for the inverted list, which keeps the newest at the bottom.
  const shown = useMemo(() => messages.map((m, i) => ({ message: m, joined: joinsPrevious(m, messages[i - 1]) })).reverse(), [messages]);

  return (
    <>
      <Stack.Screen options={{ title: noteId ? "Chat about this note" : "Project chat" }} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 44 : 0} style={{ flex: 1, backgroundColor: c.background }}>
        {!!title && (
          <Text numberOfLines={1} style={{ color: c.mutedForeground, fontSize: 14, paddingHorizontal: space.lg, paddingTop: space.sm }}>
            {noteId ? `About “${title}”` : title}
          </Text>
        )}
        <Banner offline={view.offline} error={view.offline ? null : view.error} onRetry={view.refresh} />
        {view.loading && !data ? (
          <Loading />
        ) : messages.length === 0 ? (
          <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
            <Empty
              icon="chat"
              title={noteId ? "Nothing said about this note yet" : "Nothing said in this project yet"}
              body="Talk here about the work. Comments are for the words themselves. Type @ and a name to tell someone."
            />
          </ScrollView>
        ) : (
          <FlatList
            inverted
            style={{ flex: 1 }}
            data={shown}
            keyExtractor={(item) => item.message.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: space.lg, paddingVertical: space.md }}
            onEndReached={() => void loadOlder()}
            onEndReachedThreshold={0.3}
            ListFooterComponent={loadingOlder ? <ActivityIndicator style={{ padding: space.md }} color={c.mutedForeground} /> : undefined}
            renderItem={({ item }) => <Bubble message={item.message} joined={item.joined} author={item.message.authorId ? people.get(item.message.authorId) : undefined} names={names} onHold={() => hold(item.message)} />}
          />
        )}

        <View style={{ borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.card, paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: Math.max(insets.bottom, space.sm) }}>
          {data && !data.canTalk ? (
            <Text style={{ color: c.mutedForeground, fontSize: 14, textAlign: "center", paddingVertical: space.sm }}>You can read this chat. Commenters and editors can write in it.</Text>
          ) : (
            <>
              {matches.length > 0 && (
                <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingBottom: space.sm }}>
                  {matches.map((p) => (
                    <Pressable
                      key={p.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Mention ${p.name}`}
                      onPress={() => pick(p)}
                      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: space.xs, height: 34, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: pressed ? c.muted : c.accent })}
                    >
                      <Text style={{ color: c.foreground, fontSize: 14 }}>@{p.name}</Text>
                      {p.guest && <Text style={{ color: c.mutedForeground, fontSize: 12 }}>Guest</Text>}
                    </Pressable>
                  ))}
                </ScrollView>
              )}
              <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space.xs }}>
                <TextInput
                  value={text}
                  onChangeText={(next) => {
                    setText(next);
                    // Typing moves the caret with it; onSelectionChange corrects it when they tap elsewhere.
                    setCaret(next.length - (text.length - caret));
                  }}
                  onSelectionChange={(e) => setCaret(e.nativeEvent.selection.end)}
                  multiline
                  maxLength={4000}
                  placeholder={noteId ? "Message about this note… (@ to mention)" : "Message the project… (@ to mention)"}
                  placeholderTextColor={c.mutedForeground}
                  accessibilityLabel={noteId ? "Message about this note" : "Message the project"}
                  style={{ flex: 1, maxHeight: 140, minHeight: 44, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.background, color: c.foreground, paddingHorizontal: space.md, paddingTop: 11, paddingBottom: 11, fontSize: 16 }}
                />
                <IconButton name="send" label="Send" color={c.ember} disabled={!text.trim() || busy || !data} onPress={() => void send()} />
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

function Bubble({ message, joined, author, names, onHold }: { message: ChatMessage; joined: boolean; author: ChatPerson | undefined; names: string[]; onHold: () => void }) {
  const c = useColors();
  const name = message.mine ? "You" : (author?.name ?? "Someone");
  return (
    <Pressable
      accessibilityRole="text"
      accessibilityLabel={`${name}, ${ago(message.createdAt)}: ${message.body}`}
      accessibilityHint="Hold for more"
      onLongPress={onHold}
      style={({ pressed }) => ({ flexDirection: "row", gap: space.sm, marginTop: joined ? 2 : space.md, opacity: pressed ? 0.7 : 1 })}
    >
      {joined ? (
        <View style={{ width: 28 }} />
      ) : (
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: message.mine ? c.emberSoft : c.accent, alignItems: "center", justifyContent: "center", marginTop: 2 }}>
          <Text style={{ color: message.mine ? c.emberInk : c.mutedForeground, fontSize: 13, fontWeight: "600" }}>{(author?.name ?? "?").trim().charAt(0).toUpperCase() || "?"}</Text>
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        {!joined && (
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm, marginBottom: 2 }}>
            <Text style={{ color: c.foreground, fontSize: 14, fontWeight: "600" }}>{name}</Text>
            <Text style={{ color: c.mutedForeground, fontSize: 12 }}>{ago(message.createdAt)}</Text>
          </View>
        )}
        <Text style={{ color: c.foreground, fontSize: 16, lineHeight: 23 }}>
          {splitMentions(message.body, names).map((part, i) =>
            part.mention ? (
              <Text key={i} style={{ color: c.emberInk, fontWeight: "500", backgroundColor: c.emberSoft }}>
                {part.text}
              </Text>
            ) : (
              part.text
            ),
          )}
        </Text>
      </View>
    </Pressable>
  );
}
