import { Icon } from "@plotra/icons";
import Link from "next/link";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { nav } from "@/components/transitions";
import { parseWorkspaceRole } from "@/lib/access/policy";
import { requireWorkspace } from "@/lib/data";
import { tabsFor } from "./tabs";

// The heading and tabs sit outside the tab being loaded, so a click on a tab
// shows at once and only the part under the tabs waits (./loading.tsx).
export default async function SettingsLayout({ children, params }: LayoutProps<"/w/[workspace]/settings">) {
  const { workspace: slug } = await params;
  const workspace = await requireWorkspace(slug);
  const tabs = tabsFor(parseWorkspaceRole(workspace.role));

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6">
      <div className="mb-6">
        <Link
          href={`/w/${workspace.slug}`}
          transitionTypes={nav.back}
          className="inline-flex items-center gap-1 text-ui-sm text-muted-foreground hover:text-foreground"
        >
          <Icon name="arrow-left-linear" className="size-3.5" />
          Projects
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Workspace settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          For everyone in {workspace.name}. Your own settings are under your picture, top right.
        </p>
      </div>

      <div className="grid gap-6">
        <SettingsTabs tabs={tabs.map((t) => ({ ...t, href: `/w/${workspace.slug}/settings${t.id === "general" ? "" : `?tab=${t.id}`}` }))} />
        {children}
      </div>
    </main>
  );
}
