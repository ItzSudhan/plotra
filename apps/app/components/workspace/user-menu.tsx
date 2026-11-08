"use client";

import { signOut } from "@plotra/auth/client";
import { forgetKeptProjects } from "@/components/offline/keep-offline";
import { forgetPageCopies } from "@/components/offline/service-worker";
import { Icon } from "@plotra/icons";
import { Avatar, AvatarFallback, AvatarImage } from "@plotra/ui/components/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@plotra/ui/components/dropdown-menu";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { forget, identify } from "@/lib/posthog";
import { showNavPending } from "@/components/nav-feedback";
import { nav } from "@/components/transitions";
import { isLocalMode } from "@/lib/local-mode";
import { bugReportEmail, bugReportUrl } from "@/lib/bug-report";

// The project's GitHub Sponsors page (plan.md 8.4). Sponsoring buys nothing in the app.
const SPONSOR_URL = "https://github.com/sponsors/ItzSudhan";
// The community server, for questions and ideas.
const DISCORD_URL = "https://discord.gg/PxXr7Y4QrU";

type User = { id: string; name: string; email: string; image?: string | null };

/**
 * `onShortcuts` adds "Keyboard shortcuts" to the menu: only a project has a shortcuts sheet to open.
 * `onGettingStarted` adds "Getting started", for someone who closed that checklist and wants it back.
 */
export function UserMenu({
  user,
  onShortcuts,
  onGettingStarted,
  gettingStartedLabel = "Getting started",
}: {
  user: User;
  onShortcuts?: () => void;
  onGettingStarted?: () => void;
  /** The checklist's own name: a sample's try-out isn't called "Getting started". */
  gettingStartedLabel?: string;
}) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  // Every signed-in page shows this menu, so it is where analytics learns who is signed in.
  useEffect(() => {
    identify(user.id);
  }, [user.id]);
  const initials = user.name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  async function handleSignOut() {
    await signOut();
    forget();
    // What this browser kept of your pages, and which projects it keeps whole, go with you.
    await forgetPageCopies();
    forgetKeptProjects();
    router.push("/sign-in");
    router.refresh();
  }

  return (
    // Fetched as the menu opens, so "Your settings" opens on its skeleton at once.
    <DropdownMenu onOpenChange={(open) => open && router.prefetch("/settings")}>
      <DropdownMenuTrigger className="rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
        <Avatar className="size-7">
          {user.image && <AvatarImage src={user.image} alt="" />}
          <AvatarFallback className="bg-muted text-meta font-medium">{initials}</AvatarFallback>
        </Avatar>
        <span className="sr-only">Account menu</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="grid font-normal">
          <span className="truncate font-medium">{user.name}</span>
          <span className="truncate text-xs text-muted-foreground">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light">
            <Icon name="sun-2-linear" />
            Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Icon name="moon-linear" />
            Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Icon name="monitor-linear" />
            System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            showNavPending("/settings");
            router.push("/settings", { transitionTypes: nav.forward });
          }}
        >
          <Icon name="settings-linear" />
          Your settings
        </DropdownMenuItem>
        {onShortcuts && (
          <DropdownMenuItem onSelect={onShortcuts}>
            <Icon name="keyboard-linear" />
            Keyboard shortcuts
          </DropdownMenuItem>
        )}
        {onGettingStarted && (
          <DropdownMenuItem onSelect={onGettingStarted}>
            <Icon name="checklist-minimalistic-linear" />
            {gettingStartedLabel}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <a href={DISCORD_URL} target="_blank" rel="noreferrer">
            <Icon name="chat-round-dots-linear" />
            Join the Discord
          </a>
        </DropdownMenuItem>
        {/* GitHub asks for an account, so email and Discord are offered beside it. */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Icon name="danger-triangle-linear" />
            Report a bug
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56">
            <DropdownMenuItem asChild>
              <a href={bugReportEmail({ userAgent: navigator.userAgent, commit: process.env.PLOTRA_COMMIT, today: new Date() })}>
                <Icon name="letter-linear" />
                By email
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={DISCORD_URL} target="_blank" rel="noreferrer">
                <Icon name="chat-round-dots-linear" />
                On Discord
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                window.open(
                  bugReportUrl({ userAgent: navigator.userAgent, commit: process.env.PLOTRA_COMMIT, today: new Date() }),
                  "_blank",
                  "noopener,noreferrer",
                )
              }
            >
              <Icon name="code-linear" />
              On GitHub (needs an account)
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem asChild>
          <a href={SPONSOR_URL} target="_blank" rel="noreferrer">
            <Icon name="heart-linear" />
            Sponsor Plotra
          </a>
        </DropdownMenuItem>
        {/* Local mode's one person is always signed in (local-mode-plan.md). */}
        {!isLocalMode && (
          <DropdownMenuItem onSelect={handleSignOut}>
            <Icon name="logout-2-linear" />
            Sign out
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
