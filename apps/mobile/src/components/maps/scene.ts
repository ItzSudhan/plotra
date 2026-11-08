// What the phone's screens hand the map canvas (map-canvas.tsx, which runs in a
// web view) to draw: plain data only, as it crosses a bridge.

export type SceneNode = {
  id: string;
  /** Top-left, in the scene's units. Ignored when the canvas lays the scene out itself. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** `dot`: a graph note, its label beside it. `pill`: a person. `card`: a board card, with its text inside. */
  shape: "dot" | "pill" | "card" | "group";
  label: string;
  /** A second line (a pill), or the text inside a card. */
  body?: string;
  color: string;
  /** Faded: under a spoiler horizon, or not around the note in focus. */
  dim?: boolean;
  /** Can be dragged about while moving is on. */
  movable?: boolean;
  /** Read out by a screen reader. */
  description?: string;
};

export type SceneEdge = {
  id: string;
  from: string;
  to: string;
  color: string;
  width: number;
  dashed?: boolean;
  arrow?: boolean;
  label?: string;
  /** `elbow`: down then across, for parents in the family tree. */
  route?: "straight" | "elbow" | "curve";
};

export type SceneTheme = {
  background: string;
  foreground: string;
  muted: string;
  mutedForeground: string;
  card: string;
  border: string;
  ember: string;
  dark: boolean;
};
