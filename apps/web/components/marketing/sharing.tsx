"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRef } from "react";
import { Icon, type IconName } from "@plotra/icons";
import { cn } from "@/lib/cn";
import { ease } from "@/lib/motion";
import { Typed } from "./app-mock-views";
import { Reveal } from "./reveal";
import { useSteps } from "./use-steps";

// The whole access model (plan.md 2.9), acted out: the share dialog as the app
// draws it (apps/app/components/workspace/share-dialog.tsx) adds three people,
// one in each role, and the page beside it shows what each of them can then do.
// Nothing here is aspirational.

const invites = [
  { email: "friend@example.com", initials: "FR", role: "Viewer", tint: "bg-sky", hint: "Can read everything in this project." },
  { email: "beta-reader@example.com", initials: "BR", role: "Commenter", tint: "bg-violet", hint: "Can read and comment." },
  { email: "ada@example.com", initials: "AD", role: "Editor", tint: "bg-teal", hint: "Can read, comment and edit." },
];
const members = [
  { name: "Maren Vale", email: "maren@saltmarsh.example", initials: "MV", role: "Owner", tint: "bg-ember" },
  { name: "Tobias Okafor", email: "tobias@saltmarsh.example", initials: "TO", role: "Member", tint: "bg-gold" },
];

// For each person: their address is typed, then they are on the list. A last beat holds on all three.
const beats = [...invites.flatMap(() => [2000, 2600]), 3200];
const STILL = beats.length - 1;

const roles: [IconName, string, string][] = [
  ["eye-linear", "Viewer", "Reads the whole project and changes nothing. Good for a friend reading a draft."],
  ["chat-round-line-linear", "Commenter", "Reads and comments. This is what a beta reader gets."],
  ["pen-new-square-linear", "Editor", "Reads, comments and edits, without joining your workspace."],
  ["users-group-rounded-linear", "Workspace member", "Edits every project in the workspace. Owners and admins also manage members and sharing."],
];

const heading = "text-[11px] font-medium tracking-wider text-muted uppercase";
const field = "flex h-8 items-center rounded-md border border-fg/15 bg-card px-2.5 text-[13px]";

function Avatar({ initials, tint }: { initials: string; tint: string }) {
  return (
    <span className={cn("grid size-7 shrink-0 place-items-center rounded-full text-[10px] font-semibold text-white", tint)}>
      {initials}
    </span>
  );
}

