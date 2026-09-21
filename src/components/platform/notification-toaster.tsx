"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

import { NotificationIcon } from "@/components/platform/notification-icon";
import { usePlatform } from "@/components/platform/platform-provider";
import { notificationHref } from "@/lib/notifications";

/** Live pop-ups for notifications that arrive while the app is open. */
export function NotificationToaster() {
  const { toasts, dismissToast, markRead } = usePlatform();

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end"
    >
      <AnimatePresence>
        {toasts.map(({ id, notification }) => (
          <motion.div
            key={id}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="glass-strong pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl p-3.5 shadow-xl shadow-black/40"
          >
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-gradient-brand text-white">
              <NotificationIcon type={notification.type} />
            </span>
            <Link
              href={notificationHref(notification)}
              onClick={() => {
                void markRead(notification.id);
                dismissToast(id);
              }}
              className="min-w-0 flex-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <p className="truncate text-sm font-semibold text-white">{notification.title}</p>
              <p className="mt-0.5 line-clamp-2 text-xs text-white/60">{notification.message}</p>
            </Link>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => dismissToast(id)}
              className="flex size-6 shrink-0 items-center justify-center rounded-full text-white/50 hover:bg-white/10 hover:text-white"
            >
              <X className="size-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
