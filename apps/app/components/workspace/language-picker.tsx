"use client";

import { IconButton } from "@plotra/ui/components/icon-button";
import { SuggestInput } from "@plotra/ui/components/suggest-input";
import { cn } from "@plotra/ui/lib/utils";
import { useState } from "react";
import { toast } from "sonner";
import { commonLanguages, languageName, languageOption, parseLanguage } from "./settings-helpers";

// Languages are stored as codes ("fr", "pt-BR") but shown and picked by name.

const UNKNOWN = "That isn't a language Plotra knows. Pick one from the list, or type its code, like ‘pt-BR’.";

const inputClass =
  "h-8 w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 text-ui-sm outline-none placeholder:text-faint focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60";

/** One language, such as the one a project is written in. */
export function LanguagePicker({ id, value, onChange, disabled }: { id?: string; value: string; onChange: (code: string) => void; disabled?: boolean }) {
  const shown = languageOption(value);
  const [text, setText] = useState(shown);
  const [synced, setSynced] = useState(shown);
  if (shown !== synced) {
    setSynced(shown);
    setText(shown);
  }
  const commit = () => {
    if (text.trim() === shown) return;
    const code = parseLanguage(text);
    if (!code) {
      toast.error(UNKNOWN);
      setText(shown);
      return;
    }
    setText(languageOption(code));
    if (code !== value) onChange(code);
  };
  return (
    <SuggestInput
      id={id}
      value={text}
      disabled={disabled}
      suggestions={commonLanguages.map(languageOption)}
      placeholder="Start typing a language"
      onChange={(e) => setText(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), commit())}
      className={inputClass}
    />
  );
}

/** Several languages, such as the ones a project is translated into. */
export function LanguagesPicker({ id, values, onChange, disabled, exclude }: { id?: string; values: string[]; onChange: (codes: string[]) => void; disabled?: boolean; exclude?: string }) {
  const [text, setText] = useState("");
  const add = (typed = text) => {
    if (!typed.trim()) return;
    const code = parseLanguage(typed);
    if (!code) {
      toast.error(UNKNOWN);
      return;
    }
    setText("");
    if (!values.includes(code)) onChange([...values, code]);
  };
  const offered = commonLanguages.filter((code) => !values.includes(code) && code !== exclude).map(languageOption);
  return (
    <div className="grid gap-2">
      {values.length > 0 && (
        <ul aria-label="Languages" className="flex flex-wrap gap-1.5">
          {values.map((code) => (
            <li key={code} className="flex h-8 items-center gap-1 rounded-md bg-muted pr-0.5 pl-2.5 text-ui-sm">
              {languageName(code)}
              <span className="text-meta text-muted-foreground">{code}</span>
              {!disabled && <IconButton icon="close-linear" label={`Remove ${languageName(code)}`} size="xs" onClick={() => onChange(values.filter((v) => v !== code))} />}
            </li>
          ))}
        </ul>
      )}
      {!disabled && (
        <div className="flex gap-2">
          <SuggestInput
            id={id}
            value={text}
            suggestions={offered}
            placeholder="Add a language: French, Japanese, pt-BR…"
            onChange={(e) => {
              // Picking from the list adds it at once.
              if (offered.includes(e.target.value)) add(e.target.value);
              else setText(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            className={cn(inputClass, "flex-1")}
          />
          <button
            type="button"
            disabled={!text.trim()}
            onClick={() => add()}
            className="h-8 shrink-0 rounded-md border px-3 text-ui-sm hover:bg-accent disabled:opacity-50"
          >
            Add
          </button>
        </div>
      )}
      {disabled && values.length === 0 && <p className="text-xs text-muted-foreground">None yet.</p>}
    </div>
  );
}
