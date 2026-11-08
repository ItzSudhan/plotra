import type { ActivityPayload, ActivityVerb, NotificationPayload, NotificationType } from "@plotra/db/schema";
import { count } from "./plural";

// The wording of notifications and activity, in one place: the bell, the
// Activity view, the single email and the digest all say the same thing.

type Notice = { type: NotificationType; payload: NotificationPayload; actorName: string | null; projectTitle: string | null };

/** What happened, as one plain sentence. */
export function describe(n: Notice): string {
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

/** What someone did, to follow their name in the activity feed: "renamed “A” to “B”". */
export function describeActivity(verb: ActivityVerb, payload: ActivityPayload): string {
  const note = payload.title ? `“${payload.title}”` : "a note";
  switch (verb) {
    case "note_created":
      return `created ${note}`;
    case "note_renamed":
      return payload.from ? `renamed “${payload.from}” to ${note}` : `renamed ${note}`;
    case "note_trashed":
      return `moved ${note} to the trash`;
    case "note_restored":
      return `restored ${note} from the trash`;
    case "version_named":
      return `saved the version “${payload.name ?? "unnamed"}” of ${note}`;
    case "version_restored":
      return `restored ${note} to ${payload.name ? `“${payload.name}”` : "an earlier version"}`;
    case "release_cut":
      return `cut the release ${note}${payload.count ? ` (${count(payload.count, "note")})` : ""}`;
    case "comment_added":
      return `commented on ${note}`;
    case "project_shared":
      return `shared the project with ${payload.role === "editor" ? "an editor" : `a ${payload.role ?? "reader"}`}`;
    default:
      return "changed something";
  }
}
