import type { Metadata } from "next";
import { AiSection } from "@/components/settings/ai-section";
import { BillingSection } from "@/components/settings/billing-section";
import { GeneralSection } from "@/components/settings/general-section";
import { MembersSection } from "@/components/settings/members-section";
import { Swap } from "@/components/transitions";
import { parseWorkspaceRole } from "@/lib/access/policy";
import { listProjects, requireSession, requireWorkspace } from "@/lib/data";
import { getWorkspaceAi } from "@/lib/agent-actions";
import { confirmCheckout, getBilling } from "@/lib/billing/actions";
import { listInvitations, listMembers } from "@/lib/settings-actions";
import { type Tab, tabsFor } from "./tabs";

export const metadata: Metadata = { title: "Workspace settings" };

export default async function SettingsPage({ params, searchParams }: PageProps<"/w/[workspace]/settings">) {
  const [{ workspace: slug }, query] = await Promise.all([params, searchParams]);
  const [{ user }, workspace] = await Promise.all([requireSession(), requireWorkspace(slug)]);
  const role = parseWorkspaceRole(workspace.role);
  const tabs = tabsFor(role);
  const tab: Tab = tabs.find((t) => t.id === query.tab)?.id ?? tabs[0].id;
  // Back from Creem's checkout, which adds the checkout's id to the address it returns to.
  const checkoutId = tab === "billing" && typeof query.checkout_id === "string" ? query.checkout_id : null;

  return (
    <Swap id={tab}>
      <TabContent tab={tab} workspace={{ id: workspace.id, name: workspace.name, slug: workspace.slug }} me={{ userId: user.id, role }} checkoutId={checkoutId} />
    </Swap>
  );
}

/** Loads only what the open tab shows. */
async function TabContent({
  tab,
  workspace,
  me,
  checkoutId,
}: {
  tab: Tab;
  workspace: { id: string; name: string; slug: string };
  me: { userId: string; role: "owner" | "admin" | "member" };
  checkoutId: string | null;
}) {
  const slug = workspace.slug;
  switch (tab) {
    case "general": {
      const projects = await listProjects(workspace.id);
      return <GeneralSection workspace={{ name: workspace.name, slug }} role={me.role} projectCount={projects.length} />;
    }
    case "members": {
      const [members, invitations] = await Promise.all([listMembers(slug), me.role === "member" ? [] : listInvitations(slug)]);
      return <MembersSection workspaceSlug={slug} members={members} invitations={invitations} me={me} />;
    }
    case "ai": {
      const [ai, billing] = await Promise.all([getWorkspaceAi(slug), getBilling(slug)]);
      return <AiSection workspaceSlug={slug} ai={ai} hosted={billing?.hostedAi ? billing.plan : null} />;
    }
    case "billing": {
      // Asks Creem about the checkout itself, so Pro shows at once and not whenever the webhook lands.
      if (checkoutId) await confirmCheckout(slug, checkoutId);
      const billing = await getBilling(slug);
      return billing ? <BillingSection workspaceSlug={slug} billing={billing} /> : null;
    }
  }
}
