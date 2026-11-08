"use client";

import { AnimatePresence, motion, useMotionValueEvent, useScroll, useSpring } from "motion/react";
import { useState } from "react";
import { Icon } from "@plotra/icons";
import { cn } from "@/lib/cn";
import { ease } from "@/lib/motion";
import { docsUrl, signInUrl, signUpUrl } from "@/lib/links";
import { Logo } from "./logo";
import { SiteLink } from "./site-link";

// Section links start with "/#" so they also work from the other pages
// (Pricing, the blog, Privacy, Terms, Refunds), where the sections don't exist.
const links = [
  { href: "/#prologue", label: "Story" },
  { href: "/#studio", label: "Studio" },
  { href: "/#worlds", label: "Worlds" },
  { href: "/pricing", label: "Pricing" },
  { href: "/blog", label: "Blog" },
  { href: docsUrl, label: "Docs" },
];

const sections = links.filter((l) => l.href.startsWith("/#"));

export function Nav() {
  const { scrollY, scrollYProgress } = useScroll();
  const read = useSpring(scrollYProgress, { stiffness: 140, damping: 28 });
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useMotionValueEvent(scrollY, "change", (v) => {
    const prev = scrollY.getPrevious() ?? 0;
    setScrolled(v > 24);
    // Tuck away while reading down the story, come back on the way up.
    setHidden(v > 400 && v > prev && !open);

    let current: string | null = null;
    for (const s of sections) {
      const el = document.querySelector(s.href.slice(1));
      if (el && el.getBoundingClientRect().top < window.innerHeight * 0.4) current = s.href;
    }
    setActive(current);
  });

  const highlight = hovered ?? active;

  return (
    <motion.header
      animate={{ y: hidden ? -80 : 0 }}
      transition={{ duration: 0.4, ease }}
      // Named so it holds still while the page under it changes (globals.css).
      style={{ viewTransitionName: "site-nav" }}
      className="fixed inset-x-0 top-0 z-50 flex justify-center px-3 pt-3"
    >
      <nav
        className={cn(
          "relative flex h-12 w-full max-w-5xl items-center justify-between rounded-full border pr-1.5 pl-4 transition-[background-color,border-color,box-shadow] duration-500",
          scrolled || open
            ? "border-black/[0.06] bg-white/75 shadow-[0_8px_30px_-12px_rgb(0_0_0/0.18)] backdrop-blur-xl"
            : "border-transparent bg-transparent",
        )}
      >
        {/* How far down the story the reader is. */}
        <span aria-hidden className="pointer-events-none absolute inset-x-6 -bottom-px h-px overflow-hidden">
          <motion.span
            style={{ scaleX: read }}
            className={cn("block h-full origin-left bg-ember transition-opacity duration-500", scrolled ? "opacity-100" : "opacity-0")}
          />
        </span>

        <SiteLink href="/" aria-label="Plotra home" className="text-black">
          <Logo className="gap-1.5 [&>span]:text-2xl [&>svg]:size-6 [&>svg]:transition-[rotate] [&>svg]:duration-500 [&>svg]:ease-out hover:[&>svg]:-rotate-12" />
        </SiteLink>

        <ul
          className="absolute left-1/2 hidden -translate-x-1/2 items-center md:flex"
          onPointerLeave={() => setHovered(null)}
        >
          {links.map((l) => (
            <li key={l.href}>
              <SiteLink
                href={l.href}
                onPointerEnter={() => setHovered(l.href)}
                className={cn(
                  "relative isolate block rounded-full px-3.5 py-1.5 text-[13px] transition-colors",
                  highlight === l.href || active === l.href ? "text-black" : "text-gray",
                )}
              >
                {highlight === l.href && (
                  <motion.span
                    layoutId="nav-pill"
                    transition={{ type: "spring", stiffness: 400, damping: 34 }}
                    className="absolute inset-0 -z-10 rounded-full bg-black/[0.05]"
                  />
                )}
                {l.label}
              </SiteLink>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-1">
          <a
            href={signInUrl}
            className="hidden rounded-full px-3 py-1.5 text-[13px] text-gray transition-colors hover:text-black sm:block"
          >
            Sign in
          </a>
          <a
            href={signUpUrl}
            className="group hidden h-9 items-center gap-1.5 rounded-full bg-black pr-3 pl-4 text-[13px] text-white transition-transform hover:scale-[1.03] active:scale-[0.97] sm:inline-flex"
          >
            Start writing
            <Icon name="arrow-right-linear" className="transition-transform group-hover:translate-x-0.5" />
          </a>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className="grid size-9 place-items-center rounded-full text-lg text-black hover:bg-black/5 md:hidden"
          >
            <Icon name={open ? "close-circle-linear" : "hamburger-menu-linear"} />
          </button>
        </div>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.25, ease }}
              className="absolute inset-x-0 top-[calc(100%+8px)] rounded-3xl border border-black/[0.06] bg-white/95 p-2 shadow-[0_20px_50px_-20px_rgb(0_0_0/0.25)] backdrop-blur-xl md:hidden"
            >
              {links.map((l) => (
                <SiteLink
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "block rounded-2xl px-4 py-3 text-[15px] hover:bg-black/5",
                    active === l.href ? "text-black" : "text-gray",
                  )}
                >
                  {l.label}
                </SiteLink>
              ))}
              <div className="mt-2 grid grid-cols-2 gap-2">
                <a
                  href={signInUrl}
                  className="rounded-2xl border border-black/10 px-4 py-3 text-center text-[15px] text-black"
                >
                  Sign in
                </a>
                <a href={signUpUrl} className="rounded-2xl bg-black px-4 py-3 text-center text-[15px] text-white">
                  Start writing
                </a>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>
    </motion.header>
  );
}
