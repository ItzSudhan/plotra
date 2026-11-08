"use client";

import { Icon, type IconName } from "@plotra/icons";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@plotra/ui/components/dropdown-menu";
import { Tooltip } from "@plotra/ui/components/tooltip";
import { cn } from "@plotra/ui/lib/utils";
import type { NotificationType } from "@plotra/db/schema";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { timeAgo } from "@/components/workflow/data";
import { nav } from "@/components/transitions";
import { useStore } from "@/components/workspace/stores";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { markNotificationsRead, type NotificationRow } from "@/lib/notify-actions";
import { describe } from "@/lib/notify-text";
import { useNotifications } from "./data";

// The bell (plan.md 2.6 "notifications"): what other people did that concerns
// you, in every project. Opening one marks it read and takes you to the note.

const icons: Record<NotificationType, IconName> = {
  mention: "chat-round-line-linear",
  reply: "chat-round-line-linear",
  shared: "users-group-two-rounded-linear",
  invite_accepted: "letter-opened-linear",
  review_requested: "clipboard-check-linear",
  review_decided: "clipboard-check-linear",
  suggestion_decided: "pen-new-square-linear",
  chat_mention: "chat-dots-linear",
};

export function NotificationsBell({ className }: { className?: string }) {
  const router = useRouter();
  const { project, binder, openNode, setUi, onNotice } = useWorkspace();
  const { index } = useStore(binder);
  const { data, refresh } = useNotifications();
  const unread = data?.unread ?? 0;

  // Comments and reviews announce themselves to everyone in the project: look
  // again when they do, and when the tab is looked at again.
  useEffect(() => {
    const unsub = onNotice((notice) => (notice.startsWith("comments:") || notice === "reviews") && refresh());
    window.addEventListener("focus", refresh);
    return () => {
      unsub();
      window.removeEventListener("focus", refresh);
    };
  }, [onNotice, refresh]);

  const markRead = (id: string | null) => {
    void markNotificationsRead(id)
      .catch(() => {})
      .finally(refresh);
  };

  const openItem = (n: NotificationRow) => {
    if (!n.readAt) markRead(n.id);
    if (n.projectId === project.id) {
      // A mention in the project's chat has no note: it opens the chat.
      if (n.payload.chat && !n.nodeId) return setUi({ right: true, rightTab: "chat", chatScope: "project" });
      if (n.nodeId && index.byId.has(n.nodeId)) {
        openNode(n.nodeId, "tab");
        if (n.payload.chat) setUi({ right: true, rightTab: "chat", chatScope: "note" });
        else if (n.payload.threadId) setUi({ right: true, rightTab: "comments", activeThreadId: n.payload.threadId });
        else if (n.type === "review_requested" || n.type === "review_decided") setUi({ right: true, rightTab: "properties" });
      }
      return;
    }
    if (n.workspaceSlug && n.projectSlug) router.push(`/w/${n.workspaceSlug}/p/${n.projectSlug}${n.nodeId ? `?open=${n.nodeId}` : ""}`, { transitionTypes: nav.open });
    else if (n.payload.workspaceSlug) router.push(`/w/${n.payload.workspaceSlug}`, { transitionTypes: nav.close });
  };

  const label = unread ? `Notifications, ${unread} unread` : "Notifications";

  return (
    <DropdownMenu onOpenChange={(open) => open && refresh()}>
      <Tooltip content={label}>
        <DropdownMenuTrigger
          aria-label={label}
          className={cn(
            "relative grid size-6 shrink-0 place-items-center after:absolute after:-inset-1 after:content-[''] pointer-coarse:size-10 rounded-md text-muted-foreground outline-none hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
            className,
          )}
        >
          <Icon name="bell-linear" className="size-4" />
          {unread > 0 && (
            <span aria-hidden className="absolute -top-1.5 -right-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-ember-ink px-1 text-meta leading-none font-semibold text-white dark:text-background">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-[min(22rem,calc(100vw-1rem))] p-0">
        <div className="flex h-10 items-center justify-between border-b px-3">
          <span className="text-ui-sm font-medium">Notifications</span>
          {unread > 0 && (
            <button
              type="button"
              onClick={() => markRead(null)}
              className="h-8 rounded px-2 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              Mark all as read
            </button>
          )}
        </div>
        <div className="max-h-[min(60vh,26rem)] overflow-y-auto p-1">
          {!data ? (
            <div className="m-2 h-12 animate-pulse rounded-md bg-muted" aria-busy aria-label="Loading notifications" />
          ) : data.items.length === 0 ? (
            <p className="px-3 py-8 text-center text-ui-sm text-muted-foreground">Nothing yet. Mentions, replies, shares and review requests show up here.</p>
          ) : (
            data.items.map((n) => (
              <DropdownMenuItem key={n.id} onSelect={() => openItem(n)} className="items-start gap-2.5 py-2">
                <Icon name={icons[n.type] ?? "bell-linear"} className={cn("mt-0.5 size-4 shrink-0", n.readAt ? "text-muted-foreground" : "text-ember-ink")} />
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className={cn("text-ui-sm leading-snug whitespace-normal", n.readAt ? "text-muted-foreground" : "text-foreground")}>
                    {describe({ ...n, projectTitle: n.projectId === project.id ? null : n.projectTitle })}
                  </span>
                  <span className="text-xs text-muted-foreground">{timeAgo(n.createdAt)}</span>
                </span>
                {!n.readAt && (
                  <>
                    <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-ember" />
                    <span className="sr-only">Unread</span>
                  </>
                )}
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
