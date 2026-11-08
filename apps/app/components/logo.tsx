import Image from "next/image";
import { cn } from "@plotra/ui/lib/utils";
import mark from "@/public/logo.png";

export function LogoMark({ className }: { className?: string }) {
  return <Image src={mark} alt="" aria-hidden className={cn("size-6", className)} />;
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <LogoMark />
      <span className="font-display text-[1.45em] leading-none tracking-tight">Plotra</span>
    </span>
  );
}
