"use client";

import { Icon } from "@plotra/icons";
import { IconButton } from "@plotra/ui/components/icon-button";
import { cn } from "@plotra/ui/lib/utils";
import { useEffect, useRef, useState } from "react";
import type { DialogueGraph, DialogueNode } from "@/lib/interactive/model";
import { choose, continuePlay, formatValue, initialVariables, startPlay, type PlayEntry, type PlayState } from "@/lib/interactive/play";
import { scrollBehavior } from "@/lib/motion";

// Play-through preview (plan.md 2.8): walks the dialogue from Start like a game
// would. Lines appear one at a time, choices are buttons, conditions and set
// nodes run and say what they did. Every step is kept, so "back" undoes one.

export function PlayPanel({
  graph,
  speakerName,
  onAt,
  onReveal,
  onClose,
}: {
  /** The dialogue as it is right now. A play-through carries on through edits. */
  graph: DialogueGraph;
  speakerName: (node: Pick<DialogueNode, "speakerId" | "speaker">) => string;
  /** Told which node the play-through stands on, to highlight it. */
  onAt: (nodeId: string | null) => void;
  /** Shows a node on the canvas. */
  onReveal: (nodeId: string) => void;
  onClose: () => void;
}) {
  // Every state so far; the last one is where we are.
  const [steps, setSteps] = useState<PlayState[]>(() => [startPlay(graph)]);
  const state = steps[steps.length - 1];
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onAt(state.at);
  }, [onAt, state.at]);
  useEffect(() => () => onAt(null), [onAt]);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: scrollBehavior() });
  }, [state.transcript.length]);

  const step = (next: PlayState) => next !== state && setSteps([...steps, next]);
  const initial = initialVariables(graph);
  const names = Object.keys(state.variables);

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l bg-background text-ui-sm">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b px-2">
        <Icon name="play-linear" className="ml-1 size-4 text-teal-ink" />
        <p className="flex-1 font-medium">Play-through</p>
        <IconButton icon="undo-left-round-linear" label="Step back" disabled={steps.length < 2} onClick={() => setSteps(steps.slice(0, -1))} />
        <IconButton icon="restart-linear" label="Restart" onClick={() => setSteps([startPlay(graph)])} />
        <IconButton icon="close-linear" label="Close the play-through" onClick={onClose} />
      </div>

      <div ref={scroller} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3">
        {state.transcript.map((entry, i) => (
          <Entry key={i} entry={entry} speakerName={speakerName} onReveal={onReveal} />
        ))}
        {state.status === "ended" && (
          <p className="pt-1 text-center text-xs text-muted-foreground">
            {state.ending === "end" ? "The end." : state.ending === "open" ? "The dialogue stops here: nothing follows." : "The play-through can't go on."}
          </p>
        )}
      </div>

      <div className="shrink-0 space-y-1.5 border-t p-3">
        {state.status === "line" && (
          <button
            type="button"
            autoFocus
            onClick={() => step(continuePlay(graph, state))}
            className="flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-primary font-medium text-primary-foreground hover:opacity-90"
          >
            Continue
            <Icon name="alt-arrow-right-linear" className="size-4" />
          </button>
        )}
        {state.status === "choices" &&
          state.options.map((option, i) => (
            <button
              key={option.nodeId}
              type="button"
              onClick={() => step(choose(graph, state, option.nodeId))}
              className="flex min-h-8 w-full items-start gap-2 rounded-md border border-violet/40 px-2.5 py-1.5 text-left hover:bg-violet/10"
            >
              <span className="text-violet-ink">{i + 1}.</span>
              <span className={cn("min-w-0 flex-1 break-words", !option.text && "text-faint")}>{option.text || "Empty choice"}</span>
            </button>
          ))}
        {state.status === "ended" && (
          <button
            type="button"
            onClick={() => setSteps([startPlay(graph)])}
            className="flex h-8 w-full items-center justify-center gap-1.5 rounded-md border hover:bg-accent"
          >
            <Icon name="restart-linear" className="size-4" />
            Play again
          </button>
        )}
      </div>

      <div className="max-h-48 shrink-0 overflow-y-auto border-t p-3">
        <p className="mb-1.5 text-meta font-medium text-muted-foreground">Variables</p>
        {names.length === 0 ? (
          <p className="text-xs text-muted-foreground">None declared.</p>
        ) : (
          <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 font-mono text-xs">
            {names.map((name) => {
              const changed = !Object.hasOwn(initial, name) || initial[name] !== state.variables[name];
              return (
                <div key={name} className="contents">
                  <dt className="truncate text-muted-foreground">{name}</dt>
                  <dd className={cn("text-right", changed && "font-semibold text-teal-ink")}>
                    {formatValue(state.variables[name])}
                    {changed && <span className="sr-only"> (changed)</span>}
                  </dd>
                </div>
              );
            })}
          </dl>
        )}
      </div>
    </aside>
  );
}

function Entry({
  entry,
  speakerName,
  onReveal,
}: {
  entry: PlayEntry;
  speakerName: (node: Pick<DialogueNode, "speakerId" | "speaker">) => string;
  onReveal: (nodeId: string) => void;
}) {
  const reveal = () => entry.nodeId && onReveal(entry.nodeId);
  switch (entry.kind) {
    case "line": {
      const speaker = speakerName(entry);
      return (
        <button type="button" onClick={reveal} title="Show on the canvas" className="block w-full rounded-md bg-muted px-2.5 py-1.5 text-left">
          {speaker && <span className="block text-meta font-semibold text-ember-ink">{speaker}</span>}
          <span className={cn("break-words whitespace-pre-wrap", !entry.text && "text-faint")}>{entry.text || "Empty line"}</span>
        </button>
      );
    }
    case "choice":
      return (
        <button
          type="button"
          onClick={reveal}
          title="Show on the canvas"
          className="ml-8 block w-[calc(100%-2rem)] rounded-md bg-violet/15 px-2.5 py-1.5 text-right break-words"
        >
          {entry.text || "Empty choice"}
        </button>
      );
    case "set":
      return (
        <button type="button" onClick={reveal} className="block w-full truncate text-center font-mono text-meta text-muted-foreground">
          {entry.text}
        </button>
      );
    case "condition":
      return (
        <button type="button" onClick={reveal} className="block w-full truncate text-center font-mono text-meta text-muted-foreground">
          {entry.text} → <span className={entry.result ? "text-teal-ink" : "text-rose-ink"}>{String(entry.result)}</span>
        </button>
      );
    case "flow":
      return (
        <button type="button" onClick={reveal} className="block w-full truncate text-center text-meta text-muted-foreground">
          {entry.text}
        </button>
      );
    case "problem":
      return (
        <button type="button" onClick={reveal} className="flex w-full items-start gap-1.5 rounded-md bg-destructive/10 px-2.5 py-1.5 text-left text-xs text-destructive">
          <Icon name="danger-triangle-linear" className="mt-px size-3.5 shrink-0" />
          <span className="min-w-0 break-words">{entry.text}</span>
        </button>
      );
  }
}
