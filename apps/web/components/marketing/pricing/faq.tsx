"use client";

import { motion } from "motion/react";
import { useState, useSyncExternalStore } from "react";
import { Icon } from "@plotra/icons";
import { cn } from "@/lib/cn";
import { ease } from "@/lib/motion";

export type Question = { id: string; q: string; a: React.ReactNode };

function watchHash(notify: () => void) {
  window.addEventListener("hashchange", notify);
  return () => window.removeEventListener("hashchange", notify);
}

/**
 * The questions, one open at a time. The answers stay in the page when closed,
 * so they can be found and indexed, and a link to /pricing#credits opens the
 * question it points at.
 */
export function Faq({ items }: { items: Question[] }) {
  const hash = useSyncExternalStore(
    watchHash,
    () => window.location.hash.slice(1),
    () => "",
  );
  const [state, setState] = useState<{ hash: string; open: string | null }>({ hash: "", open: items[0].id });
  if (hash !== state.hash) {
    setState({ hash, open: items.some((i) => i.id === hash) ? hash : state.open });
  }

  return (
    <div className="mt-6 divide-y divide-hairline border-y border-hairline">
      {items.map(({ id, q, a }) => {
        const open = state.open === id;
        return (
          <div key={id} id={id} className="scroll-mt-28">
            <h3>
              <button
                type="button"
                aria-expanded={open}
                aria-controls={`${id}-answer`}
                onClick={() => setState((s) => ({ ...s, open: open ? null : id }))}
                className="group flex w-full items-center justify-between gap-6 py-5 text-left text-[17px] font-medium text-black"
              >
                <span className="transition-[translate] duration-300 ease-out group-hover:translate-x-1">{q}</span>
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-full border text-base transition-[rotate,background-color,border-color,color] duration-300 ease-out",
                    open ? "rotate-45 border-ember bg-ember text-white" : "border-hairline text-gray group-hover:border-black/25 group-hover:text-black",
                  )}
                >
                  <Icon name="add-linear" />
                </span>
              </button>
            </h3>
            <motion.div
              id={`${id}-answer`}
              role="region"
              aria-label={q}
              inert={!open}
              initial={false}
              animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
              transition={{ duration: 0.45, ease }}
              className="overflow-hidden"
            >
              <div className="max-w-2xl space-y-3 pb-6 text-[15.5px] leading-[1.7] text-fg/85 [&_a]:text-black [&_a]:underline [&_a]:underline-offset-4">
                {a}
              </div>
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}
