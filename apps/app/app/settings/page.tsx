import { Icon } from "@plotra/icons";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AccountSection } from "@/components/settings/account-section";
import { ApiTokens } from "@/components/settings/api-tokens";
import { PluginsSettings } from "@/components/settings/plugins-settings";
import { AiSettings } from "@/components/settings/ai-settings";
import { MotionSettings } from "@/components/settings/motion-settings";
import { NotificationSettings } from "@/components/settings/notification-settings";
import { SettingsSectionSkeleton } from "@/components/skeletons";
import { nav } from "@/components/transitions";
import { aiRemoved } from "@/lib/agent/no-ai";
import { getAiSettingsView } from "@/lib/agent/settings";
import { listApiTokens, listConnectedApps } from "@/lib/api/token-actions";
import { listPlugins } from "@/lib/plugin-actions";
import { getUserPrefs } from "@/lib/notify-actions";
import { getAccount } from "@/lib/account-actions";
import { readOnly } from "@/lib/request-cache";
import { isLocalMode } from "@/lib/local-mode";

export const metadata: Metadata = { title: "Your settings" };

// A person's own settings: their profile and how they sign in
// (lib/account-actions.ts), how notifications reach them (plan.md 2.6), whether
// the interface animates (lib/motion.ts), and their AI model (plan.md 2.11
// "Whose model"). The page gets only what may be shown: never the key, only
// its last four characters. API tokens are listed by name and first characters
// only, under "Advanced", away from everyday choices. Plugins (lib/plugins.ts)
// are listed without their code.
export default function SettingsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
      <div className="mb-8">
        <Link href="/" transitionTypes={nav.back} className="inline-flex items-center gap-1 text-ui-sm text-muted-foreground hover:text-foreground">
          <Icon name="arrow-left-linear" className="size-3.5" />
          Back
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Your settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">These are yours alone, in every workspace you belong to.</p>
      </div>
      {/* Each section shows as soon as its own data is in; the others wait as skeletons. */}
      <div className="grid gap-10">
        <Suspense fallback={<SettingsSectionSkeleton rows={3} />}>
          <Account />
        </Suspense>
        <Suspense fallback={<SettingsSectionSkeleton rows={isLocalMode ? 1 : 3} />}>
          <Preferences />
        </Suspense>
        {/* Whoever runs the server may have taken AI out altogether (lib/agent/no-ai.ts): then there's no model to choose. */}
        {!aiRemoved() && (
          <Suspense fallback={<SettingsSectionSkeleton />}>
            <Ai />
          </Suspense>
        )}
        <Suspense fallback={<SettingsSectionSkeleton />}>
          <Plugins />
        </Suspense>
        <details className="group rounded-lg border">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
            <Icon name="alt-arrow-right-linear" className="size-4 text-muted-foreground transition-transform group-open:rotate-90" />
            Advanced: for scripts and AI assistants
            <span className="ml-auto text-ui-sm font-normal text-muted-foreground">API tokens and MCP</span>
          </summary>
          <div className="border-t p-4">
            <Suspense fallback={<SettingsSectionSkeleton />}>
              <Tokens />
            </Suspense>
          </div>
        </details>
      </div>
    </main>
  );
}

async function Account() {
  return <AccountSection account={await readOnly(getAccount)} />;
}

async function Preferences() {
  const prefs = await readOnly(getUserPrefs);
  return (
    <>
      {/* Local mode sends no email. */}
      {!isLocalMode && <NotificationSettings prefs={prefs} />}
      <MotionSettings on={prefs.shell.motion !== false} />
    </>
  );
}

async function Ai() {
  return <AiSettings view={await readOnly(getAiSettingsView)} />;
}

async function Plugins() {
  return <PluginsSettings plugins={await readOnly(listPlugins)} />;
}

async function Tokens() {
  const [tokens, apps] = await readOnly(() => Promise.all([listApiTokens(), listConnectedApps()]));
  return <ApiTokens tokens={tokens} apps={apps} />;
}