export function Sharing() {
  const ref = useRef<HTMLDivElement>(null);
  const { step } = useSteps(ref, beats, STILL);
  // Who is being typed in, and how many are already on the list.
  const typing = step < STILL && step % 2 === 0 ? invites[step / 2] : null;
  const shared = Math.ceil(step / 2);
  const draft = typing ?? invites[Math.min(shared, invites.length - 1)];
  // The role the mock is showing at this moment; the list under it lights up to match.
  const showing = step === STILL ? -1 : Math.floor(step / 2);

  return (
    <section className="relative px-5 py-14 sm:px-8 sm:py-20">
      <div ref={ref} aria-hidden className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] items-start gap-10 lg:grid-cols-[minmax(0,470px)_minmax(0,1fr)] lg:gap-16">
        <Reveal className="rounded-xl border border-fg/10 bg-card p-5 shadow-[0_24px_60px_-30px_rgb(0_0_0/0.3),0_2px_6px_-2px_rgb(0_0_0/0.06)] sm:p-6">
          <p className="flex items-center gap-2 text-[17px] font-semibold text-fg">
            <Icon name="users-group-rounded-linear" className="size-5 text-ember" />
            Share “Romeo and Juliet”
          </p>
          <p className="mt-1.5 text-[13px] text-muted">Add anyone by email, in or outside the workspace. They see only this project.</p>

          <div className="mt-5 flex gap-2">
            <span className={cn(field, "min-w-0 flex-1")}>
              {typing ? (
                <>
                  <span className="truncate">
                    <Typed key={typing.email} text={typing.email} typing />
                  </span>
                  <span className="ml-px h-4 w-px shrink-0 animate-blink bg-fg" />
                </>
              ) : (
                <span className="text-faint">name@example.com</span>
              )}
            </span>
            <span className={cn(field, "w-[6.5rem] shrink-0 justify-between gap-2 sm:w-[7.5rem]")}>
              {draft.role}
              <Icon name="alt-arrow-down-linear" className="size-3.5 text-faint" />
            </span>
            <span className="flex h-8 shrink-0 items-center rounded-md bg-fg px-3 text-[13px] font-medium text-white">Share</span>
          </div>
          <p className="mt-2 text-xs text-faint">{draft.hint}</p>

          <p className={cn(heading, "mt-5")}>Shared with</p>
          {/* Room for all three from the start, so the dialog doesn't grow under the reader. */}
          <div className="mt-1.5 h-[151px] overflow-hidden rounded-lg border border-fg/10 text-[13px]">
            <AnimatePresence initial={false}>
              {invites.slice(0, shared).map((p) => (
                <motion.div
                  key={p.email}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4, ease }}
                  className="flex h-[50px] items-center gap-2.5 border-b border-fg/10 px-3"
                >
                  <Avatar initials={p.initials} tint={p.tint} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{p.email}</span>
                    <span className="block truncate text-xs text-muted">Invited: hasn&apos;t opened the link yet</span>
                  </span>
                  <span className={cn(field, "h-7 gap-2 px-2 text-[12.5px] max-sm:hidden")}>
                    {p.role}
                    <Icon name="alt-arrow-down-linear" className="size-3 text-faint" />
                  </span>
                  <Icon name="close-linear" className="size-3.5 shrink-0 text-faint" />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <p className={cn(heading, "mt-4")}>Workspace members</p>
          <div className="mt-1.5 divide-y divide-fg/10 rounded-lg border border-fg/10 text-[13px]">
            {members.map((m) => (
              <div key={m.email} className="flex items-center gap-2.5 px-3 py-2">
                <Avatar initials={m.initials} tint={m.tint} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{m.name}</span>
                  <span className="block truncate text-xs text-muted">{m.email}</span>
                </span>
                <span className="text-xs text-muted">{m.role}</span>
              </div>
            ))}
          </div>
        </Reveal>

        {/* The page they were invited to, and what each of them does on it. */}
        <Reveal delay={0.08} className="lg:pt-4">
          <div className="flex items-center gap-2 text-xs text-muted">
            <Icon name="clapperboard-text-linear" className="size-3.5" />
            <span className="truncate">Two Households / The Balcony</span>
            <span className="ml-auto flex -space-x-1.5">
              {invites.map((p, i) => (
                <motion.span
                  key={p.email}
                  initial={false}
                  animate={{ opacity: i < shared ? 1 : 0, scale: i < shared ? 1 : 0.6 }}
                  transition={{ duration: 0.4, ease, delay: 0.3 }}
                  className="rounded-full ring-2 ring-canvas"
                >
                  <Avatar initials={p.initials} tint={p.tint} />
                </motion.span>
              ))}
            </span>
          </div>
          <h3 className="mt-3 font-display text-[30px] leading-tight text-fg">The Balcony</h3>
          <div className="mt-4 space-y-4 font-prose text-[17px] leading-[1.7] text-fg/80 sm:text-[19px]">
            <p>
              She came out onto the balcony and said his name to the dark, not knowing that{" "}
              <span className={cn("transition-colors duration-700", shared >= 2 && "bg-violet/15")}>
                he stood in the orchard right below her, close enough to answer
              </span>
              .
            </p>
            <motion.div
              initial={false}
              animate={{ opacity: shared >= 2 ? 1 : 0, y: shared >= 2 ? 0 : 6 }}
              transition={{ duration: 0.45, ease, delay: 0.5 }}
              className="ml-auto flex max-w-sm gap-2.5 rounded-lg border border-fg/10 bg-card p-3 font-sans text-[13px] leading-snug shadow-sm"
            >
              <Avatar initials="BR" tint="bg-violet" />
              <span>
                <span className="block text-xs text-muted">beta-reader@example.com · Commenter</span>
                <span className="mt-0.5 block text-fg">So we know he&apos;s listening before she does. Is that on purpose?</span>
              </span>
            </motion.div>
            {/* Tall enough for the editor's line, so the page holds still while it is written. */}
            <p className="min-h-[3.4em]">
              “Deny thy father,” she said, “and refuse thy name.”
              {shared >= 3 && (
                <>
                  {" "}
                  <ins className="bg-teal/15 text-fg no-underline">
                    <Typed text="He almost answered." typing={step === 5} />
                  </ins>
                  <span className="relative inline-block h-[1.15em] w-0 align-text-bottom">
                    <span className="absolute inset-y-0 left-0 w-0.5 bg-teal" />
                    <span className="absolute -top-4 left-0 rounded-sm bg-teal px-1 py-px font-sans text-[10px] leading-tight font-medium whitespace-nowrap text-white">
                      ada · Editor
                    </span>
                  </span>
                </>
              )}
            </p>
          </div>
          <p
            className={cn(
              "mt-5 flex items-center gap-1.5 text-[13px] text-muted transition-opacity duration-500",
              shared >= 1 ? "opacity-100" : "opacity-0",
            )}
          >
            <Icon name="eye-linear" className="size-4 text-sky" />
            friend@example.com is reading. A viewer leaves no mark.
          </p>
        </Reveal>
      </div>

      <div className="mx-auto mt-14 grid max-w-6xl gap-x-8 gap-y-8 px-1 sm:grid-cols-2 lg:grid-cols-4">
        {roles.map(([icon, title, body], i) => (
          <Reveal
            key={title}
            delay={i * 0.06}
            className={cn("border-t pt-5 transition-colors duration-500", i === showing ? "border-ember" : "border-line-strong")}
          >
            <p className="flex items-center gap-2 text-[15px] font-medium text-fg">
              <Icon name={icon} className="text-lg text-ember" />
              {title}
            </p>
            <p className="mt-2 text-[14px] leading-relaxed text-muted">{body}</p>
          </Reveal>
        ))}
      </div>
      <Reveal className="mx-auto mt-10 max-w-6xl px-1">
        <p className="max-w-3xl text-[13.5px] leading-relaxed text-muted">
          That is the whole permission system: four roles, and access that follows the project, so there is nothing
          to set up note by note. Remove someone and the access is gone on their next request.
        </p>
      </Reveal>
    </section>
  );
}
