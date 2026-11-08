"use client";

import { DialogsHost } from "@plotra/ui/components/dialogs";
import { Toaster } from "@plotra/ui/components/sonner";
import { TooltipProvider } from "@plotra/ui/components/tooltip";
import { ThemeProvider } from "next-themes";
import { usePathname } from "next/navigation";
import { Motion } from "./motion";
import { NavFeedback } from "./nav-feedback";
import { ServiceWorker } from "./offline/service-worker";

// Set on plotra.ink's white page and its painted stories, which only work in light.
const lightOnly = ["/sign-in", "/sign-up"];

export function Providers({ children }: { children: React.ReactNode }) {
  const forcedTheme = lightOnly.includes(usePathname()) ? "light" : undefined;
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      forcedTheme={forcedTheme}
    >
      <TooltipProvider>
        <Motion />
        <ServiceWorker />
        <NavFeedback />
        {children}
        <DialogsHost />
        <Toaster position="bottom-right" />
      </TooltipProvider>
    </ThemeProvider>
  );
}
