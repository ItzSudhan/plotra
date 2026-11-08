"use client";

import { Icon } from "@plotra/icons";
import { Button } from "@plotra/ui/components/button";
import { cn } from "@plotra/ui/lib/utils";
import { useCallback, useEffect, useState } from "react";
import { saveAiSettings, setWorkspaceAi } from "@/lib/agent-actions";
import { errorText } from "@/lib/errors";
import { findOllama } from "@/lib/local-setup-actions";
import type { OllamaFound } from "@/lib/onboarding/ollama";

/** How many of Ollama's models are offered by name; the best of them first. */
const SHOWN = 6;

/**
 * A new library's AI, asked once, after its name. In a library AI runs on a model on this computer or with the
 * person's own key: there's no hosted model. Ollama, when it's running, is
 * found and set up in one click, which also switches AI on for the library.
 * Everything here can be done later in Settings, so "Not now" is always there.
 */
export function LocalAiStep({ workspaceSlug, onDone }: { workspaceSlug: string; onDone: () => void }) {
  const [found, setFound] = useState<OllamaFound | null>(null);
  const [checking, setChecking] = useState(true);
  const [picked, setPicked] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      const next = await findOllama();
      setFound(next);
      setPicked((was) => (was && next.models.includes(was) ? was : next.suggested));
    } catch {
      setFound({ running: false, models: [], suggested: null });
    } finally {
      setChecking(false);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- asks the server once, when the step opens
    void check();
  }, [check]);

  const use = async (model: string) => {
    setSaving(true);
    setError(null);
    try {
      await saveAiSettings({ provider: "ollama", agentModel: model, fastModel: model });
      await setWorkspaceAi(workspaceSlug, true);
      onDone();
    } catch (e) {
      setError(errorText(e));
      setSaving(false);
    }
  };

  const models = found?.models.slice(0, SHOWN) ?? [];

  return (
    <div>
      <h1 className="font-display text-4xl leading-[1.05] tracking-tight text-balance sm:text-5xl">Would you like AI to help?</h1>
      <p className="mt-3 text-muted-foreground">
        Plotra&apos;s assistant answers questions about your story and works on it with you, only when you ask. In a library it runs on a model on this computer, so your words stay
        here.
      </p>

      <div className="mt-8 rounded-lg border bg-card p-5" aria-live="polite" aria-busy={checking}>
        {checking && !found ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Icon name="refresh-linear" className="size-4 animate-spin motion-reduce:animate-none" />
            Looking for Ollama on this computer…
          </p>
        ) : found?.running && models.length > 0 ? (
          <div className="animate-in fade-in-0 duration-300">
            <p className="flex items-center gap-2 font-medium">
              <Icon name="check-circle-linear" className="size-5 text-teal motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:spin-in-[-45deg] motion-safe:duration-500" />
              Ollama is running on this computer
            </p>
            <p className="mt-1 text-sm text-muted-foreground">Choose the model for the assistant. One that calls tools is chosen for you.</p>
            <div role="radiogroup" aria-label="Model" className="mt-4 flex flex-wrap gap-2">
              {models.map((model, i) => (
                <button
                  key={model}
                  type="button"
                  role="radio"
                  aria-checked={picked === model}
                  onClick={() => setPicked(model)}
                  style={{ animationDelay: `${120 + i * 60}ms` }}
                  className={cn(
                    "h-8 rounded-full border px-3 font-mono text-xs text-muted-foreground transition-[color,border-color,background-color,transform] hover:text-foreground active:scale-95 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:fill-mode-backwards",
                    picked === model && "border-ember/60 bg-ember/[0.06] text-foreground",
                  )}
                >
                  {model}
                </button>
              ))}
            </div>
          </div>
        ) : found?.running ? (
          <div className="animate-in fade-in-0 duration-300">
            <p className="font-medium">Ollama is running, but has no models yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Get one in a terminal with <code className="rounded bg-muted px-1 font-mono text-xs text-foreground">ollama pull qwen3:8b</code>, then check again.
            </p>
          </div>
        ) : (
          <div className="animate-in fade-in-0 duration-300">
            <p className="font-medium">No AI on this computer yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              <a href="https://ollama.com/download" target="_blank" rel="noreferrer" className="underline decoration-border underline-offset-4 hover:text-foreground">
                Ollama
              </a>{" "}
              runs models on your own computer, for free. Install it, start it, and check again. Or use a key from a provider, such as Anthropic or OpenAI, in{" "}
              <a href="/settings" target="_blank" className="underline decoration-border underline-offset-4 hover:text-foreground">
                Settings
              </a>
              .
            </p>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-5 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-2">
        {found?.running && picked ? (
          <Button type="button" disabled={saving} onClick={() => void use(picked)}>
            Use {picked}
            <Icon name="arrow-right-linear" />
          </Button>
        ) : (
          <Button type="button" variant="outline" disabled={checking} onClick={() => void check()}>
            <Icon name="refresh-linear" />
            Check again
          </Button>
        )}
        <Button type="button" variant="ghost" disabled={saving} onClick={onDone}>
          Not now
        </Button>
      </div>
      <p className="mt-4 text-xs text-faint">You can change this any time: the model in Settings → AI, and the switch in Workspace settings.</p>
    </div>
  );
}
