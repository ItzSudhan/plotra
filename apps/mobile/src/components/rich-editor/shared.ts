// What the phone's screens and its editor (note-editor.tsx, which runs in a
// web view) say to each other. Plain data only: it crosses a bridge.

export type EditorTheme = {
  foreground: string;
  background: string;
  muted: string;
  mutedForeground: string;
  border: string;
  ember: string;
  emberInk: string;
  emberSoft: string;
  highlight: string;
  teal: string;
  destructive: string;
  fontSize: number;
  lineHeight: number;
  dark: boolean;
};

export type Seat = { token: string; role: "editor" | "commenter" | "viewer"; url: string; user: { name: string; color: string } };

export type SyncState = "connecting" | "synced" | "offline";

/** What the editor tells the screen as things change: for the toolbar, the status line and leaving safely. */
export type EditorStatus = {
  sync: SyncState;
  /** Whether typing changes the note: false for viewers, and until there's a copy to write in. */
  editable: boolean;
  role: Seat["role"] | null;
  words: number;
  /** Other people in the note right now. */
  peers: string[];
  /** Marks on at the cursor: bold, italic, … */
  marks: string[];
  /** The block type at the cursor: p, h1, blockquote, a script element… */
  block: string;
  list: string | null;
  /** The note is a script: offer the script elements. */
  script: boolean;
  /** Changes made here that the server hasn't confirmed yet. */
  unsent: boolean;
};

/** Which release the editor shows as of: passages tagged for a later one are dimmed. */
export type EditorHorizon = { limit: number; order: Record<string, number> } | null;

export type EditorCommand =
  | { type: "mark"; mark: "bold" | "italic" | "underline" | "strikethrough" | "code" | "highlight" }
  | { type: "block"; block: string }
  | { type: "list"; style: "disc" | "decimal" | "todo" }
  | { type: "hr" }
  | { type: "wikilink"; nodeId: string }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "blur" };

/** Script elements (apps/app/lib/script.ts), with what the phone calls them. */
export const scriptElements: { type: string; label: string }[] = [
  { type: "scene_heading", label: "Scene heading" },
  { type: "action", label: "Action" },
  { type: "character", label: "Character" },
  { type: "parenthetical", label: "Parenthetical" },
  { type: "dialogue", label: "Dialogue" },
  { type: "transition", label: "Transition" },
  { type: "shot", label: "Shot" },
  { type: "act_heading", label: "Act heading" },
  { type: "comic_page", label: "Page" },
  { type: "comic_panel", label: "Panel" },
  { type: "comic_caption", label: "Caption" },
  { type: "sfx", label: "Sound effect" },
  { type: "music_cue", label: "Music cue" },
];

export const scriptTypes = new Set(scriptElements.map((e) => e.type));

/** The collab server's room for a note (apps/app/lib/collab/rooms.ts). */
export const noteRoom = (noteId: string) => `node-${noteId}`;
