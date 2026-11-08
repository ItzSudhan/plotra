import type { Client } from "./api";

// Sharing, project settings, your account and new projects, through
// /api/mobile/share and /api/mobile/settings/* (the server wraps the web's own
// actions: apps/app/lib/share-actions.ts, project-actions.ts,
// account-actions.ts, notify-actions.ts, new-project.ts, starter-actions.ts).

// ── Sharing ─────────────────────────────────────────────────────────────────

export type ProjectRole = "viewer" | "commenter" | "editor";
export type WorkspaceRole = "owner" | "admin" | "member";

/** The web's words for each role (apps/app/lib/access/policy.ts projectRoleMeta). */
export const roleMeta: Record<ProjectRole, { label: string; description: string; sentence: string }> = {
  viewer: { label: "Viewer", description: "Can read.", sentence: "can now read" },
  commenter: { label: "Commenter", description: "Can read and comment.", sentence: "can now read and comment" },
  editor: { label: "Editor", description: "Can read, comment and edit.", sentence: "can now edit" },
};
export const projectRoles = ["viewer", "commenter", "editor"] as const;

export const workspaceRoleLabel: Record<WorkspaceRole, string> = { owner: "Owner", admin: "Admin", member: "Member" };

export type SharedWith = { id: string; userId: string | null; email: string; name: string | null; image: string | null; role: ProjectRole; pending: boolean; isMember: boolean };
export type Sharing = {
  workspace: { name: string; slug: string };
  members: { userId: string; name: string; email: string; image: string | null; role: WorkspaceRole }[];
  shared: SharedWith[];
};
export type ShareLink = { id: string; name: string | null; enabled: boolean; token: string; path: string; allowCopy: boolean; horizonReleaseId: string | null; canonOnly: boolean; listed: boolean };

const share = "/api/mobile/share";
const q = (params: Record<string, string>) => `?${new URLSearchParams(params)}`;

export const getSharing = (client: Client, projectId: string) => client.request<{ sharing: Sharing; links: ShareLink[] }>(share + q({ project: projectId }));

const act = <T = { ok: true }>(client: Client, projectId: string, action: string, input: Record<string, unknown> = {}) =>
  client.request<T>(share, { method: "POST", body: { project: projectId, action, ...input } });

export const shareProject = (client: Client, projectId: string, email: string, role: ProjectRole) => act<{ ok: true; pending: boolean }>(client, projectId, "share", { email, role });
export const setRole = (client: Client, projectId: string, memberId: string, role: ProjectRole) => act(client, projectId, "role", { memberId, role });
export const removeShare = (client: Client, projectId: string, memberId: string) => act(client, projectId, "remove", { memberId });
export const createLink = (client: Client, projectId: string, name: string | null = null) => act<{ link: ShareLink }>(client, projectId, "link-create", { name }).then((r) => r.link);
export const updateLink = (client: Client, projectId: string, linkId: string, patch: { enabled?: boolean; horizonReleaseId?: string | null }) =>
  act<{ link: ShareLink }>(client, projectId, "link-update", { linkId, ...patch }).then((r) => r.link);
export const resetLink = (client: Client, projectId: string, linkId: string) => act<{ link: ShareLink }>(client, projectId, "link-reset", { linkId }).then((r) => r.link);
export const deleteLink = (client: Client, projectId: string, linkId: string) => act(client, projectId, "link-delete", { linkId });

// ── Workspace members ───────────────────────────────────────────────────────

export type Member = { memberId: string; userId: string; name: string; email: string; image: string | null; role: WorkspaceRole; joinedAt: string };
export type Invitation = { id: string; email: string; role: string; expiresAt: string; createdAt: string; inviterName: string | null; path: string };

/** `invitations` is null for anyone who isn't an owner or admin. */
export const getMembers = (client: Client, workspaceSlug: string) =>
  client.request<{ members: Member[]; invitations: Invitation[] | null }>(`/api/mobile/settings/workspace${q({ workspace: workspaceSlug })}`);

/** The web's member changes (apps/app/lib/settings-actions.ts): owners and admins, except leaving. */
const memberAction = (client: Client, workspaceSlug: string, body: Record<string, string>) =>
  client.request<{ ok: true }>(`/api/mobile/settings/workspace${q({ workspace: workspaceSlug })}`, { method: "POST", body });

