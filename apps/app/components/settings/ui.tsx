import { Avatar, AvatarFallback, AvatarImage } from "@plotra/ui/components/avatar";
import { cn } from "@plotra/ui/lib/utils";

// Small building blocks shared by the settings sections.

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export function PersonAvatar({ name, image, className }: { name: string; image?: string | null; className?: string }) {
  return (
    <Avatar className={cn("size-6", className)}>
      {image && <AvatarImage src={image} alt="" />}
      <AvatarFallback className="bg-muted text-meta font-medium">{initials(name)}</AvatarFallback>
    </Avatar>
  );
}

export function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <h2 className="text-sm font-medium">{title}</h2>
          {description && <p className="mt-0.5 text-ui-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A bordered list of rows. */
export function List({ children, empty }: { children: React.ReactNode; empty?: string }) {
  const hasRows = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <ul className="divide-y rounded-lg border bg-card text-ui-sm">
      {hasRows ? children : <li className="px-3 py-6 text-center text-muted-foreground">{empty ?? "Nothing here yet."}</li>}
    </ul>
  );
}

export const textareaClass =
  "min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";
