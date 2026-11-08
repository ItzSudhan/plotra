import Image from "next/image";
import { cn } from "@/lib/cn";
import mark from "@/public/logo.png";

export function LogoMark({ className }: { className?: string }) {
  return <Image src={mark} alt="" aria-hidden className={cn("size-7", className)} />;
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <LogoMark />
      <span className="font-display text-3xl leading-none tracking-tight">Plotra</span>
    </span>
  );
}