/** Invites someone, or sends their invitation again. */
export const inviteMember = (client: Client, workspaceSlug: string, email: string, role: "member" | "admin") => memberAction(client, workspaceSlug, { action: "invite", email, role });
export const changeMemberRole = (client: Client, workspaceSlug: string, memberId: string, role: WorkspaceRole) => memberAction(client, workspaceSlug, { action: "role", memberId, role });
export const removeMember = (client: Client, workspaceSlug: string, memberId: string) => memberAction(client, workspaceSlug, { action: "remove", memberId });
export const cancelInvitation = (client: Client, workspaceSlug: string, invitationId: string) => memberAction(client, workspaceSlug, { action: "cancel", invitationId });
export const leaveWorkspace = (client: Client, workspaceSlug: string) => memberAction(client, workspaceSlug, { action: "leave" });

// ── Project settings ────────────────────────────────────────────────────────

export type ProjectSettingsView = {
  title: string;
  description: string | null;
  type: string;
  worldId: string | null;
  format: string;
  autoVersionMinutes: number;
  template: boolean;
  canManage: boolean;
  modules: { id: string; label: string; description: string; on: boolean; byDefault: boolean }[];
  types: { id: string; label: string }[];
  formats: { id: string; label: string; description: string }[];
  worlds: { id: string; title: string; type: string }[];
};

export type ProjectSettingsPatch = {
  title?: string;
  description?: string | null;
  type?: string;
  worldId?: string | null;
  format?: string;
  autoVersionMinutes?: number;
  template?: boolean;
  /** null puts a tool back to the type's default. */
  modules?: Record<string, boolean | null>;
};

const projectSettings = "/api/mobile/settings/project";
export const getProjectSettings = (client: Client, projectId: string) => client.request<ProjectSettingsView>(projectSettings + q({ project: projectId }));
export const updateProjectSettings = (client: Client, projectId: string, patch: ProjectSettingsPatch) =>
  client.request<{ ok: true }>(projectSettings, { method: "PATCH", body: { project: projectId, ...patch } });
export const deleteProject = (client: Client, projectId: string, typedTitle: string) =>
  client.request<{ ok: true }>(projectSettings, { method: "DELETE", body: { project: projectId, title: typedTitle } });

// ── Your account ────────────────────────────────────────────────────────────

export type EmailPreference = "off" | "each" | "daily";
export type AccountView = { name: string; email: string; image: string | null; photoUploads: boolean; ownPhoto: boolean; emailNotifications: EmailPreference };

/** The web's words (apps/app/components/settings/notification-settings.tsx). */
export const emailChoices: { value: EmailPreference; label: string; description: string }[] = [
  { value: "daily", label: "A daily digest", description: "One email a day listing what you haven't read. Nothing is sent on a day with nothing new." },
  { value: "each", label: "Each one", description: "An email when it happens, up to twelve an hour. Anything past that waits for the next day's digest." },
  { value: "off", label: "Off", description: "No notification emails. Invitations and sharing emails still arrive, since they carry the link you need." },
];

const account = "/api/mobile/settings/account";
export const getAccount = (client: Client) => client.request<AccountView>(account);
export const updateAccount = (client: Client, patch: { name?: string; emailNotifications?: EmailPreference }) => client.request<AccountView>(account, { method: "PATCH", body: patch });
export const uploadPhoto = (client: Client, base64: string) => client.request<{ image: string }>(`${account}/photo`, { method: "POST", body: { photo: base64 } });
export const removePhoto = (client: Client) => client.request<{ ok: true }>(`${account}/photo`, { method: "DELETE" });

// ── New projects ────────────────────────────────────────────────────────────

export type Starter = { id: string; audience: string; type: string; label: string; description: string };
export type NewProjectChoices = { types: { id: string; label: string }[]; audiences: { id: string; label: string }[]; starters: Starter[] };

const newProject = "/api/mobile/settings/new-project";
export const getNewProjectChoices = (client: Client) => client.request<NewProjectChoices>(newProject);
export const createProject = (client: Client, input: { workspace: string; title: string; type: string; starter?: string | null }) =>
  client.request<{ projectId: string; noteId: string | null }>(newProject, { method: "POST", body: input });

/** Cache keys for these screens (lib/cache.ts useResource). */
export const settingsKeys = {
  sharing: (projectId: string) => `sharing:${projectId}`,
  members: (workspaceSlug: string) => `members:${workspaceSlug}`,
  projectSettings: (projectId: string) => `project-settings:${projectId}`,
  account: "account-settings",
  newProject: "new-project-choices",
};

/** An address on the server as a full link: photos and public links come back as paths. */
export const absolute = (server: string, path: string) => (path.startsWith("/") ? server + path : path);
