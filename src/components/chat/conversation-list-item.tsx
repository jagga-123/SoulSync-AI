"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ProfileMedia } from "@/components/shared/profile-media";
import { getInitials, formatRelativeTime } from "@/lib/format";
import type { ConversationListItem as ConversationListItemType } from "@/types/api";

export function ConversationListItem({ item }: { item: ConversationListItemType }) {
  const initials = getInitials(item.user.fullName);
  const hasUnread = item.unreadCount > 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
    >
      <Link
        href={`/messages/${item.conversationId}`}
        className="glass flex items-center gap-4 rounded-2xl p-4 transition-colors hover:border-white/25"
      >
        <ProfileMedia
          src={item.user.profileImage}
          initials={initials}
          thumb
          className="size-14 shrink-0 rounded-full text-base"
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p
              className={`truncate font-display text-sm font-semibold ${
                hasUnread ? "text-white" : "text-white/85"
              }`}
            >
              {item.user.fullName}
            </p>
            <span className="shrink-0 text-xs text-white/60">
              {formatRelativeTime(item.lastMessageAt)}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <p
              className={`truncate text-sm ${
                hasUnread ? "font-medium text-white/80" : "text-white/60"
              }`}
            >
              {item.lastMessage || "Say hello — start the conversation."}
            </p>
            {hasUnread && (
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-gradient-brand text-xs font-semibold text-white">
                {item.unreadCount > 9 ? "9+" : item.unreadCount}
              </span>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
