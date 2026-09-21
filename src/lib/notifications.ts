import type { AppNotification } from "@/types/platform";

/** Where clicking a notification should take you. */
export function notificationHref(n: AppNotification): string {
  const link = n.metadata?.link;
  if (typeof link === "string" && link.startsWith("/")) return link;

  switch (n.type) {
    case "like_received":
      return "/likes";
    case "match_created":
      return "/matches";
    case "message_received":
      return typeof n.metadata?.conversationId === "string" ? `/messages/${n.metadata.conversationId}` : "/messages";
    case "profile_viewed":
    case "ai_recommendation":
      return "/discover";
    case "subscription":
      return "/billing";
    case "referral":
      return "/referrals";
    default:
      return "/notifications";
  }
}

/** "3 new messages" style suffix for notifications that merged several events. */
export function notificationCount(n: AppNotification): number {
  const count = n.metadata?.count;
  return typeof count === "number" && count > 1 ? count : 1;
}
