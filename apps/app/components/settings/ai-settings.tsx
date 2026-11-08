"use client";

import { aiProviders, type AiProvider } from "@plotra/db/schema";
import { Icon } from "@plotra/icons";
import { Button } from "@plotra/ui/components/button";
import { Input } from "@plotra/ui/components/input";
import { Label } from "@plotra/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@plotra/ui/components/select";
import { cn } from "@plotra/ui/lib/utils";
import { useEffect, useState, useSyncExternalStore } from "react";
import { removeAiSettings, saveAiSettings, testAiSettings, whereModelRuns, type AiSettingsInput } from "@/lib/agent-actions";
import { blockedFromPage, readBrowserKey, writeBrowserKey } from "@/lib/agent/browser-key";
import type { AiSettingsView } from "@/lib/agent/settings";
import { OLLAMA_URL, providerMeta } from "@/lib/agent/types";
import { errorText } from "@/lib/errors";
import { ConfirmDialog } from "./confirm-dialog";
import { Section } from "./ui";
import { useRun } from "./use-run";

// Settings → AI for one person (plan.md 2.11 "Whose model"): the provider they
// chose, their key, and the two models. The key goes to the server once, is
// stored encrypted, and never comes back: this page only ever knows its last
// four characters.
//
// A model on the writer's own machine or network is the exception (plan.md
// 2.11 "Local model"): where the server can't call it, this browser does. Its
// key, if it has one, stays in this browser and is never sent to the server,
// and "Test" is run from here too.

/**
 * Addresses that only exist on the writer's own machine or network. A first
 * guess, for what the form says while it is typed in: the server decides
 * (`whereModelRuns`) before anything is saved or tested.
 */
const looksLocal = (url: string) =>
  /^https?:\/\/(localhost|127\.|0\.0\.0\.0|10\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[(::1|f[cde])|[^/.:]+(:\d+)?(\/|$)|[^/:]+\.(localhost|local|localdomain|internal|intranet|lan|home|corp)(:\d+)?(\/|$))/i.test(
    url.trim(),
  );

/** This page's origin: what a model server has to be told to accept. Empty until the page is in a browser. */
const useOrigin = () =>
  useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );

