"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";
import { Icon, type IconName } from "@plotra/icons";
import { cn } from "@/lib/cn";
import { ease } from "@/lib/motion";
import { signUpUrl } from "@/lib/links";
import { Reveal } from "../reveal";

const periods = [
  { id: "monthly", label: "Monthly" },
  { id: "yearly", label: "Yearly" },
] as const;
type Period = (typeof periods)[number]["id"];

// What a reader weighing the price most wants to hear. Each is said in full in the questions below.
const promises: [IconName, string][] = [
  ["check-circle-linear", "No card needed to start"],
  ["history-linear", "Cancel any time"],
  ["check-circle-linear", "First payment refunded within 14 days"],
  ["shield-check-linear", "Going back to Free deletes nothing"],
  ["export-linear", "Export always works"],
];

function Items({ items, dark }: { items: string[]; dark?: boolean }) {
  return (
    <ul className="mt-6 flex-1 space-y-2.5 text-[14.5px]">
      {items.map((item, i) => (
        <motion.li
          key={item}
          initial={{ opacity: 0, x: -8 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease, delay: 0.25 + i * 0.05 }}
          className="flex gap-2.5"
        >
          <Icon name="check-circle-linear" className={cn("mt-0.5 shrink-0 text-base", dark ? "text-ember" : "text-gray")} />
          <span>{item}</span>
        </motion.li>
      ))}
    </ul>
  );
}

const card = "relative isolate flex h-full flex-col overflow-hidden rounded-[28px] border p-7 sm:p-9";
const label = "text-[11px] uppercase tracking-[0.2em] opacity-60";
const figure = "mt-5 font-display text-6xl lining-nums";
const button =
  "group/cta mt-8 inline-flex h-12 items-center justify-center gap-1.5 rounded-full px-6 text-[15px] transition-[scale] duration-200 ease-out hover:scale-[1.02] active:scale-[0.97]";

export function Plans({ free, pro }: { free: string[]; pro: string[] }) {
  const [period, setPeriod] = useState<Period>("monthly");
  const yearly = period === "yearly";
  const glow = useRef<HTMLDivElement>(null);

  return (
    <div className="mx-auto mt-12 max-w-4xl">
      <div className="flex justify-center">
        <div role="radiogroup" aria-label="Billing period" className="inline-flex rounded-full border border-hairline bg-canvas p-1">
          {periods.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={period === p.id}
              onClick={() => setPeriod(p.id)}
              className={cn(
                "relative isolate flex items-center gap-2 rounded-full px-4 py-1.5 text-[13px] transition-colors",
                period === p.id ? "text-black" : "text-gray hover:text-black",
              )}
            >
              {period === p.id && (
                <motion.span
                  layoutId="billing-pill"
                  transition={{ type: "spring", stiffness: 400, damping: 34 }}
                  className="absolute inset-0 -z-10 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.12)]"
                />
              )}
              {p.label}
              {p.id === "yearly" && (
                <span className="rounded-full bg-ember/10 px-1.5 py-0.5 text-[11px] leading-none font-medium text-ember">
                  save 20%
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Reveal>
          <section aria-labelledby="plan-free" className={cn(card, "border-hairline bg-white text-black")}>
            <h2 id="plan-free" className={label}>
              Free
            </h2>
            <p className={figure} style={{ lineHeight: 1, letterSpacing: "-0.03em" }}>
              $0
            </p>
            <p className="mt-3 min-h-10 text-[14px] leading-snug text-gray">No card needed.</p>
            <p className="mt-4 text-[15px] leading-relaxed text-fg/85">The whole app, for one writer or a small team.</p>
            <Items items={free} />
            <a href={signUpUrl} className={cn(button, "bg-black text-white")}>
              Start writing for free
              <Icon name="arrow-right-linear" className="transition-transform group-hover/cta:translate-x-0.5" />
            </a>
          </section>
        </Reveal>

        <Reveal delay={0.1}>
          <section
            aria-labelledby="plan-pro"
            className={cn(card, "group border-black bg-black text-white")}
            onPointerMove={(e) => {
              if (e.pointerType !== "mouse") return;
              const box = e.currentTarget.getBoundingClientRect();
              glow.current?.style.setProperty("--x", `${e.clientX - box.left}px`);
              glow.current?.style.setProperty("--y", `${e.clientY - box.top}px`);
            }}
          >
            {/* An ember light in the corner of the card, which follows the pointer once there is one. */}
            <div
              ref={glow}
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10 opacity-70 transition-opacity duration-500 group-hover:opacity-100"
              style={{
                background:
                  "radial-gradient(460px circle at var(--x, 85%) var(--y, 0%), rgb(226 96 42 / 0.34), transparent 65%)",
              }}
            />
            <h2 id="plan-pro" className={label}>
              Pro
            </h2>
            <p className={figure} style={{ lineHeight: 1, letterSpacing: "-0.03em" }}>
              $
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={period}
                  initial={{ opacity: 0, y: "45%", filter: "blur(8px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: "-45%", filter: "blur(8px)" }}
                  transition={{ duration: 0.45, ease }}
                  className="inline-block"
                >
                  {yearly ? 8 : 10}
                </motion.span>
              </AnimatePresence>{" "}
              <span className="font-sans text-[15px] tracking-normal opacity-70">a month, per workspace</span>
            </p>
            <p className="mt-3 min-h-10 text-[14px] leading-snug text-white/70">
              {yearly
                ? "Billed as $96 a year: 20% less than paying by the month."
                : "Or $96 a year, which is $8 a month: save 20%."}{" "}
              One price for the whole workspace, however many people are in it.
            </p>
            <p className="mt-4 text-[15px] leading-relaxed text-white/85">
              More room, more people, and an AI agent that works without anyone&apos;s own key.
            </p>
            <Items items={pro} dark />
            <a href={signUpUrl} className={cn(button, "bg-white text-black")}>
              Start free, upgrade when ready
              <Icon name="arrow-right-linear" className="transition-transform group-hover/cta:translate-x-0.5" />
            </a>
          </section>
        </Reveal>
      </div>

      <Reveal delay={0.15}>
        <ul className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-[13px] text-gray">
          {promises.map(([icon, text]) => (
            <li key={text} className="flex items-center gap-1.5">
              <Icon name={icon} className="text-[15px] text-ember" />
              {text}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-center text-[13px] text-gray">
          A workspace starts on Free. It is upgraded from Workspace settings, under Plan &amp; billing.
        </p>
      </Reveal>
    </div>
  );
}
