import { buttonVariants } from "@plotra/ui/components/button";
import { cn } from "@plotra/ui/lib/utils";
import { Logo } from "@/components/logo";

// The page shown when something isn't there or went wrong: the 404s, the error
// boundaries and the rate-limit notice. Branded, calm, one or two ways on.
// Works without the app's providers (app/global-error.tsx uses it too).

export const primaryAction = cn(buttonVariants({ size: "default" }));
export const secondaryAction = cn(buttonVariants({ variant: "outline", size: "default" }));

export function StatusPage({
  title,
  children,
  actions,
  fill = true,
}: {
  title: string;
  children?: React.ReactNode;
  /** Buttons or links, the first being the obvious next step. */
  actions?: React.ReactNode;
  /** Centre in the whole screen; off inside a frame that already has a header. */
  fill?: boolean;
}) {
  // Inside a frame, the frame has the <main>.
  const Root = fill ? "main" : "div";
  return (
    <Root className={cn("flex flex-col items-center justify-center px-4 text-center", fill ? "min-h-dvh flex-1 py-16" : "py-16")}>
      {fill && <Logo className="mb-10 text-lg" />}
      <div className="w-full max-w-md">
        <h1 className="font-display text-3xl tracking-tight text-balance">{title}</h1>
        {children && <div className="mt-3 grid gap-2 text-sm text-pretty text-muted-foreground">{children}</div>}
        {actions && <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{actions}</div>}
      </div>
    </Root>
  );
}
