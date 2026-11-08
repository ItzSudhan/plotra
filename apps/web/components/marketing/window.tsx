import { cn } from "@/lib/cn";

export function Window({
  title,
  children,
  className,
  right,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  right?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-line-strong bg-card shadow-[0_30px_80px_-30px_rgb(0_0_0/0.22),0_2px_6px_-2px_rgb(0_0_0/0.06)]",
        className,
      )}
    >
      <div className="flex h-10 items-center gap-3 border-b border-line bg-well/80 px-4">
        <div className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-fg/10" />
          <span className="size-2.5 rounded-full bg-fg/10" />
          <span className="size-2.5 rounded-full bg-fg/10" />
        </div>
        <p className="flex-1 truncate text-center font-mono text-[11px] text-faint">{title}</p>
        <div className="flex min-w-14 justify-end">{right}</div>
      </div>
      {children}
    </div>
  );
}
