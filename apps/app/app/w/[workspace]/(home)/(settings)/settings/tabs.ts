import type { IconName } from "@plotra/icons";
import type { WorkspaceRole } from "@/lib/access/policy";
import { billingEnabled } from "@/lib/billing/creem";
import { isLocalMode } from "@/lib/local-mode";

const allTabs = [
  { id: "general", label: "General", icon: "settings-linear" },
  { id: "members", label: "Members & invites", icon: "user-rounded-linear" },
  { id: "ai", label: "AI", icon: "magic-stick-3-linear" },
  { id: "billing", label: "Plan & billing", icon: "bill-list-linear" },
] as const satisfies ReadonlyArray<{ id: string; label: string; icon: IconName }>;

export type Tab = (typeof allTabs)[number]["id"];

/**
 * The tabs this person sees. No plans where billing is off (a self-hosted
 * Plotra). No members in local mode, which has one person. Members (the role)
 * see General and who they write with, read-only; the rest is for owners and admins.
 */
export function tabsFor(role: WorkspaceRole) {
  return allTabs.filter(
    (t) => (t.id !== "billing" || billingEnabled()) && (t.id !== "members" || !isLocalMode) && (role !== "member" || t.id === "general" || t.id === "members"),
  );
}
