"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";
import { Icon, type IconName } from "@plotra/icons";
import { cn } from "@/lib/cn";
import { ease } from "@/lib/motion";
import { Reveal } from "./reveal";
import { useSteps } from "./use-steps";

// The story's world bible under a spoiler horizon (plan.md 2.8), drawn
// the way the editor draws it: a tagged passage keeps its place on the page and
// is veiled, not removed, until the release that reveals it is on the shelf.

const releases = [
  { title: "Part 1: The Masque", spine: "The Masque", height: 184 },
  { title: "Part 2: The Vow", spine: "The Vow", height: 168 },
  { title: "Part 3: The Tomb", spine: "The Tomb", height: 176 },
];
/** Past the last release: no horizon at all, which is also when a passage tagged "never" shows. */
const WHOLE = releases.length;

function Link({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-medium text-ember underline decoration-ember/35 decoration-dotted underline-offset-4">{children}</span>
  );
}

type Passage = { text: React.ReactNode; reveal?: number };
const notes: { title: string; kind: string; icon: IconName; color: string; reveal?: number; canon?: string; passages: Passage[] }[] = [
  {
    title: "Romeo Montague",
    kind: "Character",
    icon: "user-rounded-linear",
    color: "text-rose",
    passages: [
      {
        text: (
          <>
            Only son of <Link>Lord Montague</Link>. Quick to love and quicker to despair. Was sick over Rosaline until
            the Capulet feast.
          </>
        ),
      },
      {
        reveal: 1,
        text: (
          <>
            Husband of <Link>Juliet</Link>. Kills <Link>Tybalt</Link> an hour after the wedding, and is banished to
            Mantua.
          </>
        ),
      },
    ],
  },
  {
    title: "The Capulet Tomb",
    kind: "Location",
    icon: "map-point-linear",
    color: "text-teal",
    passages: [
      {
        text: (
          <>
            The family vault by the churchyard, opened only for a burial. Every Capulet ends up here, and so will{" "}
            <Link>Tybalt</Link>.
          </>
        ),
      },
      {
        reveal: WHOLE,
        text: "Working note: decide before Part Three how Romeo gets past the watch, and whether Paris should be at the tomb at all.",
      },
    ],
  },
  {
    title: "Juliet Capulet",
    kind: "Character",
    icon: "user-rounded-linear",
    color: "text-rose",
    passages: [
      {
        text: (
          <>
            Not yet fourteen. Only daughter of the Capulets, raised by <Link>the Nurse</Link> and promised to Count
            Paris.
          </>
        ),
      },
      {
        reveal: 1,
        text: (
          <>
            Wife of <Link>Romeo</Link>. Only the Friar and the Nurse know.
          </>
        ),
      },
    ],
  },
  {
    title: "Juliet is only sleeping",
    kind: "Secret",
    icon: "document-text-linear",
    color: "text-sky",
    reveal: 2,
    canon: "Canon",
    passages: [
      {
        text: "She isn't dead. The Friar's potion only looks like death, for two and forty hours, and the letter telling Romeo so never reaches Mantua.",
      },
    ],
  },
];
const tagged = notes.flatMap((n) => [n.reveal, ...n.passages.map((p) => p.reveal)]).filter((r) => r !== undefined);

const chip = "flex h-[18px] items-center gap-1 rounded bg-well-strong px-1.5 font-sans text-[10px] font-medium tracking-wide whitespace-nowrap text-muted";
const veil = "transition-[filter,opacity] duration-700";
const veiled = "opacity-40 blur-[3px]";

function RevealChip({ reveal }: { reveal: number }) {
  return (
    <span className={chip}>
      <Icon name={reveal === WHOLE ? "eye-closed-linear" : "rocket-linear"} className="size-3" />
      {reveal === WHOLE ? "Never revealed" : releases[reveal].title}
    </span>
  );
}

const worldFeatures: [IconName, string, string][] = [
  ["book-bookmark-linear", "World bible", "Your own entry types and fields, for characters, places, factions, magic systems, anything."],
  ["star-shine-linear", "Canon status", "Canon, draft, speculative, retconned or non-canon. A retcon asks for the reason and keeps the old text."],
  ["eye-closed-linear", "Who knows what", "Which character knows which secret, and from which scene. What is true, told, or only believed."],
  ["danger-triangle-linear", "Continuity checks", "Plain rules, no AI: someone appears after their death, is in two places at once, or knows a thing too soon."],
];

// The horizon walks the shelf on its own, then lifts, until someone sets it themselves.
const turns = [2800, 2800, 2800, 3200] as const;

