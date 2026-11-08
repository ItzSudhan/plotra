"use client";

import type { Answer, Question } from "@plotra/db/schema";
import { Icon } from "@plotra/icons";
import { confirm } from "@plotra/ui/components/dialogs";
import { IconButton } from "@plotra/ui/components/icon-button";
import { cn } from "@plotra/ui/lib/utils";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { errorText, fieldClass } from "@/components/views/view-ui";
import { Avatar, usePeople } from "@/components/workflow/data";
import { useStore } from "@/components/workspace/stores";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { MAX_QUESTIONS, questionTypeMeta } from "@/lib/editorial";
import {
  deleteQuestionnaire,
  saveQuestionnaire,
  setQuestionnaireOpen,
  submitResponse,
  type QuestionnaireResults,
  type QuestionnaireRow,
} from "@/lib/editorial-actions";
import { read } from "@/lib/read";
import { ancestors, flatten } from "@/lib/tree";
import { QUESTIONNAIRES_NOTICE, useQuestionnaires } from "./data";
import { SelectField } from "@plotra/ui/components/select-field";
import { plural } from "@/lib/plural";

// Questionnaires for beta readers (plan.md 2.8): an author asks a few
// questions about a chapter, a folder or the whole project; readers answer
// once and may change their answers while it's open.

const sectionTitle = "text-ui-sm font-medium";
const textareaClass =
  "w-full resize-y rounded-md border border-input bg-transparent px-2 py-1.5 text-ui-sm leading-relaxed outline-none placeholder:text-faint focus-visible:ring-[3px] focus-visible:ring-ring/50";
const primaryButton = "flex h-8 items-center gap-1.5 rounded-md bg-foreground px-2.5 text-ui-sm text-background disabled:opacity-40";
const plainButton = "flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-ui-sm hover:bg-accent disabled:pointer-events-none disabled:opacity-40";

type Draft = { id?: string; nodeId: string | null; title: string; intro: string; questions: Array<Question & { choicesText: string }> };

const blankQuestion = (): Draft["questions"][number] => ({ id: crypto.randomUUID(), prompt: "", type: "text", choicesText: "" });

