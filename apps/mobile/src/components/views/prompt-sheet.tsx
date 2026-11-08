import { useState, type ReactNode } from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/ui";
import { isOffline } from "@/lib/api";
import { radius, space, useColors } from "@/lib/theme";

// A sheet from the bottom that asks for some text: a thread's name, a plot
// grid cell, a story date. Android has no Alert.prompt, and iOS's is one line.

export type Prompt = {
  title: string;
  message?: string;
  label: string;
  value?: string;
  placeholder?: string;
  multiline?: boolean;
  confirmLabel?: string;
  /** Returns what's wrong with the text, or null when it's fine. */
  validate?: (text: string) => string | null;
  onSubmit: (text: string) => void | Promise<void>;
  /** A second, quieter action (e.g. "Take the scene out of this thread"). */
  extra?: { label: string; destructive?: boolean; onPress: () => void | Promise<void> };
  children?: ReactNode;
};

export function PromptSheet({ prompt, onClose }: { prompt: Prompt | null; onClose: () => void }) {
  return (
    <Modal visible={!!prompt} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      {prompt && <Sheet key={prompt.title + (prompt.value ?? "")} prompt={prompt} onClose={onClose} />}
    </Modal>
  );
}

function Sheet({ prompt, onClose }: { prompt: Prompt; onClose: () => void }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState(prompt.value ?? "");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const run = async (fn: () => void | Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      onClose();
    } catch (e) {
      // The sheet stays open with what was typed, so nothing is lost.
      Alert.alert("That didn't save", isOffline(e) ? "You're offline. Try again when you're back online." : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    const wrong = prompt.validate?.(text) ?? null;
    setProblem(wrong);
    if (!wrong) void run(() => prompt.onSubmit(text));
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <Pressable accessibilityLabel="Close" onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)" }} />
      <View style={{ backgroundColor: c.card, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingBottom: insets.bottom + space.md, maxHeight: "85%" }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.xl, gap: space.md }}>
          <Text accessibilityRole="header" style={{ color: c.foreground, fontSize: 18, fontWeight: "600" }}>
            {prompt.title}
          </Text>
          {!!prompt.message && <Text style={{ color: c.mutedForeground, fontSize: 14, lineHeight: 20 }}>{prompt.message}</Text>}
          <TextInput
            value={text}
            onChangeText={setText}
            autoFocus
            accessibilityLabel={prompt.label}
            placeholder={prompt.placeholder}
            placeholderTextColor={c.mutedForeground}
            multiline={prompt.multiline}
            onSubmitEditing={prompt.multiline ? undefined : submit}
            returnKeyType={prompt.multiline ? "default" : "done"}
            style={{
              minHeight: prompt.multiline ? 120 : 48,
              textAlignVertical: prompt.multiline ? "top" : "center",
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: problem ? c.destructive : c.border,
              backgroundColor: c.background,
              color: c.foreground,
              paddingHorizontal: space.md,
              paddingVertical: space.md,
              fontSize: 16,
            }}
          />
          {!!problem && <Text style={{ color: c.destructive, fontSize: 13 }}>{problem}</Text>}
          {prompt.children}
          <Button label={prompt.confirmLabel ?? "Save"} busy={busy} onPress={submit} />
          {prompt.extra && <Button label={prompt.extra.label} variant={prompt.extra.destructive ? "destructive" : "secondary"} disabled={busy} onPress={() => void run(prompt.extra!.onPress)} />}
          <Button label="Cancel" variant="ghost" disabled={busy} onPress={onClose} />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}
