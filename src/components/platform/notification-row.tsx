"use client";

import Link from "next/link";
import { Trash2 } from "lucide-react";

import { NotificationIcon } from "@/components/platform/notification-icon";
import { formatRelativeTime } from "@/lib/format";
import { notificationCount, notificationHref } from "@/lib/notifications";
import { cn } from "@/lib/utils";
import type { AppNotification } from "@/types/platform";

interface NotificationRowProps {
  notification: AppNotification;
  onOpen: (notification: AppNotification) => void;
  onDelete?: (notification: AppNotification) => void;
  compact?: boolean;
}

export function NotificationRow({ notification, onOpen, onDelete, compact = false }: NotificationRowProps) {
  const count = notificationCount(notification);

  return (
    <div
      className={cn(
        "group relative flex items-start gap-3 transition-colors hover:bg-white/[0.04]",
        compact ? "px-4 py-3" : "rounded-2xl px-4 py-4",
        !notification.isRead && "bg-primary/[0.06]",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex shrink-0 items-center justify-center rounded-xl",
          compact ? "size-8" : "size-10",
          notification.isRead ? "bg-white/5 text-white/50 ring-1 ring-white/10" : "bg-gradient-brand text-white",
        )}
      >
        <NotificationIcon type={notification.type} className={compact ? "size-4" : "size-[18px]"} />
      </span>

      <Link
        href={notificationHref(notification)}
        onClick={() => onOpen(notification)}
        className="min-w-0 flex-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <div className="flex items-baseline gap-2">
          <p className={cn("truncate text-sm", notification.isRead ? "font-medium text-white/75" : "font-semibold text-white")}>
            {notification.title}
          </p>
          {count > 1 && (
            <span className="shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-xs font-semibold text-white/70">×{count}</span>
          )}
        </div>
        <p className={cn("mt-0.5 text-xs leading-relaxed text-white/55", compact ? "line-clamp-2" : "line-clamp-3")}>
          {notification.message}
        </p>
      </Link>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="text-xs tabular-nums text-white/60">{formatRelativeTime(notification.updatedAt)}</span>
        {!notification.isRead && <span role="img" aria-label="Unread" className="size-2 rounded-full bg-accent" />}
        {onDelete && (
          <button
            type="button"
            aria-label="Delete notification"
            onClick={() => onDelete(notification)}
            className="flex size-6 items-center justify-center rounded-full text-white/60 opacity-0 transition hover:bg-white/10 hover:text-white focus-visible:opacity-100 group-hover:opacity-100"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
