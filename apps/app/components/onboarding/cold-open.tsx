"use client";

import { authClient } from "@plotra/auth/client";
import type { ProjectType } from "@plotra/db/schema";
import { Icon } from "@plotra/icons";
import { Button } from "@plotra/ui/components/button";
import { cn } from "@plotra/ui/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/logo";
import { nav } from "@/components/transitions";
import { authErrorText } from "@/lib/auth-errors";
import { errorText } from "@/lib/errors";
import { createProjectFromAnswers } from "@/lib/onboarding-actions";
import { createProjectFromTemplate } from "@/lib/template-actions";
import { leadTypes, limits, otherTypes, text, trackQuestions, type Answers, type ChoiceQuestion, type Question, type TextQuestion } from "@/lib/onboarding/tracks";
import { projectTypeMeta } from "@/lib/project-types";
import { slugify } from "@/lib/slug";
import { SampleCards } from "./sample-cards";
import { StarterPicker } from "./starter-picker";
import { StoryGraph } from "./story-graph";
import { isLocalMode } from "@/lib/local-mode";

/** A project of the workspace that is offered as a model for new ones. */
type Template = { id: string; title: string; type: ProjectType };

/**
 * The Cold Open (onboarding-plan.md 2.1): a project started by answering a few
 * questions, one at a time, instead of filling in a form. Someone with no
 * workspace names one first. "What are you making?" comes first and picks a
 * track (lib/onboarding/tracks.ts); three story questions follow (left out for
 * non-fiction), then the track's own one or two. Every question can be
 * skipped, and so can all of them.
 */
