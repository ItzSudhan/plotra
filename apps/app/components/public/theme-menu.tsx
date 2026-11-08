"use client";

import { Icon } from "@plotra/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@plotra/ui/components/dropdown-menu";
import { useTheme } from "next-themes";

// Light, dark or the device's own, for a reader of a public link, who has no
// account menu to pick it from. The same choice as the workspace's (kept on
// this device by next-themes), so it carries over if they sign up.
export function ThemeMenu() {
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Theme"
        title="Theme"
        className="grid size-10 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none md:size-8"
      >
        {/* Chosen by CSS, not by `theme`, which the server doesn't know: no flash of the wrong icon. */}
        <Icon name="sun-2-linear" className="size-5 dark:hidden md:size-4" />
        <Icon name="moon-linear" className="hidden size-5 dark:block md:size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
