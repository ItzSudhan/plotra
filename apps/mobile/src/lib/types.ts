// What the API returns (apps/app/lib/api/notes.ts, app/api/v1). Dates arrive as ISO strings.

export type NodeKind = "folder" | "chapter" | "scene" | "note" | "character" | "location" | "research" | "canvas" | "timeline" | "entity" | "dialogue";

export type Project = { id: string; slug: string; title: string; type: string; workspaceId: string; workspaceName: string | null; workspaceSlug: string | null; updatedAt: string };

export type Note = {
  id: string;
  parentId: string | null;
  kind: NodeKind;
  title: string;
  synopsis: string | null;
  tags: string[];
  aliases: string[];
  status: string | null;
  wordCount: number;
  updatedAt: string;
  canEdit: boolean;
  /** The release that reveals it, when tagged itself (lib/horizon.ts works out the rest). */
  revealReleaseId: string | null;
};

/** `revealed` comes back when asked "as of" a release: whether the audience knows the note then. */
export type NoteWithText = Note & { markdown: string | null; revealed?: boolean };

export type Hit = { id: string; title: string; kind: NodeKind; snippet: string };
export type ProjectHit = Hit & { projectId: string; projectTitle: string };

export type Release = { id: string; title: string; kind: string; date: string | null; position: string; nodeId: string | null };

export type CollabSeat = { token: string; role: "editor" | "commenter" | "viewer"; url: string; user: { name: string; color: string } };

export type Me = {
  user: { id: string; name: string; email: string; image: string | null };
  workspaces: { id: string; name: string; slug: string; role: string }[];
};

export type Notification = {
  id: string;
  type: string;
  projectId: string | null;
  nodeId: string | null;
  payload: { title?: string; decision?: string; stage?: string; role?: string; workspace?: string; chat?: boolean };
  readAt: string | null;
  createdAt: string;
  actorName: string | null;
  projectTitle: string | null;
};

export type Notifications = { items: Notification[]; unread: number };

/** What the API can make (apps/app/lib/api/notes.ts creatableKinds). */
export const creatableKinds = ["scene", "chapter", "note", "character", "location", "folder"] as const;
export type CreatableKind = (typeof creatableKinds)[number];

export type NewNote = { title: string; kind?: CreatableKind; parentId?: string | null; markdown?: string; tags?: string[]; synopsis?: string };
export type NotePatch = { title?: string; synopsis?: string | null; tags?: string[]; status?: string };
