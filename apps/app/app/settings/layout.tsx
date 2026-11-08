import Link from "next/link";
import { Logo } from "@/components/logo";
import { nav } from "@/components/transitions";
import { UserMenu } from "@/components/workspace/user-menu";
import { requireSession } from "@/lib/data";

// A person's own settings, which follow them across workspaces (the workspace's
// settings are under /w/<workspace>/settings).
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireSession();

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 flex h-12 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur">
        <Link href="/" transitionTypes={nav.back} aria-label="Plotra home" className="px-1">
          <Logo />
        </Link>
        <div className="ml-auto">
          <UserMenu user={user} />
        </div>
      </header>
      {children}
    </div>
  );
}
