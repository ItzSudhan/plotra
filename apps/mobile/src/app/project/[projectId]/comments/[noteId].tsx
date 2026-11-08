import * as Clipboard from "expo-clipboard";
import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, Text, TextInput, View, type ScrollViewInstance, type TextInputInstance } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/icon";
import { useMenu } from "@/components/menu";
import { Banner, Empty, IconButton, Loading } from "@/components/ui";
import { isOffline } from "@/lib/api";
import { invalidate, useResource } from "@/lib/cache";
import {
  commentKeys,
  createThread,
  deleteComment,
  editComment,
  loadComments,
  replyToThread,
  restoreComment,
  setResolved,
  type CommentPerson,
  type CommentRow,
  type CommentThread,
} from "@/lib/comments-api";
import { ago } from "@/lib/links";
import { insertMention, mentionAt, splitMentions, suggest } from "@/lib/mentions";
import { useOutbox } from "@/lib/outbox";
import { useProject } from "@/lib/project";
import { useClient } from "@/lib/session";
import { radius, space, useColors } from "@/lib/theme";

// A note's comment threads, as the web's Comments panel has them
// (apps/app/components/workflow/comments-panel.tsx): open ones first, resolved
// ones folded away; reply, resolve or reopen; hold a comment to edit or delete
// it. One box at the bottom writes a comment on the whole note, a reply, or
// an edit, whichever was picked last. `?thread=` opens at one thread (from the
// Inbox, or the editor).

type Target = { kind: "new" } | { kind: "reply"; thread: CommentThread } | { kind: "edit"; comment: CommentRow };

const offlineMessage = "You're offline. This needs a connection; your words are still in the box.";

