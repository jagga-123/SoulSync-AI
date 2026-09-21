"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { io, type Socket } from "socket.io-client";

import { getCurrentUser } from "@/lib/api/auth";
import { ApiClientError } from "@/lib/api-client";
import {
  deleteNotification, getNotifications, getUnreadCount, getUserFeatures, markAllNotificationsRead, markNotificationRead,
} from "@/lib/api/platform";
import { clearToken, getToken } from "@/lib/auth-storage";
import { SOCKET_URL } from "@/lib/env";
import { NotificationToaster } from "@/components/platform/notification-toaster";
import type { AuthUser } from "@/types/api";
import type { AppNotification, UserFeatures } from "@/types/platform";

interface PlatformContextValue {
  /** The signed-in user, once known. `null` while loading or signed out. */
  user: AuthUser | null;
  isAuthed: boolean;
  features: UserFeatures | null;
  refreshFeatures: () => Promise<void>;
  signOut: () => void;

  unreadCount: number;
  recent: AppNotification[];
  isLoadingRecent: boolean;
  loadRecent: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  removeNotification: (id: string) => Promise<void>;
  /** Called by the notifications page after it loads/changes items, to keep the badge honest. */
  setUnreadCount: (count: number) => void;

  toasts: Array<{ id: string; notification: AppNotification }>;
  dismissToast: (id: string) => void;
}

const noop = async () => {};
const PlatformContext = createContext<PlatformContextValue>({
  user: null, isAuthed: false, features: null, refreshFeatures: noop, signOut: () => {},
  unreadCount: 0, recent: [], isLoadingRecent: false, loadRecent: noop, markRead: noop, markAllRead: noop,
  removeNotification: noop, setUnreadCount: () => {}, toasts: [], dismissToast: () => {},
});

export const usePlatform = () => useContext(PlatformContext);

interface NotificationEvent {
  notification: AppNotification;
  unreadCount: number;
}

const TOAST_MS = 6000;
const MAX_TOASTS = 3;

/**
 * App-wide state for a signed-in visitor: who they are, their plan and perks,
 * and the live notification stream. It's mounted once in the root layout and
 * follows the stored token — sign in, sign out, or an expired session — so the
 * navbar bell works on every page without each page wiring up sockets.
 */
export function PlatformProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [token, setTokenState] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [features, setFeatures] = useState<UserFeatures | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [recent, setRecent] = useState<AppNotification[]>([]);
  const [isLoadingRecent, setIsLoadingRecent] = useState(false);
  const [toasts, setToasts] = useState<PlatformContextValue["toasts"]>([]);
  const socketRef = useRef<Socket | null>(null);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  // Follow the stored token: it changes on login/logout, which happen client-side
  // (a route change), and in other tabs (the `storage` event).
  useEffect(() => {
    const next = getToken();
    setTokenState((prev) => (prev === next ? prev : next));
  }, [pathname]);
  useEffect(() => {
    const onStorage = () => setTokenState(getToken());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const reset = useCallback(() => {
    setUser(null);
    setFeatures(null);
    setUnreadCount(0);
    setRecent([]);
    setToasts([]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback(
    (notification: AppNotification) => {
      // A merged notification ("3 new messages") replaces its earlier toast instead of stacking.
      const id = `${notification.id}:${notification.updatedAt}`;
      setToasts((prev) => [...prev.filter((t) => t.notification.id !== notification.id), { id, notification }].slice(-MAX_TOASTS));
      timers.current.set(id, setTimeout(() => dismissToast(id), TOAST_MS));
    },
    [dismissToast],
  );

  const refreshFeatures = useCallback(async () => {
    try {
      setFeatures(await getUserFeatures());
    } catch {
      /* the page that needs it shows its own error */
    }
  }, []);

  // Load identity + features and open the notification socket whenever the session changes.
  useEffect(() => {
    if (!token) {
      reset();
      return;
    }
    let active = true;

    getCurrentUser()
      .then(({ user }) => {
        if (active) setUser(user);
      })
      .catch((err) => {
        // Expired, revoked or suspended session: drop it, exactly like the route guards do. Anything
        // else (offline, a 5xx, a navigation aborting the request) must NOT log the person out.
        if (active && err instanceof ApiClientError && (err.status === 401 || err.status === 403)) {
          clearToken();
          setTokenState(null);
        }
      });
    getUserFeatures().then((f) => active && setFeatures(f)).catch(() => {});
    getUnreadCount().then((r) => active && setUnreadCount(r.unreadCount)).catch(() => {});

    const socket = io(SOCKET_URL, { auth: { token, purpose: "notifications" }, transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("notification", ({ notification, unreadCount: count }: NotificationEvent) => {
      setUnreadCount(count);
      setRecent((prev) => [notification, ...prev.filter((n) => n.id !== notification.id)].slice(0, 30));
      pushToast(notification);
    });
    socket.on("notification_count", ({ unreadCount: count }: { unreadCount: number }) => setUnreadCount(count));

    return () => {
      active = false;
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, reset, pushToast]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const loadRecent = useCallback(async () => {
    setIsLoadingRecent(true);
    try {
      const page = await getNotifications({ limit: 8 });
      setRecent(page.notifications);
      setUnreadCount(page.unreadCount);
    } catch {
      /* keep whatever we had */
    } finally {
      setIsLoadingRecent(false);
    }
  }, []);

  const reconcileCount = useCallback(async () => {
    try {
      setUnreadCount((await getUnreadCount()).unreadCount);
    } catch {
      /* ignore */
    }
  }, []);

  const markRead = useCallback(
    async (id: string) => {
      setRecent((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
      await markNotificationRead(id).catch(() => {});
      await reconcileCount();
    },
    [reconcileCount],
  );

  const markAllRead = useCallback(async () => {
    setRecent((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
    await markAllNotificationsRead().catch(() => {});
    await reconcileCount();
  }, [reconcileCount]);

  const removeNotification = useCallback(
    async (id: string) => {
      setRecent((prev) => prev.filter((n) => n.id !== id));
      await deleteNotification(id).catch(() => {});
      await reconcileCount();
    },
    [reconcileCount],
  );

  const signOut = useCallback(() => {
    clearToken();
    setTokenState(null);
    reset();
  }, [reset]);

  const value = useMemo<PlatformContextValue>(
    () => ({
      user, isAuthed: Boolean(token), features, refreshFeatures, signOut, unreadCount, recent, isLoadingRecent, loadRecent,
      markRead, markAllRead, removeNotification, setUnreadCount, toasts, dismissToast,
    }),
    [user, token, features, refreshFeatures, signOut, unreadCount, recent, isLoadingRecent, loadRecent, markRead, markAllRead, removeNotification, toasts, dismissToast],
  );

  return (
    <PlatformContext.Provider value={value}>
      {children}
      <NotificationToaster />
    </PlatformContext.Provider>
  );
}
