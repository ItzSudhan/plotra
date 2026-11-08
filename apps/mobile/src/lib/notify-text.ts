import type { Notification } from "./types";

// What a notification says: the same sentences as the web app's bell
// (apps/app/lib/notify-text.ts). Pure.

export function describe(n: Pick<Notification, "type" | "payload" | "actorName" | "projectTitle">): string {
  const who = n.actorName || "Someone";
  const note = n.payload.title ? `“${n.payload.title}”` : "a note";
  const where = n.projectTitle ? ` in ${n.projectTitle}` : "";
  switch (n.type) {
    case "mention":
      return `${who} mentioned you in a comment on ${note}${where}.`;
    case "reply":
      return `${who} replied to a comment thread on ${note}${where}.`;
    case "shared":
      return `${who} shared ${n.projectTitle ? `“${n.projectTitle}”` : "a project"} with you${n.payload.role ? ` as ${n.payload.role}` : ""}.`;
    case "invite_accepted":
      return `${who} accepted your invitation${n.payload.workspace ? ` to ${n.payload.workspace}` : ""}.`;
    case "review_requested":
      return `${who} asked you to review ${note}${where}.`;
    case "review_decided":
      return n.payload.decision === "approved" ? `${who} approved ${note}${where}.` : `${who} asked for changes to ${note}${where}.`;
    case "chat_mention":
      return n.payload.title ? `${who} mentioned you in the chat on ${note}${where}.` : `${who} mentioned you in the project chat${where}.`;
    case "suggestion_decided":
      return `${who} ${n.payload.decision === "accepted" ? "accepted" : "rejected"} your suggested change to ${note}${where}.`;
    default:
      return `${who} did something${where}.`;
  }
}

/** Comments and chat live on the web: the phone opens the note, and says so. */
export const happensOnWeb = (type: string) => type === "mention" || type === "reply" || type === "chat_mention";