export default function CommentsScreen() {
  const { projectId, noteId, thread: focus } = useLocalSearchParams<{ projectId: string; noteId: string; thread?: string }>();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const client = useClient();
  const showMenu = useMenu();
  const { pending, enqueue } = useOutbox();
  const { notes } = useProject(projectId);
  const title = notes.data?.find((n) => n.id === noteId)?.title || "Untitled";
  const view = useResource(commentKeys.note(projectId, noteId), () => loadComments(client, projectId, noteId));
  const data = view.data;

  const [target, setTarget] = useState<Target>({ kind: "new" });
  const [text, setText] = useState("");
  const [caret, setCaret] = useState(0);
  const [busy, setBusy] = useState(false);
  // null until they open or close it: then the resolved ones show if the thread asked for is among them.
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const [undo, setUndo] = useState<string | null>(null);
  const input = useRef<TextInputInstance>(null);
  const scroll = useRef<ScrollViewInstance>(null);
  const scrolled = useRef(false);

  const threads = useMemo(() => data?.threads ?? [], [data]);
  const open = threads.filter((t) => !t.resolved);
  const resolved = threads.filter((t) => t.resolved);
  const showResolved = expanded ?? resolved.some((t) => t.id === focus);
  const canComment = !!data?.canComment;
  const people = useMemo(() => data?.people ?? [], [data]);
  const names = useMemo(() => people.map((p) => p.name), [people]);
  const waiting = pending.filter((i) => i.type === "reply" && i.noteId === noteId);

  // The Undo strip after deleting goes after a while; the server keeps the way back for ten minutes.
  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), 10_000);
    return () => clearTimeout(timer);
  }, [undo]);

  const changed = () => invalidate(commentKeys.project(projectId));
  const fail = (title: string, e: unknown) => Alert.alert(title, isOffline(e) ? offlineMessage : (e as Error).message);

  const reset = () => {
    setTarget({ kind: "new" });
    setText("");
    setCaret(0);
  };

  const startReply = (thread: CommentThread) => {
    setTarget({ kind: "reply", thread });
    input.current?.focus();
  };

  const startEdit = (comment: CommentRow) => {
    setTarget({ kind: "edit", comment });
    setText(comment.body);
    setCaret(comment.body.length);
    input.current?.focus();
  };

  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      if (target.kind === "new") await createThread(client, projectId, noteId, { anchor: null, quote: null, body });
      else if (target.kind === "reply") await replyToThread(client, projectId, noteId, target.thread.id, body);
      else await editComment(client, projectId, noteId, target.comment.id, body);
      reset();
      changed();
    } catch (e) {
      // A reply is simple to send later, so it waits on the phone; the rest need the server now.
      if (isOffline(e) && target.kind === "reply") {
        enqueue({ type: "reply", projectId, noteId, title, threadId: target.thread.id, body });
        reset();
      } else fail(target.kind === "edit" ? "Couldn't save your edit" : "Couldn't send your comment", e);
    } finally {
      setBusy(false);
    }
  };

  const toggleResolved = async (thread: CommentThread) => {
    try {
      await setResolved(client, projectId, noteId, thread.id, !thread.resolved);
      view.mutate((v) => v && { ...v, threads: v.threads.map((t) => (t.id === thread.id ? { ...t, resolved: !thread.resolved } : t)) });
      changed();
    } catch (e) {
      fail(thread.resolved ? "Couldn't reopen it" : "Couldn't resolve it", e);
    }
  };

  const remove = async (comment: CommentRow) => {
    try {
      const result = await deleteComment(client, projectId, noteId, comment.id);
      if (target.kind === "edit" && target.comment.id === comment.id) reset();
      setUndo(result.undo ?? null);
      changed();
    } catch (e) {
      fail("Couldn't delete it", e);
    }
  };

  const restore = async () => {
    if (!undo) return;
    setUndo(null);
    try {
      await restoreComment(client, projectId, noteId, undo);
      changed();
    } catch (e) {
      fail("Couldn't bring it back", e);
    }
  };

  const hold = (comment: CommentRow) => {
    const mayDelete = comment.mine || !!data?.canManage;
    showMenu({
      title: comment.mine ? "Your comment" : `${comment.authorName ?? "Former member"}'s comment`,
      items: [
        { label: "Copy text", icon: "share", onPress: () => void Clipboard.setStringAsync(comment.body) },
        ...(comment.mine && canComment ? [{ label: "Edit", icon: "edit" as const, onPress: () => startEdit(comment) }] : []),
        ...(mayDelete && canComment ? [{ label: "Delete", icon: "trash" as const, destructive: true, onPress: () => void remove(comment) }] : []),
      ],
    });
  };

  const mention = mentionAt(text, caret);
  const matches = mention ? suggest(people, mention.query) : [];
  const pick = (person: CommentPerson) => {
    if (!mention) return;
    const next = insertMention(text, mention, person.name);
    setText(next.text);
    setCaret(next.caret);
  };

  const renderThread = (t: CommentThread) => (
    <ThreadCard
      key={t.id}
      thread={t}
      names={names}
      active={t.id === focus || (target.kind === "reply" && target.thread.id === t.id)}
      canComment={canComment}
      waiting={waiting.flatMap((i) => (i.type === "reply" && i.threadId === t.id ? [{ id: i.id, body: i.body }] : []))}
      onReply={() => startReply(t)}
      onToggleResolved={() => void toggleResolved(t)}
      onHold={hold}
      onLayout={(y) => {
        if (t.id !== focus || scrolled.current) return;
        scrolled.current = true;
        scroll.current?.scrollTo({ y: Math.max(0, y - space.md), animated: true });
      }}
    />
  );

  const context =
    target.kind === "reply"
      ? `Replying${target.thread.quote ? ` on “${target.thread.quote.slice(0, 50)}”` : " on the whole note"}`
      : target.kind === "edit"
        ? "Editing your comment"
        : "A comment on the whole note";

  return (
    <>
      <Stack.Screen options={{ title: "Comments" }} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 44 : 0} style={{ flex: 1, backgroundColor: c.background }}>
        <ScrollView
          ref={scroll}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xl }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={view.refreshing} onRefresh={view.refresh} tintColor={c.mutedForeground} />}
        >
          <Text numberOfLines={2} style={{ color: c.mutedForeground, fontSize: 14 }}>
            On “{title}”
          </Text>
          <View style={{ marginHorizontal: -space.lg }}>
            <Banner offline={view.offline} error={view.offline ? null : view.error} onRetry={view.refresh} />
          </View>
          {view.loading && !data ? (
            <Loading />
          ) : !data ? null : open.length === 0 && resolved.length === 0 ? (
            <Empty icon="comment" title="No comments yet" body={canComment ? "Write one below, on the whole note. People you mention with @ hear about it." : "When someone comments on this note, it shows here."} />
          ) : (
            <>
              {open.length === 0 && <T2 tone="muted">No open comments.</T2>}
              {open.map(renderThread)}
              {resolved.length > 0 && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: showResolved }}
                  onPress={() => setExpanded(!showResolved)}
                  style={{ flexDirection: "row", alignItems: "center", gap: space.xs, minHeight: 44 }}
                >
                  <Icon name={showResolved ? "chevronDown" : "chevronRight"} size={14} color={c.mutedForeground} />
                  <T2 tone="muted">{resolved.length} resolved</T2>
                </Pressable>
              )}
              {showResolved && resolved.map(renderThread)}
            </>
          )}
        </ScrollView>

        {!!undo && (
          <View style={{ flexDirection: "row", alignItems: "center", marginHorizontal: space.lg, marginBottom: space.sm, paddingHorizontal: space.md, minHeight: 44, borderRadius: radius.md, backgroundColor: c.muted }}>
            <T2 tone="muted" style={{ flex: 1 }}>
              Comment deleted.
            </T2>
            <Pressable accessibilityRole="button" accessibilityLabel="Undo deleting the comment" onPress={() => void restore()} hitSlop={8} style={{ padding: space.sm }}>
              <Text style={{ color: c.emberInk, fontSize: 15, fontWeight: "600" }}>Undo</Text>
            </Pressable>
          </View>
        )}

        {canComment && (
          <View style={{ borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.card, paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: Math.max(insets.bottom, space.sm) }}>
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
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 28 }}>
              <T2 tone="muted" style={{ flex: 1 }} numberOfLines={1}>
                {context}
              </T2>
              {target.kind !== "new" && (
                <Pressable accessibilityRole="button" accessibilityLabel={target.kind === "edit" ? "Stop editing" : "Stop replying"} onPress={reset} hitSlop={8}>
                  <Text style={{ color: c.emberInk, fontSize: 13 }}>Cancel</Text>
                </Pressable>
              )}
            </View>
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space.xs }}>
              <TextInput
                ref={input}
                value={text}
                onChangeText={(next) => {
                  setText(next);
                  // Typing moves the caret with it; onSelectionChange corrects it when they tap elsewhere.
                  setCaret(next.length - (text.length - caret));
                }}
                onSelectionChange={(e) => setCaret(e.nativeEvent.selection.end)}
                multiline
                placeholder={target.kind === "reply" ? "Reply… (@ to mention)" : target.kind === "edit" ? "Edit your comment" : "Add a comment… (@ to mention)"}
                placeholderTextColor={c.mutedForeground}
                accessibilityLabel={context}
                style={{ flex: 1, maxHeight: 140, minHeight: 44, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.background, color: c.foreground, paddingHorizontal: space.md, paddingTop: 11, paddingBottom: 11, fontSize: 16 }}
              />
              <IconButton
                name="send"
                label={target.kind === "edit" ? "Save" : target.kind === "reply" ? "Send reply" : "Send comment"}
                color={c.ember}
                disabled={!text.trim() || busy}
                onPress={() => void send()}
              />
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </>
  );
}

