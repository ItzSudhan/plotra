"use client";

import { cn } from "@plotra/ui/lib/utils";
import { Fragment, type ReactNode } from "react";

// The agent answers in Markdown (lib/agent/prompt.ts). This renders the small
// part of it an answer uses: paragraphs, headings, lists, quotes, code, bold
// and italics, and links. A link written `[Title](note:ID)` opens that note,
// which is how answers point at the notes they used (plan.md 2.11).
//
// Written by hand rather than pulled in: nothing here sets HTML from a string,
// so whatever a model writes can only ever become text and these few elements.

export type NoteLookup = {
  /** The note's current title, or null when it isn't in the project (any more). */
  title: (id: string) => string | null;
  /** A note by its exact title, for `[[Title]]`. */
  byTitle: (title: string) => string | null;
  open: (id: string) => void;
};

const INLINE = /(`[^`\n]+`)|\[([^\]\n]+)\]\(([^)\s]+)\)|\[\[([^\]\n]+)\]\]|(\*\*|__)(?=\S)([\s\S]+?)(?<=\S)\5|(\*|_)(?=\S)([^*_\n]+?)(?<=\S)\7/g;

function NoteLink({ id, label, notes }: { id: string; label: string; notes: NoteLookup }) {
  // A link to a note that isn't there stays text: the model may have made the id up.
  if (notes.title(id) === null) return <>{label}</>;
  return (
    <button
      type="button"
      onClick={() => notes.open(id)}
      title={`Open ${notes.title(id)}`}
      className="inline rounded-sm text-left font-medium text-ember-ink underline decoration-ember/30 underline-offset-2 hover:decoration-ember"
    >
      {label}
    </button>
  );
}

function inline(text: string, notes: NoteLookup, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const key = `${keyPrefix}-${n++}`;
    const [whole, code, linkText, href, wiki, , strong, , em] = match;
    if (code) out.push(<code key={key} className="rounded bg-muted px-1 py-px font-mono text-[0.92em]">{code.slice(1, -1)}</code>);
    else if (linkText && href) {
      if (href.startsWith("note:")) out.push(<NoteLink key={key} id={href.slice(5)} label={linkText} notes={notes} />);
      else if (/^https?:\/\//i.test(href)) {
        out.push(
          <a key={key} href={href} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2 hover:text-foreground">
            {linkText}
          </a>,
        );
      } else out.push(linkText);
    } else if (wiki) {
      const id = notes.byTitle(wiki.split("|")[0].trim());
      out.push(id ? <NoteLink key={key} id={id} label={wiki.split("|").at(-1)!.trim()} notes={notes} /> : whole);
    } else if (strong) out.push(<strong key={key} className="font-semibold text-foreground">{inline(strong, notes, key)}</strong>);
    else if (em) out.push(<em key={key}>{inline(em, notes, key)}</em>);
    else out.push(whole);
    last = match.index + whole.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block =
  | { type: "p"; text: string }
  | { type: "h"; level: number; text: string }
  | { type: "ul" | "ol"; items: string[] }
  | { type: "quote"; text: string }
  | { type: "code"; text: string }
  | { type: "hr" };

function blocks(source: string): Block[] {
  const out: Block[] = [];
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) out.push({ type: "p", text: paragraph.join("\n") });
    paragraph = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      flush();
      const body: string[] = [];
      // An unclosed fence (the answer is still streaming) runs to the end.
      for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) body.push(lines[i]);
      out.push({ type: "code", text: body.join("\n") });
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      out.push({ type: "h", level: heading[1].length, text: heading[2] });
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush();
      out.push({ type: "hr" });
      continue;
    }
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flush();
      const type = bullet ? "ul" : "ol";
      const previous = out.at(-1);
      if (previous?.type === type) previous.items.push((bullet ?? numbered)![1]);
      else out.push({ type, items: [(bullet ?? numbered)![1]] });
      continue;
    }
    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote) {
      flush();
      const previous = out.at(-1);
      if (previous?.type === "quote") previous.text += `\n${quote[1]}`;
      else out.push({ type: "quote", text: quote[1] });
      continue;
    }
    // An indented line under a list item continues it.
    const previous = out.at(-1);
    if (!paragraph.length && /^\s{2,}\S/.test(line) && (previous?.type === "ul" || previous?.type === "ol")) {
      previous.items[previous.items.length - 1] += ` ${line.trim()}`;
      continue;
    }
    paragraph.push(line);
  }
  flush();
  return out;
}

export function Markdown({ text, notes, className }: { text: string; notes: NoteLookup; className?: string }) {
  return (
    <div className={cn("grid gap-2 text-ui-sm leading-relaxed [overflow-wrap:anywhere]", className)}>
      {blocks(text).map((block, i) => {
        const key = `b${i}`;
        switch (block.type) {
          case "h":
            return (
              <p key={key} className={cn("font-semibold text-foreground", block.level <= 2 && "text-sm")}>
                {inline(block.text, notes, key)}
              </p>
            );
          case "ul":
          case "ol": {
            const List = block.type;
            return (
              <List key={key} className={cn("grid gap-1 pl-5", block.type === "ul" ? "list-disc" : "list-decimal")}>
                {block.items.map((item, j) => (
                  <li key={j} className="pl-0.5 marker:text-faint">
                    {inline(item, notes, `${key}-${j}`)}
                  </li>
                ))}
              </List>
            );
          }
          case "quote":
            return (
              <blockquote key={key} className="border-l-2 border-border pl-3 text-muted-foreground italic">
                {inline(block.text, notes, key)}
              </blockquote>
            );
          case "code":
            return (
              <pre key={key} className="overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs leading-relaxed">
                {block.text}
              </pre>
            );
          case "hr":
            return <hr key={key} className="border-border" />;
          default:
            return (
              <p key={key}>
                {block.text.split("\n").map((line, j) => (
                  <Fragment key={j}>
                    {j > 0 && <br />}
                    {inline(line, notes, `${key}-${j}`)}
                  </Fragment>
                ))}
              </p>
            );
        }
      })}
    </div>
  );
}
