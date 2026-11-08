import Link from "next/link";
import { Logo } from "@/components/logo";
import { nav } from "@/components/transitions";
import { UserMenu } from "@/components/workspace/user-menu";
import { WorkspaceSwitcher } from "@/components/workspace/workspace-switcher";
import { listWorkspaces, requireSession, requireWorkspace } from "@/lib/data";

export default async function WorkspaceHomeLayout({ children, params }: LayoutProps<"/w/[workspace]">) {
  const { workspace: slug } = await params;
  const [{ user }, workspaces, current] = await Promise.all([
    requireSession(),
    listWorkspaces(),
    requireWorkspace(slug),
  ]);

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 flex h-12 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur">
        <Link href="/" transitionTypes={nav.back} aria-label="Plotra home" className="px-1">
          <Logo className="[&>span:last-child]:hidden sm:[&>span:last-child]:inline" />
        </Link>
        <span className="text-faint">/</span>
        <WorkspaceSwitcher workspaces={workspaces} current={current} />
        <div className="ml-auto">
          <UserMenu user={user} />
        </div>
      </header>
      {children}
    </div>
  );
}