function ThreadCard({
  thread,
  names,
  active,
  canComment,
  waiting,
  onReply,
  onToggleResolved,
  onHold,
  onLayout,
}: {
  thread: CommentThread;
  names: string[];
  active: boolean;
  canComment: boolean;
  waiting: { id: string; body: string }[];
  onReply: () => void;
  onToggleResolved: () => void;
  onHold: (comment: CommentRow) => void;
  onLayout: (y: number) => void;
}) {
  const c = useColors();
  return (
    <View
      accessibilityLabel={thread.quote ? `Comment on “${thread.quote.slice(0, 60)}”` : "Comment on the whole note"}
      onLayout={(e) => onLayout(e.nativeEvent.layout.y)}
      style={{ gap: space.md, padding: space.md, borderRadius: radius.lg, backgroundColor: c.card, borderWidth: 1, borderColor: active ? c.ember : c.border, opacity: thread.resolved ? 0.75 : 1 }}
    >
      {thread.quote ? (
        <Text numberOfLines={3} style={{ color: c.mutedForeground, fontSize: 14, fontStyle: "italic", borderLeftWidth: 2, borderLeftColor: c.ember, paddingLeft: space.sm }}>
          {thread.quote}
        </Text>
      ) : (
        <T2 tone="muted">On the whole note</T2>
      )}
      {thread.comments.map((comment) => (
        <Pressable
          key={comment.id}
          accessibilityHint="Hold for more"
          onLongPress={() => onHold(comment)}
          style={({ pressed }) => ({ gap: 4, borderRadius: radius.sm, backgroundColor: pressed ? c.accent : "transparent" })}
        >
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm }}>
            <Text style={{ color: c.foreground, fontSize: 14, fontWeight: "600" }}>{comment.mine ? "You" : (comment.authorName ?? "Former member")}</Text>
            <Text style={{ color: c.mutedForeground, fontSize: 13 }}>
              {ago(comment.createdAt)}
              {comment.editedAt ? " · edited" : ""}
            </Text>
          </View>
          <Body text={comment.body} names={names} />
        </Pressable>
      ))}
      {waiting.map((w) => (
        <View key={w.id} style={{ gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <Text style={{ color: c.foreground, fontSize: 14, fontWeight: "600" }}>You</Text>
            <Icon name="offline" size={13} color={c.mutedForeground} />
            <Text style={{ color: c.mutedForeground, fontSize: 13 }}>Waiting to send</Text>
          </View>
          <Body text={w.body} names={names} />
        </View>
      ))}
      {canComment && (
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: -space.sm, marginHorizontal: -space.sm }}>
          <SmallAction icon="reply" label="Reply" onPress={onReply} />
          <SmallAction icon={thread.resolved ? "reopen" : "resolve"} label={thread.resolved ? "Reopen" : "Resolve"} onPress={onToggleResolved} />
        </View>
      )}
    </View>
  );
}

function Body({ text, names }: { text: string; names: string[] }) {
  const c = useColors();
  return (
    <Text selectable style={{ color: c.foreground, fontSize: 16, lineHeight: 23 }}>
      {splitMentions(text, names).map((part, i) =>
        part.mention ? (
          <Text key={i} style={{ color: c.emberInk, fontWeight: "500", backgroundColor: c.emberSoft }}>
            {part.text}
          </Text>
        ) : (
          part.text
        ),
      )}
    </Text>
  );
}

function SmallAction({ icon, label, onPress }: { icon: "reply" | "resolve" | "reopen"; label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: space.xs, minHeight: 44, paddingHorizontal: space.sm, opacity: pressed ? 0.5 : 1 })}
    >
      <Icon name={icon} size={16} color={c.mutedForeground} />
      <Text style={{ color: c.mutedForeground, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

function T2({ tone, style, ...props }: React.ComponentProps<typeof Text> & { tone?: "muted" }) {
  const c = useColors();
  return <Text {...props} style={[{ color: tone === "muted" ? c.mutedForeground : c.foreground, fontSize: 14 }, style]} />;
}