/** The author's form: title, what it's about, and the questions. */
function QuestionnaireEditor({ initial, onDone }: { initial: Draft; onDone: (saved: boolean) => void }) {
  const { project, binder } = useWorkspace();
  const { index } = useStore(binder);
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const notes = useMemo(() => flatten(index), [index]);
  const patch = (i: number, next: Partial<Draft["questions"][number]>) =>
    setDraft((d) => ({ ...d, questions: d.questions.map((q, at) => (at === i ? { ...q, ...next } : q)) }));

  const save = async () => {
    setBusy(true);
    try {
      await saveQuestionnaire(project.id, {
        id: draft.id,
        nodeId: draft.nodeId,
        title: draft.title,
        intro: draft.intro,
        questions: draft.questions
          .filter((q) => q.prompt.trim())
          .map(({ choicesText, ...q }) => (q.type === "choice" ? { ...q, choices: choicesText.split("\n").map((c) => c.trim()).filter(Boolean) } : q)),
      });
      onDone(true);
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-3 rounded-lg border bg-card p-4">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_14rem]">
        <input
          autoFocus
          value={draft.title}
          placeholder="Title, e.g. Chapter 3 feedback"
          aria-label="Title"
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          className={fieldClass}
        />
        <SelectField value={draft.nodeId ?? ""} aria-label="About" onValueChange={(v) => setDraft({ ...draft, nodeId: v || null })} className={fieldClass}>
          <option value="">About the whole project</option>
          {notes.map((n) => (
            <option key={n.id} value={n.id}>
              {"  ".repeat(ancestors(index, n.id).length)}
              {n.title}
            </option>
          ))}
        </SelectField>
      </div>
      <textarea
        rows={2}
        value={draft.intro}
        placeholder="A word to your readers (optional): what to look out for, when you need it by…"
        aria-label="Introduction"
        onChange={(e) => setDraft({ ...draft, intro: e.target.value })}
        className={textareaClass}
      />
      <ol className="grid gap-2">
        {draft.questions.map((q, i) => (
          <li key={q.id} className="grid gap-1.5 rounded-md border p-2.5">
            <div className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-right text-xs text-faint tabular-nums">{i + 1}.</span>
              <input
                value={q.prompt}
                placeholder="Your question"
                aria-label={`Question ${i + 1}`}
                onChange={(e) => patch(i, { prompt: e.target.value })}
                className={fieldClass}
              />
              <SelectField
                value={q.type}
                aria-label="Kind of answer"
                onValueChange={(v) => patch(i, { type: v as Question["type"] })}
                className={`${fieldClass} w-40 shrink-0`}
              >
                {(Object.keys(questionTypeMeta) as Question["type"][]).map((t) => (
                  <option key={t} value={t}>
                    {questionTypeMeta[t].label}
                  </option>
                ))}
              </SelectField>
              <IconButton
                icon="trash-bin-minimalistic-linear"
                label="Remove question"
                variant="destructive"
                disabled={draft.questions.length === 1}
                onClick={() => setDraft({ ...draft, questions: draft.questions.filter((_, at) => at !== i) })}
              />
            </div>
            {q.type === "choice" && (
              <textarea
                rows={3}
                value={q.choicesText}
                placeholder="One choice per line"
                aria-label={`Choices for question ${i + 1}`}
                onChange={(e) => patch(i, { choicesText: e.target.value })}
                className={cn(textareaClass, "ml-7 w-[calc(100%-1.75rem)]")}
              />
            )}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={draft.questions.length >= MAX_QUESTIONS}
          onClick={() => setDraft({ ...draft, questions: [...draft.questions, blankQuestion()] })}
          className={plainButton}
        >
          <Icon name="add-square-linear" className="size-3.5" />
          Add a question
        </button>
        <span className="flex-1" />
        <button type="button" onClick={() => onDone(false)} className="h-8 rounded-md px-2.5 text-ui-sm text-muted-foreground hover:bg-accent">
          Cancel
        </button>
        <button type="button" disabled={busy || !draft.title.trim() || !draft.questions.some((q) => q.prompt.trim())} onClick={() => void save()} className={primaryButton}>
          {draft.id ? "Save" : "Create questionnaire"}
        </button>
      </div>
    </div>
  );
}

/** A reader's form. */
function AnswerForm({ questionnaire, onDone }: { questionnaire: QuestionnaireRow; onDone: (saved: boolean) => void }) {
  const { project } = useWorkspace();
  const [answers, setAnswers] = useState<Record<string, Answer>>(questionnaire.myAnswers ?? {});
  const [busy, setBusy] = useState(false);
  const set = (id: string, value: Answer) => setAnswers((a) => ({ ...a, [id]: value }));

  const submit = async () => {
    setBusy(true);
    try {
      await submitResponse(project.id, questionnaire.id, answers);
      toast.success(questionnaire.myAnswers ? "Answers updated." : "Thanks! Your answers were sent.");
      onDone(true);
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 border-t pt-3">
      {questionnaire.intro && <p className="text-ui-sm whitespace-pre-wrap text-muted-foreground">{questionnaire.intro}</p>}
      <ol className="grid gap-4">
        {questionnaire.questions.map((q, i) => (
          <li key={q.id} className="grid gap-1.5">
            <p className="text-ui-sm font-medium">
              {i + 1}. {q.prompt}
            </p>
            {q.type === "text" ? (
              <textarea rows={3} value={String(answers[q.id] ?? "")} aria-label={q.prompt} onChange={(e) => set(q.id, e.target.value)} className={textareaClass} />
            ) : q.type === "rating" ? (
              <div className="flex gap-1" role="radiogroup" aria-label={q.prompt}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={answers[q.id] === n}
                    onClick={() => set(q.id, answers[q.id] === n ? null : n)}
                    className={cn("grid size-8 place-items-center rounded-md border text-ui-sm tabular-nums hover:bg-accent", answers[q.id] === n && "border-foreground bg-foreground text-background hover:bg-foreground")}
                  >
                    {n}
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid gap-1">
                {(q.choices ?? []).map((choice) => (
                  <label key={choice} className="flex items-center gap-2 text-ui-sm">
                    <input type="radio" name={`${questionnaire.id}:${q.id}`} checked={answers[q.id] === choice} onChange={() => set(q.id, choice)} />
                    {choice}
                  </label>
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => onDone(false)} className="h-8 rounded-md px-2.5 text-ui-sm text-muted-foreground hover:bg-accent">
          Cancel
        </button>
        <button type="button" disabled={busy} onClick={() => void submit()} className={primaryButton}>
          {questionnaire.myAnswers ? "Update answers" : "Send answers"}
        </button>
      </div>
    </div>
  );
}

/** What everyone answered, per question. */
function Results({ questionnaire }: { questionnaire: QuestionnaireRow }) {
  const { project } = useWorkspace();
  const people = usePeople();
  const [results, setResults] = useState<QuestionnaireResults | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    read("getQuestionnaireResults", project.id, questionnaire.id)
      .then((r) => !cancelled && setResults(r))
      .catch((error) => !cancelled && setFailed(errorText(error)));
    return () => {
      cancelled = true;
    };
  }, [project.id, questionnaire.id, questionnaire.responses]);

  if (failed) return <p className="border-t pt-3 text-ui-sm text-destructive">{failed}</p>;
  if (!results) return <div className="h-16 animate-pulse rounded bg-muted" />;
  if (!results.respondents.length) return <p className="border-t pt-3 text-ui-sm text-muted-foreground">Nobody has answered yet.</p>;
  const name = (id: string) => people.get(id)?.name ?? "Former member";

  return (
    <div className="grid gap-4 border-t pt-3">
      <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        Answered by
        {results.respondents.map((id) => (
          <span key={id} className="flex items-center gap-1">
            <Avatar person={people.get(id)} className="size-4" />
            {name(id)}
          </span>
        ))}
      </p>
      <ol className="grid gap-4">
        {results.summary.map(({ question, answers, average, tally }, i) => (
          <li key={question.id} className="grid gap-1.5">
            <p className="text-ui-sm font-medium">
              {i + 1}. {question.prompt}
              <span className="ml-2 text-xs font-normal text-faint">
                {answers.length} {plural(answers.length, "answer")}
              </span>
            </p>
            {question.type === "rating" && average !== null && (
              <p className="text-ui-sm">
                <span className="font-display text-2xl tabular-nums">{average.toFixed(1)}</span>
                <span className="text-muted-foreground"> / 5 on average</span>
              </p>
            )}
            {question.type === "choice" &&
              tally.map((t) => (
                <div key={t.choice} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_2rem] items-center gap-2 text-ui-sm">
                  <span className="truncate">{t.choice}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full rounded-full bg-teal" style={{ width: `${answers.length ? (t.count / answers.length) * 100 : 0}%` }} />
                  </span>
                  <span className="text-right text-muted-foreground tabular-nums">{t.count}</span>
                </div>
              ))}
            <ul className="grid gap-1">
              {answers.map((a) => (
                <li key={a.userId} className="grid grid-cols-[8rem_minmax(0,1fr)] gap-2 text-ui-sm">
                  <span className="truncate text-muted-foreground">{name(a.userId)}</span>
                  <span className="break-words whitespace-pre-wrap">{question.type === "rating" ? `${a.value} / 5` : a.value}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function QuestionnairesTab() {
  const { project, binder, notify, openNode } = useWorkspace();
  const { index } = useStore(binder);
  const { data, refresh } = useQuestionnaires();
  const isAuthor = project.actions.includes("edit");
  const [editing, setEditing] = useState<Draft | null>(null);
  const [open, setOpen] = useState<{ id: string; mode: "answer" | "results" } | null>(null);

  const changed = () => {
    notify(QUESTIONNAIRES_NOTICE);
    refresh();
  };
  const run = async (work: () => Promise<unknown>) => {
    try {
      await work();
      changed();
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  // What a reader still has to answer comes first.
  const sorted = useMemo(() => {
    const rank = (q: QuestionnaireRow) => (q.canAnswer && !q.myAnswers ? 0 : q.canAnswer ? 1 : 2);
    return [...(data ?? [])].sort((a, b) => rank(a) - rank(b));
  }, [data]);

  if (!data) return <div className="m-4 h-24 animate-pulse rounded-lg bg-muted" />;

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-4 p-4">
      <div className="flex items-center gap-2">
        <h3 className={sectionTitle}>Questionnaires · {data.length}</h3>
        <span className="flex-1" />
        {isAuthor && !editing && (
          <button type="button" onClick={() => setEditing({ nodeId: null, title: "", intro: "", questions: [blankQuestion()] })} className={plainButton}>
            <Icon name="add-square-linear" className="size-3.5" />
            New questionnaire
          </button>
        )}
      </div>

      {editing && (
        <QuestionnaireEditor
          key={editing.id ?? "new"}
          initial={editing}
          onDone={(saved) => {
            setEditing(null);
            if (saved) changed();
          }}
        />
      )}

      {sorted.length === 0 && !editing && (
        <p className="rounded-lg border border-dashed px-3 py-6 text-center text-ui-sm text-muted-foreground">
          {isAuthor
            ? "No questionnaires yet. Ask your readers what worked, what dragged, and who they're rooting for."
            : "There's nothing to answer at the moment."}
        </p>
      )}

      <ul className="grid gap-2">
        {sorted.map((q) => {
          const about = q.nodeId ? index.byId.get(q.nodeId) : undefined;
          const mode = open?.id === q.id ? open.mode : null;
          return (
            <li key={q.id} className="grid gap-3 rounded-lg border bg-card p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Icon name="question-circle-linear" className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{q.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {q.questions.length} {plural(q.questions.length, "question")} about{" "}
                    {about ? (
                      <button type="button" onClick={() => openNode(about.id, "tab")} className="underline underline-offset-2 hover:text-foreground">
                        {about.title}
                      </button>
                    ) : (
                      "the whole project"
                    )}
                    {q.responses !== null && ` · ${q.responses} ${plural(q.responses, "response")}`}
                    {q.myAnswers && " · you answered"}
                  </p>
                </div>
                <span className={cn("rounded px-1.5 py-px text-meta font-medium", q.open ? "bg-teal/15 text-teal-ink" : "bg-muted text-muted-foreground")}>
                  {q.open ? "Open" : "Closed"}
                </span>
                {q.canAnswer && (
                  <button type="button" onClick={() => setOpen(mode === "answer" ? null : { id: q.id, mode: "answer" })} className={q.myAnswers ? plainButton : primaryButton}>
                    {q.myAnswers ? "Change answers" : "Answer"}
                  </button>
                )}
                {isAuthor && (
                  <>
                    <button type="button" aria-pressed={mode === "results"} onClick={() => setOpen(mode === "results" ? null : { id: q.id, mode: "results" })} className={plainButton}>
                      <Icon name="chart-square-linear" className="size-3.5" />
                      Results
                    </button>
                    <IconButton
                      icon="pen-linear"
                      label="Edit questionnaire"
                      onClick={() =>
                        setEditing({
                          id: q.id,
                          nodeId: q.nodeId,
                          title: q.title,
                          intro: q.intro ?? "",
                          questions: q.questions.map((x) => ({ ...x, choicesText: (x.choices ?? []).join("\n") })),
                        })
                      }
                    />
                    <IconButton
                      icon={q.open ? "lock-linear" : "lock-unlocked-linear"}
                      label={q.open ? "Stop taking answers" : "Take answers again"}
                      onClick={() => void run(() => setQuestionnaireOpen(project.id, q.id, !q.open))}
                    />
                    <IconButton
                      icon="trash-bin-minimalistic-linear"
                      label="Delete questionnaire"
                      variant="destructive"
                      onClick={async () => {
                        const ok = await confirm({
                          title: q.responses ? `Delete “${q.title}” and its ${q.responses} ${plural(q.responses, "response")}?` : `Delete “${q.title}”?`,
                          description: q.responses ? "The questions and every answer go for good." : "Its questions go for good. Nobody has answered it yet.",
                        });
                        if (ok) void run(() => deleteQuestionnaire(project.id, q.id));
                      }}
                    />
                  </>
                )}
              </div>
              {mode === "answer" && (
                <AnswerForm
                  key={q.id}
                  questionnaire={q}
                  onDone={(saved) => {
                    setOpen(null);
                    if (saved) changed();
                  }}
                />
              )}
              {mode === "results" && <Results questionnaire={q} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
