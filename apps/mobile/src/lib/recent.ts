import AsyncStorage from "@react-native-async-storage/async-storage";
import type { NodeKind } from "./types";

// Notes opened lately on this phone, for the top of Home.

export type Recent = { projectId: string; projectTitle: string; noteId: string; title: string; kind: NodeKind; at: number };

const KEY = "plotra.recent";
const MAX = 8;

export async function listRecent(): Promise<Recent[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Recent[]) : [];
  } catch {
    return [];
  }
}

export async function rememberRecent(entry: Omit<Recent, "at">): Promise<void> {
  const list = (await listRecent()).filter((r) => r.noteId !== entry.noteId);
  await AsyncStorage.setItem(KEY, JSON.stringify([{ ...entry, at: Date.now() }, ...list].slice(0, MAX))).catch(() => {});
}

export async function forgetRecent(noteId: string): Promise<void> {
  const list = (await listRecent()).filter((r) => r.noteId !== noteId);
  await AsyncStorage.setItem(KEY, JSON.stringify(list)).catch(() => {});
}