/** Technical setup, folded away: most writers never need it, whoever runs the server does. */
function ServerDetails({ summary = "Details for whoever runs this server", children }: { summary?: string; children: React.ReactNode }) {
  return (
    <details className="group text-xs">
      <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1 rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <Icon name="alt-arrow-right-linear" className="size-3.5 transition-transform group-open:rotate-90" />
        {summary}
      </summary>
      <div className="mt-1 grid gap-1 pl-4.5">{children}</div>
    </details>
  );
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-ui-sm">
        {label}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function AiSettings({ view }: { view: AiSettingsView }) {
  const { run, pending } = useRun();
  const saved = view.saved;
  const [provider, setProvider] = useState<AiProvider>(saved?.provider ?? "anthropic");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(saved?.baseUrl ?? "");
  const [agentModel, setAgentModel] = useState(saved?.agentModel ?? "");
  const [fastModel, setFastModel] = useState(saved?.fastModel ?? "");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const meta = providerMeta[provider];
  // The saved key belongs to the provider it was saved for.
  const keptKey = saved?.provider === provider && saved.hasKey && saved.keyReadable;
  // On a server that can't call private addresses, a model at one is called by this browser instead.
  const local = meta.baseUrl && !view.privateUrlsAllowed && (baseUrl.trim() ? looksLocal(baseUrl) : provider === "ollama");
  // Where that model is: Ollama with no URL is on this machine.
  const url = baseUrl.trim() || (provider === "ollama" ? OLLAMA_URL : "");
  const origin = useOrigin();
  const blocked = local && origin ? blockedFromPage(url, new URL(origin).protocol) : null;
  // The key for a model this browser calls is kept here, not on the server.
  const [browserKey, setBrowserKey] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads localStorage after mount
    setBrowserKey(local && readBrowserKey(url) !== null);
  }, [local, url]);
  const input: AiSettingsInput = { provider, apiKey, baseUrl: meta.baseUrl ? baseUrl : null, agentModel, fastModel };
  const ready = agentModel.trim() !== "" && (meta.key === "optional" || apiKey.trim() !== "" || keptKey) && (provider !== "compatible" || baseUrl.trim() !== "");

  /** Asked of the server before a key goes anywhere: it knows which addresses it may call. */
  const calledFromBrowser = async () => meta.baseUrl && !view.privateUrlsAllowed && (await whereModelRuns({ provider, baseUrl: input.baseUrl })) === "browser";

  const test = async () => {
    setTesting(true);
    setResult(null);
    try {
      if (await calledFromBrowser()) {
        // From this page, as a run would be: the server can't reach it, and the key isn't the server's to have.
        const { testBrowserModel } = await import("@/lib/agent/browser-model");
        setResult(await testBrowserModel({ provider, baseUrl: url, agentModel: agentModel.trim(), fastModel: fastModel.trim() || agentModel.trim() }, apiKey.trim() || readBrowserKey(url)));
      } else setResult(await testAiSettings(input));
    } catch (error) {
      setResult({ ok: false, message: errorText(error) });
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    if (!(await calledFromBrowser())) return saveAiSettings(input);
    // The key stays in this browser: what is saved on the server is only where the model is and what it is called.
    await saveAiSettings({ ...input, apiKey: "" });
    if (apiKey.trim()) writeBrowserKey(url, apiKey);
    setBrowserKey(readBrowserKey(url) !== null);
  };

  if (!view.byokAvailable) {
    return (
      <Section title="Your model" description="The model AI runs on when you use it.">
        <div className="grid gap-2 rounded-lg border border-dashed px-4 py-6 text-ui-sm text-muted-foreground">
          <p className="text-foreground">This server isn&apos;t set up for personal AI keys yet.</p>
          <p>Ask whoever runs it to switch them on.</p>
          <ServerDetails>
            <p>
              Set <code className="rounded bg-muted px-1 font-mono text-xs">AI_KEY_SECRET</code>, which is what keys are encrypted with.
            </p>
          </ServerDetails>
          {view.instance && <InstanceLine instance={view.instance} />}
        </div>
      </Section>
    );
  }

  return (
    <div className="grid gap-10">
      <Section
        title="Your model"
        description="AI in Plotra runs on a model you bring. Your key is stored encrypted, used only on the server for your own runs, and never shown again or shared with anyone you work with."
      >
        <form
          className="grid gap-4 rounded-lg border bg-card p-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const done = await run(save, "Saved.");
            if (done) {
              setApiKey("");
              setResult(null);
            }
          }}
        >
          <Field id="ai-provider" label="Provider" hint={meta.help}>
            <Select
              value={provider}
              onValueChange={(value) => {
                setProvider(value as AiProvider);
                setResult(null);
                // A key typed for one provider must not be sent to another.
                setApiKey("");
              }}
            >
              <SelectTrigger id="ai-provider" size="sm" className="w-full text-ui-sm sm:w-80">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {aiProviders.map((id) => (
                  <SelectItem key={id} value={id}>
                    {providerMeta[id].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {meta.baseUrl && (
            <Field
              id="ai-url"
              label="Web address of the model"
              hint={
                local ? (
                  <span className="grid gap-1">
                    <span>
                      <span className="text-foreground">Your browser calls this model directly.</span> This server can&apos;t reach your machine, so the request goes from this
                      page to that address and never passes through Plotra. Chats and inline actions work this way; long jobs don&apos;t.
                    </span>
                    <span>The model has to be told to accept this site, or nothing comes back.</span>
                    <ServerDetails summary="How to set up the model">
                      {provider === "ollama" ? (
                        <span>
                          Start Ollama with <code className="rounded bg-muted px-1 font-mono text-meta text-foreground">OLLAMA_ORIGINS={origin || "this site's address"}</code>, and
                          with <code className="rounded bg-muted px-1 font-mono text-meta text-foreground">OLLAMA_CONTEXT_LENGTH=32768</code> or more so the agent&apos;s tools fit.
                        </span>
                      ) : (
                        <span>
                          It needs to allow requests from <span className="font-mono text-meta text-foreground">{origin || "this site's address"}</span> (CORS).
                        </span>
                      )}
                    </ServerDetails>
                    {blocked && (
                      <span className="text-foreground">
                        <Icon name="danger-circle-linear" className="mr-1 inline size-3.5 align-[-2px] text-ember-ink" />
                        {blocked}
                      </span>
                    )}
                  </span>
                ) : (
                  "Its API address, usually ending in /v1."
                )
              }
            >
              <Input
                id="ai-url"
                type="url"
                inputMode="url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={meta.baseUrlPlaceholder}
                autoComplete="off"
                spellCheck={false}
                className="h-8 font-mono text-xs"
              />
            </Field>
          )}

          <Field
            id="ai-key"
            label={meta.key === "optional" ? "API key (if the endpoint needs one)" : "API key"}
            hint={
              local ? (
                browserKey ? (
                  "A key is saved in this browser. Leave this empty to keep it. It is never sent to Plotra."
                ) : (
                  "Kept in this browser only, and sent only to the model. It is never sent to Plotra."
                )
              ) : keptKey ? (
                <>
                  A key ending in <span className="font-mono text-foreground">{saved.keyLastFour ? `…${saved.keyLastFour}` : "…"}</span> is saved. Leave this empty to keep it.
                </>
              ) : saved?.hasKey && !saved.keyReadable && saved.provider === provider ? (
                <span className="text-foreground">The saved key can&apos;t be read any more. Enter it again.</span>
              ) : undefined
            }
          >
            <Input
              id="ai-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={(local ? browserKey : keptKey) ? "Enter a new key to replace the saved one" : "Paste your key"}
              autoComplete="off"
              spellCheck={false}
              className="h-8 font-mono text-xs"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="ai-agent-model" label="Model for the agent" hint="Answers questions about the project. Use a capable model: it has to be able to use tools, as most large recent ones can.">
              <Input
                id="ai-agent-model"
                required
                value={agentModel}
                onChange={(e) => setAgentModel(e.target.value)}
                placeholder={`e.g. ${meta.agentModelPlaceholder}`}
                autoComplete="off"
                spellCheck={false}
                className="h-8 font-mono text-xs"
              />
            </Field>
            <Field id="ai-fast-model" label="Model for inline actions" hint="Continue, rewrite, shorten, expand. A smaller, cheaper model is fine. Empty uses the agent's.">
              <Input
                id="ai-fast-model"
                value={fastModel}
                onChange={(e) => setFastModel(e.target.value)}
                placeholder={`e.g. ${meta.fastModelPlaceholder}`}
                autoComplete="off"
                spellCheck={false}
                className="h-8 font-mono text-xs"
              />
            </Field>
          </div>

          {saved?.problem && saved.provider === provider && <p className="rounded-md bg-muted px-3 py-2 text-ui-sm">{saved.problem}</p>}

          {result && (
            <p role="status" className={cn("flex items-start gap-1.5 rounded-md px-3 py-2 text-ui-sm", result.ok ? "bg-teal/10 text-foreground" : "bg-destructive/10 text-foreground")}>
              <Icon name={result.ok ? "check-circle-linear" : "danger-circle-linear"} className={cn("mt-0.5 size-4 shrink-0", result.ok ? "text-teal-ink" : "text-destructive")} />
              {result.message}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" disabled={pending || !ready}>
              Save
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={testing || !ready} onClick={() => void test()}>
              <Icon name="test-tube-linear" />
              {testing ? "Testing…" : "Test"}
            </Button>
            <span className="text-xs text-muted-foreground">{local ? "Test makes one tiny call to each model, from this browser." : "Test makes one tiny call to each model, on your key."}</span>
            {saved && (
              <ConfirmDialog
                trigger={
                  <Button type="button" size="sm" variant="ghost" className="ml-auto text-muted-foreground">
                    <Icon name="trash-bin-minimalistic-linear" />
                    Remove
                  </Button>
                }
                title="Remove your AI settings?"
                description="Your key and models are deleted from Plotra. AI stops working for you until you add them again. Nothing changes at your provider."
                confirmLabel="Remove"
                onConfirm={async () => {
                  const done = await run(() => removeAiSettings(), "Removed.");
                  if (done) {
                    // And the key this browser kept for a model of its own.
                    writeBrowserKey("", null);
                    setApiKey("");
                    setBaseUrl("");
                    setAgentModel("");
                    setFastModel("");
                    setResult(null);
                  }
                }}
              />
            )}
          </div>
        </form>
        {view.instance && (
          <p className="text-ui-sm text-muted-foreground">
            <InstanceLine instance={view.instance} /> {saved ? "Your own settings above are used instead." : "It is used until you add your own."}
          </p>
        )}
      </Section>

      <Section title="What this means" description="AI is opt-in, per workspace and per project.">
        <ul className="grid gap-2 rounded-lg border bg-card p-4 text-ui-sm text-muted-foreground">
          <li>
            <span className="text-foreground">It costs what your provider charges you.</span> Plotra adds nothing and has no model of its own. Each run shows the tokens it used.
          </li>
          <li>
            <span className="text-foreground">Text leaves Plotra only when you use AI,</span> and only to the provider you chose here: the notes the agent reads, or the passage you
            select.
          </li>
          <li>
            <span className="text-foreground">A model on your own machine is called by your browser.</span> What the agent reads goes from this browser to that model and to no
            provider. Plotra&apos;s server still runs the agent&apos;s tools and keeps the conversation, as it does for any run.
          </li>
          <li>
            <span className="text-foreground">It only appears where it has been switched on:</span> by the workspace&apos;s owner, and then per project.
          </li>
        </ul>
      </Section>
    </div>
  );
}

function InstanceLine({ instance }: { instance: NonNullable<AiSettingsView["instance"]> }) {
  return (
    <>
      This server provides a model for everyone: {providerMeta[instance.provider].label}, <span className="font-mono text-xs">{instance.agentModel}</span>.
    </>
  );
}