export function SpoilerHorizon() {
  const ref = useRef<HTMLDivElement>(null);
  const { step } = useSteps(ref, turns, 1);
  const [set, setSet] = useState<number | null>(null);
  const at = set ?? step;
  const hidden = (reveal?: number) => reveal !== undefined && at < WHOLE && reveal > at;
  const heldBack = tagged.filter(hidden).length;

  return (
    <section className="relative px-5 py-14 sm:px-8 sm:py-20">
      <div ref={ref} className="mx-auto grid max-w-6xl items-start gap-10 lg:grid-cols-[300px_1fr] lg:gap-16">
        <Reveal>
          {/* The shelf: what the audience has, up to the horizon. */}
          <div className="flex items-end gap-1.5 border-b-2 border-fg px-2">
            {releases.map((r, i) => (
              <motion.button
                key={r.title}
                type="button"
                onClick={() => setSet(i)}
                aria-label={`Show the world as of ${r.title}`}
                aria-pressed={i === at}
                style={{ height: r.height, transformOrigin: "bottom" }}
                // Pulled a little way off the shelf, the way a book is before it is taken down.
                whileHover={{ y: -8, rotate: -1.5 }}
                whileTap={{ y: -3, rotate: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 22 }}
                className={cn(
                  "flex w-14 flex-col items-center justify-between rounded-t-[3px] border py-3 transition-colors duration-500",
                  at === WHOLE
                    ? "border-transparent bg-fg/10 text-fg"
                    : i === at
                      ? "border-transparent bg-ember text-white"
                      : i < at
                        ? "border-transparent bg-fg text-canvas"
                        : "border-dashed border-fg/25 border-b-transparent text-faint hover:text-muted",
                )}
              >
                <span className="h-px w-6 bg-current opacity-40" />
                <span className="rotate-180 font-display text-[15px] whitespace-nowrap [writing-mode:vertical-rl]">{r.spine}</span>
                <span className="text-[11px] tabular-nums opacity-70">{i + 1}</span>
              </motion.button>
            ))}
            <button
              type="button"
              onClick={() => setSet(WHOLE)}
              aria-pressed={at === WHOLE}
              className={cn(
                "group mb-3 ml-auto flex items-center gap-1.5 text-[13px] transition-colors",
                at === WHOLE ? "text-fg" : "text-faint hover:text-muted",
              )}
            >
              <Icon name="pen-new-square-linear" className="text-base transition-[rotate] duration-300 ease-out group-hover:-rotate-12" />
              Your desk
            </button>
          </div>

          <div className="mt-5 flex h-6 items-center text-[13px]">
            <AnimatePresence mode="wait" initial={false}>
              <motion.button
                key={at}
                type="button"
                disabled={at === WHOLE}
                onClick={() => setSet(WHOLE)}
                aria-label={at < WHOLE ? "Lift the spoiler horizon" : undefined}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease }}
                className={cn(
                  "group flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors",
                  at < WHOLE ? "bg-ember/15 text-ember hover:bg-ember/25" : "-ml-1.5 text-muted",
                )}
              >
                {at < WHOLE ? (
                  <>
                    <Icon name="eye-linear" className="size-3.5" />
                    World as of {releases[at].title}
                    <Icon name="close-linear" className="size-3 transition-[rotate] duration-300 ease-out group-hover:rotate-90" />
                  </>
                ) : (
                  "The whole world, as only you see it"
                )}
              </motion.button>
            </AnimatePresence>
          </div>
          <p className="mt-2 text-[13px] text-muted tabular-nums">
            {heldBack === 0 ? "Nothing held back." : `${heldBack} of ${tagged.length} tagged passages held back.`}
          </p>

          <p className="mt-6 text-[14px] leading-relaxed text-muted">
            Writing the Part 2 recap? Set the horizon to Part 2 and Plotra holds back what the audience hasn&apos;t seen
            yet: in the binder, the editor, the codex, the graph, the timeline and exports.
          </p>
        </Reveal>

        <Reveal delay={0.08} className="gap-5 sm:columns-2">
          {notes.map((n) => (
            <article
              key={n.title}
              className="mb-5 break-inside-avoid rounded-sm bg-card px-6 py-5 shadow-[0_1px_2px_rgb(0_0_0/0.06),0_8px_20px_-12px_rgb(0_0_0/0.2)] transition-[translate,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:shadow-[0_1px_2px_rgb(0_0_0/0.06),0_18px_30px_-14px_rgb(0_0_0/0.28)]"
            >
              <div className="flex items-center gap-1.5 text-xs text-muted">
                <Icon name={n.icon} className={cn("size-3.5", n.color)} />
                {n.kind}
                <span className="ml-auto flex gap-1">
                  {n.canon && <span className={cn(chip, "text-gold")}>{n.canon}</span>}
                  {n.reveal !== undefined && <RevealChip reveal={n.reveal} />}
                </span>
              </div>
              <div className={cn(veil, hidden(n.reveal) && veiled)}>
                <h3 className="mt-2 font-display text-[22px] leading-tight text-fg">{n.title}</h3>
                <div className="mt-3 space-y-3 font-prose text-[15.5px] leading-[1.6] text-fg/85">
                  {n.passages.map((p, i) =>
                    p.reveal === undefined ? (
                      <p key={i}>{p.text}</p>
                    ) : (
                      <div key={i} className="border-l-2 border-faint pl-3">
                        <span className="float-right mt-1 ml-3">
                          <RevealChip reveal={p.reveal} />
                        </span>
                        <p className={cn(veil, hidden(p.reveal) && veiled)}>{p.text}</p>
                      </div>
                    ),
                  )}
                </div>
              </div>
            </article>
          ))}
        </Reveal>
      </div>

      <div className="mx-auto mt-14 grid max-w-6xl gap-x-8 gap-y-8 px-1 sm:grid-cols-2 lg:grid-cols-4">
        {worldFeatures.map(([icon, title, body], i) => (
          <Reveal key={title} delay={i * 0.06} className="border-t border-line-strong pt-5">
            <p className="flex items-center gap-2 text-[15px] font-medium text-fg">
              <Icon name={icon} className="text-lg text-ember" />
              {title}
            </p>
            <p className="mt-2 text-[14px] leading-relaxed text-muted">{body}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
