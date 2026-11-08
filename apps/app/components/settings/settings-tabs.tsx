"use client";

import { Icon, type IconName } from "@plotra/icons";
import { Pill } from "@plotra/ui/components/pill";
import { cn } from "@plotra/ui/lib/utils";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

/**
 * The tabs along the top of a workspace's settings, in their layout, so they
 * stay on screen while a tab loads. The highlight slides over to a tab as soon
 * as it's clicked, rather than once the tab has loaded, and the tab's contents
 * then cross over (components/transitions.tsx `Swap`).
 */
export function SettingsTabs({ tabs }: { tabs: Array<{ id: string; label: string; icon: IconName; href: string }> }) {
  const asked = useSearchParams().get("tab");
  const current = tabs.find((t) => t.id === asked)?.id ?? tabs[0].id;
  const [chosen, setChosen] = useState(current);
  // The tab that arrives wins, including one reached with the browser's back button.
  const [arrived, setArrived] = useState(current);
  if (current !== arrived) {
    setArrived(current);
    setChosen(current);
  }

  return (
    <nav aria-label="Settings" className="relative isolate flex flex-wrap gap-1 border-b pb-2">
      <Pill className="rounded-md bg-accent" />
      {tabs.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          aria-current={chosen === t.id ? "page" : undefined}
          onNavigate={() => setChosen(t.id)}
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-md px-2.5 text-ui-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 pointer-coarse:h-10",
            chosen === t.id && "text-foreground",
          )}
        >
          <Icon name={t.icon} className="size-4" />
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
