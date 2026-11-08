import AsyncStorage from "@react-native-async-storage/async-storage";

// What's being typed in the editor, saved on the phone as it's typed, so a
// crash, a call or a dead battery loses nothing. `base` is the text the edit
// started from, to tell whether someone changed the note meanwhile.

export type Draft = { base: string; text: string; title: string; savedAt: number };

const key = (noteId: string) => `draft:${noteId}`;

export async function readDraft(noteId: string): Promise<Draft | null> {
  try {
    const raw = await AsyncStorage.getItem(key(noteId));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

export const writeDraft = (noteId: string, draft: Draft) => AsyncStorage.setItem(key(noteId), JSON.stringify(draft)).catch(() => {});
export const clearDraft = (noteId: string) => AsyncStorage.removeItem(key(noteId)).catch(() => {});
