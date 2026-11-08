import Link from "next/link";
import { Logo } from "@/components/logo";
import { SignInLink } from "@/components/plugins/sign-in-link";
import { nav } from "@/components/transitions";
import { UserMenu } from "@/components/workspace/user-menu";
import { getSession } from "@/lib/data";

// The plugin store (plugin-store-plan.md): open to browse without an account,
// like the gallery of worlds; installing asks to sign in.
export default async function PluginStoreLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 flex h-12 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur">
        <Link href="/" transitionTypes={nav.back} aria-label="Plotra home" className="px-1">
          <Logo />
        </Link>
        <Link href="/plugins" className="ml-2 text-ui-sm text-muted-foreground hover:text-foreground">
          Plugins
        </Link>
        <div className="ml-auto">
          {session ? (
            <UserMenu user={session.user} />
          ) : (
            <SignInLink className="text-ui-sm font-medium text-ember-ink underline-offset-4 hover:underline" />
          )}
        </div>
      </header>
      {children}
    </div>
  );
}
