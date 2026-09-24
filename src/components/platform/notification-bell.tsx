"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, BellOff, CheckCheck, Loader2 } from "lucide-react";

import { NotificationRow } from "@/components/platform/notification-row";
import { usePlatform } from "@/components/platform/platform-provider";
import { useDismiss } from "@/hooks/use-dismiss";

/** The navbar bell: unread badge, live updates, and a quick-look dropdown. */
export function NotificationBell() {
  const { unreadCount, recent, isLoadingRecent, loadRecent, markRead, markAllRead, removeNotification } = usePlatform();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  useEffect(() => close(), [pathname, close]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) void loadRecent();
  }

  const badge = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    // On phones the dropdown spans the screen (anchored to the navbar, not the bell, which sits near the
    // right edge and would push a 22rem panel off-screen); from `sm` up it's a popover under the bell.
    <div ref={ref} className="sm:relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-haspopup="true"
        aria-expanded={open}
        className="relative flex size-11 items-center justify-center rounded-full text-white/75 transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
      >
        <Bell className="size-[18px]" />
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              key="badge"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -right-0.5 -top-0.5 flex min-w-[18px] items-center justify-center rounded-full bg-gradient-brand px-1 text-xs font-bold leading-[18px] text-white ring-2 ring-background"
            >
              {badge}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="glass-strong absolute inset-x-4 top-full z-50 mt-3 overflow-hidden rounded-2xl shadow-2xl shadow-black/50 sm:inset-x-auto sm:right-0 sm:w-[22rem]"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <p className="font-display text-sm font-semibold text-white">Notifications</p>
              <button
                type="button"
                onClick={() => void markAllRead()}
                disabled={unreadCount === 0}
                className="flex items-center gap-1 text-xs font-medium text-accent transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:text-white/60"
              >
                <CheckCheck className="size-3.5" />
                Mark all read
              </button>
            </div>

            <div data-lenis-prevent className="max-h-[26rem] overflow-y-auto divide-y divide-white/5">
              {isLoadingRecent && recent.length === 0 ? (
                <div className="flex items-center justify-center py-10 text-white/60">
                  <Loader2 className="size-5 animate-spin" />
                </div>
              ) : recent.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                  <BellOff className="size-6 text-white/60" />
                  <p className="text-sm text-white/55">You&apos;re all caught up.</p>
                </div>
              ) : (
                recent.map((n) => (
                  <NotificationRow
                    key={n.id}
                    notification={n}
                    compact
                    onOpen={() => {
                      if (!n.isRead) void markRead(n.id);
                      close();
                    }}
                    onDelete={(item) => void removeNotification(item.id)}
                  />
                ))
              )}
            </div>

            <Link
              href="/notifications"
              className="block border-t border-white/10 px-4 py-3 text-center text-sm font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white"
            >
              View all notifications
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
