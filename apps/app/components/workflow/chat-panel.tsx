"use client";

import { Icon } from "@plotra/icons";
import { confirm } from "@plotra/ui/components/dialogs";
import { IconButton } from "@plotra/ui/components/icon-button";
import { cn } from "@plotra/ui/lib/utils";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useStore } from "@/components/workspace/stores";
import { useUi, useWorkspace } from "@/components/workspace/workspace-provider";
import { chatNotice } from "@/lib/chat";
import { deleteChatMessage, sendChat, type ChatMessageRow } from "@/lib/chat-actions";
import { errorText } from "@/lib/errors";
import { read } from "@/lib/read";
import { Body, Composer } from "./comments-panel";
import { Avatar, sharedResource, timeAgo, usePeople } from "./data";

// Chat beside the page (beat-the-competitors.md step 8, lib/chat-actions.ts):
// the project's conversation, or the open note's, in the inspector. A message
// sent here is announced to everyone in the project through presence, and
// their chats refresh at once.

const useChatResource = sharedResource<ChatMessageRow[]>();

export function ChatPanel() {
  const { project, user, notify, activeNodeId, binder, setUi } = useWorkspace();
  const { chatScope } = useUi();
  const { index } = useStore(binder);
  const active = useStore(activeNodeId);
  const note = active ? index.byId.get(active) : undefined;
  const scope = chatScope === "note" && note ? note.id : null;
  const { data: messages, refresh } = useChatResource(`${project.id}/${scope ?? "project"}`, () => read("listChat", project.id, scope), chatNotice(scope));
  const people = usePeople();
  const canTalk = (scope ? note?.actions : project.actions)?.includes("comment") ?? false;
  const manages = project.actions.includes("manage");
  const end = useRef<HTMLDivElement>(null);

  // The newest message in view, as in any chat.
  const count = messages?.length ?? 0;
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [count, scope]);

  const send = async (text: string) => {
    await sendChat(project.id, scope, text);
    refresh();
    notify(chatNotice(scope));
  };
  const remove = async (id: string) => {
    if (!(await confirm({ title: "Delete this message?", description: "It's removed for everyone in the chat. This can't be undone." }))) return;
    try {
      await deleteChatMessage(project.id, id);
      refresh();
      notify(chatNotice(scope));
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  // Messages a minute or two apart from the same person sit together under one name.
  const grouped = (messages ?? []).map((m, i, all) => {
    const before = all[i - 1];
    const joined = before && before.authorId === m.authorId && new Date(m.createdAt).getTime() - new Date(before.createdAt).getTime() < 3 * 60_000;
    return { ...m, joined };
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div role="radiogroup" aria-label="Which chat" className="flex shrink-0 gap-1 border-b border-sidebar-border px-3 py-2">
        {(["project", "note"] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={chatScope === s}
            disabled={s === "note" && !note}
            onClick={() => setUi({ chatScope: s })}
            className={cn("h-8 min-w-0 truncate rounded-md px-2 text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-foreground disabled:opacity-40", chatScope === s && "bg-sidebar-accent text-foreground")}
          >
            {s === "project" ? "Project" : note ? `This note: ${note.title}` : "This note"}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {messages === null ? (
          <p className="py-6 text-center text-xs text-faint">Loading…</p>
        ) : messages.length === 0 ? (
          <div className="grid place-items-center py-10 text-center">
            <Icon name="chat-dots-linear" className="size-6 text-faint" />
            <p className="mt-2 text-ui-sm text-muted-foreground">{scope ? "Nothing said about this note yet." : "Nothing said in this project yet."}</p>
            <p className="mt-1 max-w-56 text-xs text-faint">Talk here about the work. Comments are for the words themselves. Type @ and a name to tell someone.</p>
          </div>
        ) : (
          <ol className="grid">
            {grouped.map((m) => {
              const author = m.authorId ? people.get(m.authorId) : undefined;
              const mine = m.authorId === user.id;
              return (
                <li key={m.id} className={cn("group/message relative flex gap-2", m.joined ? "mt-0.5" : "mt-3 first:mt-0")}>
                  {m.joined ? <span className="w-6 shrink-0" /> : <Avatar person={author} className="mt-0.5 size-6" />}
                  <div className="min-w-0 flex-1">
                    {!m.joined && (
                      <p className="flex items-baseline gap-1.5 text-xs">
                        <span className="font-medium">{author?.name ?? "Someone"}</span>
                        <span className="text-faint" title={new Date(m.createdAt).toLocaleString()}>
                          {timeAgo(m.createdAt)}
                        </span>
                      </p>
                    )}
                    <Body text={m.body} people={people} />
                  </div>
                  {(mine || manages) && (
                    <IconButton
                      icon="trash-bin-minimalistic-linear"
                      label="Delete message"
                      size="xs"
                      variant="destructive"
                      onClick={() => void remove(m.id)}
                      className="absolute top-0 right-0 opacity-0 group-focus-within/message:opacity-100 group-hover/message:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
                    />
                  )}
                </li>
              );
            })}
          </ol>
        )}
        <div ref={end} />
      </div>

      <div className="shrink-0 border-t border-sidebar-border p-3">
        {canTalk ? (
          <Composer key={scope ?? "project"} placeholder={scope ? "Message about this note…" : "Message the project…"} submitLabel="Send" sendOnEnter onSubmit={send} />
        ) : (
          <p className="text-center text-xs text-faint">You can read this chat. Commenters and editors can write in it.</p>
        )}
      </div>
    </div>
  );
}