export function ColdOpen({ workspace, userName, templates = [] }: { workspace: { name: string; slug: string } | null; userName: string; templates?: Template[] }) {
  const router = useRouter();
  const [slug, setSlug] = useState(workspace?.slug ?? null);
  const [answers, setAnswers] = useState<Answers>({ driveKind: "secret" });
  const [stepId, setStepId] = useState(workspace ? "type" : "workspace");
  // Stays set while the new project loads, so nothing can be submitted twice.
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const steps = [...(slug ? [] : ["workspace"]), ...questionSteps(answers)];
  const index = Math.max(0, steps.indexOf(stepId));
  const questions = steps.filter((id) => id !== "workspace");

  const create = async (from: Answers, workspaceSlug = slug) => {
    if (!workspaceSlug) return;
    setCreating(true);
    setError(null);
    try {
      const { href } = await createProjectFromAnswers(workspaceSlug, from);
      router.push(href, { transitionTypes: nav.open });
    } catch (e) {
      setError(errorText(e));
      setCreating(false);
    }
  };

  /** A project in the shape of one of the workspace's templates; the answers so far aren't used. */
  const createFromTemplate = async (templateId: string) => {
    if (!slug) return;
    setCreating(true);
    setError(null);
    try {
      const { href } = await createProjectFromTemplate(slug, templateId);
      router.push(href, { transitionTypes: nav.open });
    } catch (e) {
      setError(errorText(e));
      setCreating(false);
    }
  };

  /** Moves on from the current step with these answers; past the last question the project is created. */
  const advance = (next: Answers) => {
    setAnswers(next);
    setError(null);
    const after = questionSteps(next);
    const at = after.indexOf(stepId);
    if (at === after.length - 1) void create(next);
    else setStepId(after[at + 1]);
  };
  const back = () => {
    setError(null);
    setStepId(steps[index - 1]);
  };

  const setExtra = (patch: Record<string, string | undefined>): Answers => {
    const extra = { ...answers.extra };
    for (const [key, value] of Object.entries(patch)) {
      if (value) extra[key] = value;
      else delete extra[key];
    }
    return { ...answers, extra };
  };

  const trackQuestion = trackQuestions(answers).find((q) => q.id === stepId);
  // The type always comes first, so it is never the last question.
  const last = index === steps.length - 1;
  const who = answers.who;

  return (
    <div className="grid min-h-dvh flex-1 lg:grid-cols-2">
      <main className="relative flex flex-col px-6 py-6 sm:px-12 lg:px-16">
        <header className="flex items-center justify-between gap-4">
          <Logo className="text-lg" />
          {/* Someone who came from a workspace can go back to it; a new account has nowhere else to be yet. */}
          {workspace && (
            <Link href={`/w/${workspace.slug}`} className="text-sm text-muted-foreground hover:text-foreground">
              Cancel
            </Link>
          )}
        </header>

        <div className="flex w-full max-w-xl flex-1 flex-col justify-center py-10">
          {creating ? (
            <p role="status" className="animate-rise font-display text-4xl tracking-tight motion-reduce:animate-none">
              Setting up your project…
            </p>
          ) : (
            // Keyed by step, so each question rises in and its field takes the focus.
            <div key={stepId} className="animate-rise motion-reduce:animate-none">
              {/* The count is only known once the type is: until then, just "Question 1". */}
              {stepId !== "workspace" && (
                <p className="mb-4 text-ui-sm font-medium text-muted-foreground">
                  {answers.type ? `Question ${questions.indexOf(stepId) + 1} of ${questions.length}` : "Question 1"}
                </p>
              )}

              {stepId === "workspace" && (
                <WorkspaceStep
                  userName={userName}
                  onCreated={(created) => {
                    setSlug(created);
                    setStepId("type");
                  }}
                />
              )}

              {stepId === "who" && (
                <TextStep
                  question={{ id: "who", kind: "text", title: "Who is this story about?", hint: "A name is enough. They get a page of their own.", placeholder: "Juliet Capulet", maxLength: limits.name }}
                  answers={answers}
                  value={answers.who}
                  onNext={(value) => advance({ ...answers, who: value })}
                  onBack={back}
                />
              )}

              {stepId === "where" && (
                <TextStep
                  question={{
                    id: "where",
                    kind: "text",
                    title: who ? `Where is ${who} when it starts?` : "Where does it start?",
                    hint: "A city, a ship, a kitchen. It becomes a place you can link to.",
                    placeholder: "The Capulet orchard",
                    maxLength: limits.name,
                  }}
                  answers={answers}
                  value={answers.where}
                  onNext={(value) => advance({ ...answers, where: value })}
                  onBack={back}
                />
              )}

              {stepId === "drive" && (
                <TextStep
                  question={{
                    id: "drive",
                    kind: "text",
                    title: who ? `What is ${who} hiding, or what do they want?` : "What is being hidden, or wanted?",
                    hint:
                      answers.driveKind === "goal"
                        ? "It becomes a plot thread you can follow from scene to scene."
                        : "It becomes a secret, and Plotra keeps track of who knows it.",
                    placeholder: answers.driveKind === "goal" ? "To end the feud between the two houses" : "They were married in secret",
                    maxLength: limits.drive,
                    multiline: true,
                  }}
                  answers={answers}
                  value={answers.drive}
                  onNext={(value) => advance({ ...answers, drive: value })}
                  onBack={back}
                  above={
                    <div role="radiogroup" aria-label="Which is it?" onKeyDown={radioKeys} className="mb-5 flex flex-wrap gap-2">
                      {(
                        [
                          ["secret", "Hiding something"],
                          ["goal", "Wants something"],
                        ] as const
                      ).map(([kind, label]) => (
                        <button
                          key={kind}
                          type="button"
                          role="radio"
                          aria-checked={answers.driveKind === kind}
                          tabIndex={answers.driveKind === kind ? 0 : -1}
                          onClick={() => setAnswers({ ...answers, driveKind: kind })}
                          className={cn(
                            "h-8 rounded-full border px-3 text-sm text-muted-foreground transition-colors hover:text-foreground",
                            answers.driveKind === kind && "border-ember/60 bg-ember/[0.06] text-foreground",
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  }
                />
              )}

              {stepId === "type" && slug && (
                <TypeStep
                  value={answers.type}
                  workspaceSlug={slug}
                  templates={templates}
                  onTemplate={(id) => void createFromTemplate(id)}
                  onPick={(type) => advance({ ...answers, type, extra: {} })}
                />
              )}

              {trackQuestion?.kind === "text" && (
                <TextStep
                  question={trackQuestion}
                  answers={answers}
                  value={answers.extra?.[trackQuestion.id]}
                  onNext={(value) => advance(setExtra({ [trackQuestion.id]: value }))}
                  onBack={back}
                  last={last}
                />
              )}

              {trackQuestion?.kind === "choice" && (
                <ChoiceStep
                  question={trackQuestion}
                  answers={answers}
                  value={answers.extra?.[trackQuestion.id]}
                  typed={answers.extra?.[`${trackQuestion.id}Text`]}
                  onNext={(value, typed) => advance(setExtra({ [trackQuestion.id]: value, [`${trackQuestion.id}Text`]: typed }))}
                  onBack={back}
                  last={last}
                />
              )}

              {error && (
                <p role="alert" className="mt-5 text-sm text-destructive">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>

        {slug && !creating && (
          <footer className="text-sm text-muted-foreground">
            <button type="button" onClick={() => void create({ type: answers.type })} className="underline decoration-border underline-offset-4 hover:text-foreground">
              Skip, just give me a blank page
            </button>
          </footer>
        )}
      </main>
      <aside className="hidden border-l bg-sidebar lg:block">
        <StoryGraph answers={answers} />
      </aside>
    </div>
  );
}

/** The questions, in order: the type first, then the story (not for non-fiction), then the track's own. */
function questionSteps(answers: Answers): string[] {
  const story = answers.type === "nonfiction" ? [] : ["who", "where", "drive"];
  return ["type", ...story, ...trackQuestions(answers).map((q) => q.id)];
}

/** Arrow keys move the choice within a radio group, as they do between native radio buttons. */
function radioKeys(event: React.KeyboardEvent<HTMLElement>) {
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
  if (!step) return;
  const radios = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]'));
  const at = radios.indexOf(document.activeElement as HTMLElement);
  if (at === -1) return;
  event.preventDefault();
  const next = radios[(at + step + radios.length) % radios.length];
  next.focus();
  next.click();
}

const fieldClass =
  "w-full border-b border-input bg-transparent pb-2 font-display text-3xl tracking-tight outline-none placeholder:text-faint focus-visible:border-ember sm:text-4xl";

function Heading({ question, answers }: { question: Question; answers: Answers }) {
  return (
    <>
      <h1 className="font-display text-4xl leading-[1.05] tracking-tight text-balance sm:text-5xl">{text(question.title, answers)}</h1>
      {question.hint && <p className="mt-3 text-muted-foreground">{question.hint}</p>}
    </>
  );
}

/** Back, skip this one, and continue. Skipping leaves the answer out; the project is made without it. */
function Actions({ onBack, onSkip, last }: { onBack?: () => void; onSkip?: () => void; last?: boolean }) {
  return (
    <div className="mt-8 flex items-center gap-2">
      <Button type="submit">
        {last ? "Start writing" : "Continue"}
        <Icon name="arrow-right-linear" />
      </Button>
      {onSkip && (
        <Button type="button" variant="ghost" onClick={onSkip}>
          Skip this
        </Button>
      )}
      {onBack && (
        <Button type="button" variant="ghost" onClick={onBack} className="ml-auto text-muted-foreground">
          <Icon name="arrow-left-linear" />
          Back
        </Button>
      )}
    </div>
  );
}

function TextStep({
  question,
  answers,
  value,
  onNext,
  onBack,
  above,
  last,
}: {
  question: TextQuestion;
  answers: Answers;
  value: string | undefined;
  /** Called with the trimmed answer, or undefined when the question was skipped or left empty. */
  onNext: (value: string | undefined) => void;
  onBack?: () => void;
  above?: React.ReactNode;
  last?: boolean;
}) {
  const [draft, setDraft] = useState(value ?? "");
  const submit = () => onNext(draft.trim() || undefined);
  const field = { id: `cold-open-${question.id}`, value: draft, placeholder: question.placeholder, maxLength: question.maxLength, autoFocus: true, autoComplete: "off" };
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label htmlFor={field.id}>
        <Heading question={question} answers={answers} />
      </label>
      <div className="mt-8">
        {above}
        {question.multiline ? (
          <textarea
            {...field}
            rows={2}
            onChange={(event) => setDraft(event.target.value)}
            // Enter answers, as it does in the one-line questions; Shift+Enter is a new line.
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
              event.preventDefault();
              submit();
            }}
            className={cn(fieldClass, "resize-none text-2xl sm:text-3xl")}
          />
        ) : (
          <input {...field} onChange={(event) => setDraft(event.target.value)} className={fieldClass} />
        )}
      </div>
      <Actions onBack={onBack} onSkip={() => onNext(undefined)} last={last} />
    </form>
  );
}

const cardClass =
  "flex w-full items-start gap-3 rounded-lg border bg-card p-4 text-left outline-none transition-colors hover:border-ember/50 hover:bg-ember/[0.04] focus-visible:ring-[3px] focus-visible:ring-ring/50";
const chosenClass = "border-ember/60 bg-ember/[0.06]";

function ChoiceStep({
  question,
  answers,
  value,
  typed,
  onNext,
  onBack,
  last,
}: {
  question: ChoiceQuestion;
  answers: Answers;
  value: string | undefined;
  typed: string | undefined;
  onNext: (value: string | undefined, typed?: string) => void;
  onBack: () => void;
  last?: boolean;
}) {
  const [picked, setPicked] = useState(value);
  const [draft, setDraft] = useState(typed ?? "");
  const option = question.options.find((o) => o.value === picked);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onNext(picked, option?.input ? draft.trim() || undefined : undefined);
      }}
    >
      <Heading question={question} answers={answers} />
      {/* Choosing selects, as a radio button does; Continue (or Enter) moves on. Arrow keys move between choices. */}
      <div role="radiogroup" aria-label={text(question.title, answers)} onKeyDown={radioKeys} className="mt-8 grid gap-2 sm:grid-cols-2">
        {question.options.map((o, i) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={picked === o.value}
            tabIndex={picked === o.value || (picked === undefined && i === 0) ? 0 : -1}
            onClick={() => setPicked(o.value)}
            className={cn(cardClass, picked === o.value && chosenClass)}
          >
            <span className="min-w-0">
              <span className="block font-medium break-words">{text(o.label, answers)}</span>
              {o.description && <span className="mt-0.5 block text-sm text-muted-foreground">{o.description}</span>}
            </span>
          </button>
        ))}
      </div>
      {option?.input && (
        <input
          aria-label={option.input.placeholder}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={option.input.placeholder}
          maxLength={option.input.maxLength}
          autoFocus
          autoComplete="off"
          className={cn(fieldClass, "mt-6")}
        />
      )}
      <Actions onBack={onBack} onSkip={() => onNext(undefined)} last={last} />
    </form>
  );
}

/** "What are you making?": the fork, asked first. The two kinds Plotra is tested for first lead; the rest, and the starters and samples, are one click further. */
function TypeStep({
  value,
  workspaceSlug,
  templates,
  onTemplate,
  onPick,
}: {
  value: ProjectType | undefined;
  workspaceSlug: string;
  templates: Template[];
  onTemplate: (id: string) => void;
  onPick: (type: ProjectType) => void;
}) {
  const [more, setMore] = useState(value !== undefined && otherTypes.includes(value));
  const [browse, setBrowse] = useState(false);
  return (
    <div>
      <h1 className="font-display text-4xl leading-[1.05] tracking-tight text-balance sm:text-5xl">What are you making?</h1>
      <p className="mt-3 text-muted-foreground">Plotra sets up the right tools for it. Everything can be changed later.</p>
      <div className="mt-8 grid gap-2">
        {leadTypes.map((lead) => (
          <button key={lead.type} type="button" onClick={() => onPick(lead.type)} className={cn(cardClass, value === lead.type && chosenClass)}>
            <Icon name={lead.icon} className="mt-0.5 size-6 shrink-0 text-ember-ink" />
            <span className="min-w-0">
              <span className="block font-medium">{lead.label}</span>
              <span className="mt-0.5 block text-sm text-muted-foreground">{lead.description}</span>
            </span>
          </button>
        ))}
      </div>
      {more ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {otherTypes.map((type) => (
            <button key={type} type="button" onClick={() => onPick(type)} className={cn(cardClass, "items-center p-3", value === type && chosenClass)}>
              <Icon name={projectTypeMeta[type].icon} className="size-5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 text-sm break-words">{projectTypeMeta[type].label}</span>
            </button>
          ))}
        </div>
      ) : (
        <Button type="button" variant="ghost" onClick={() => setMore(true)} className="mt-2 text-muted-foreground">
          Something else
          <Icon name="alt-arrow-right-linear" />
        </Button>
      )}
      <div className="mt-8 border-t pt-5">
        <Button type="button" variant="ghost" aria-expanded={browse} aria-controls="cold-open-browse" onClick={() => setBrowse((open) => !open)} className="-ml-3 text-muted-foreground">
          <Icon name={browse ? "alt-arrow-down-linear" : "alt-arrow-right-linear"} />
          Browse templates and samples
        </Button>
        {browse && (
          <div id="cold-open-browse" className="mt-4 grid gap-8">
            {templates.length > 0 && (
              <div>
                <p className="mb-3 text-sm text-muted-foreground">This workspace&apos;s templates, in the shape of projects you already have:</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {templates.map((template) => (
                    <button key={template.id} type="button" onClick={() => onTemplate(template.id)} className={cn(cardClass, "items-center p-3")}>
                      <Icon name={projectTypeMeta[template.type].icon} className="size-5 shrink-0 text-ember-ink" />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium break-words">{template.title}</span>
                        <span className="block text-xs text-muted-foreground">Its folders, words, labels and tools, without its text.</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <p className="mb-3 text-sm text-muted-foreground">Starters, with the structure already laid out:</p>
              <StarterPicker workspaceSlug={workspaceSlug} />
            </div>
            <div>
              <p className="mb-3 text-sm text-muted-foreground">Samples: look around a finished one first.</p>
              <SampleCards workspaceSlug={workspaceSlug} className="sm:grid-cols-2" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The first screen for someone with no workspace yet. The name is already
 * filled in, so Enter accepts it; the address is made from the name.
 */
function WorkspaceStep({ userName, onCreated }: { userName: string; onCreated: (slug: string) => void }) {
  const first = userName.trim().split(/\s+/)[0];
  // Local mode's person may have no name of their own ("You"), and their workspace is a library on this computer.
  const [name, setName] = useState(isLocalMode ? "My library" : first ? `${first}'s workspace` : "My workspace");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return setError("Give your workspace a name.");
    // A name with no Latin letters or digits ("物語の部屋") keeps its name; only its address falls back.
    const latin = slugify(trimmed.replace(/['’]/g, ""));
    const base = latin || "workspace";
    setPending(true);
    setError(null);
    // Workspace addresses are shared by everyone, and "ashas-workspace" may be taken: try once more with a few
    // letters added. The fallback address goes straight to the second form, so two such people don't collide.
    const withLetters = () => `${base.slice(0, 42)}-${Math.random().toString(36).slice(2, 6)}`;
    let slug = latin ? base : withLetters();
    let result = await authClient.organization.create({ name: trimmed, slug });
    if (result.error) {
      slug = withLetters();
      result = await authClient.organization.create({ name: trimmed, slug });
    }
    if (result.error) {
      setError(authErrorText(result.error, "Couldn't create the workspace. Try again in a moment."));
      setPending(false);
      return;
    }
    onCreated(slug);
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <label htmlFor="cold-open-workspace">
        <h1 className="font-display text-4xl leading-[1.05] tracking-tight text-balance sm:text-5xl">First, name your workspace.</h1>
        <p className="mt-3 text-muted-foreground">It holds your projects and the people you write with. You can rename it later in Workspace settings.</p>
      </label>
      <input
        id="cold-open-workspace"
        value={name}
        onChange={(event) => setName(event.target.value)}
        onFocus={(event) => event.target.select()}
        maxLength={80}
        required
        autoFocus
        autoComplete="off"
        className={cn(fieldClass, "mt-8")}
      />
      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="mt-8">
        <Button type="submit" disabled={pending}>
          Continue
          <Icon name="arrow-right-linear" />
        </Button>
      </div>
    </form>
  );
}
