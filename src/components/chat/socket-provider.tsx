"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { io, type Socket } from "socket.io-client";
import { SOCKET_URL } from "@/lib/env";
import { getToken } from "@/lib/auth-storage";
import type { ClientToServerEvents, ServerToClientEvents } from "@/types/socket";

export type ChatSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface SocketContextValue {
  socket: ChatSocket | null;
  isConnected: boolean;
  onlineUserIds: Set<string>;
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  isConnected: false,
  onlineUserIds: new Set(),
});

/**
 * Owns a single Socket.IO connection for the whole /messages route
 * subtree (mounted by app/messages/layout.tsx) — the conversation list and
 * an open chat share one connection rather than each opening their own.
 */
export function SocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<ChatSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const token = getToken();
    if (!token) return;

    const s: ChatSocket = io(SOCKET_URL, {
      auth: { token },
      transports: ["websocket", "polling"],
    });

    function handleConnect() {
      setIsConnected(true);
    }
    function handleDisconnect() {
      setIsConnected(false);
    }
    function handleOnline({ userId }: { userId: string }) {
      setOnlineUserIds((prev) => {
        const next = new Set(prev);
        next.add(userId);
        return next;
      });
    }
    function handleOffline({ userId }: { userId: string }) {
      setOnlineUserIds((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }

    s.on("connect", handleConnect);
    s.on("disconnect", handleDisconnect);
    s.on("user_online", handleOnline);
    s.on("user_offline", handleOffline);

    setSocket(s);

    return () => {
      s.off("connect", handleConnect);
      s.off("disconnect", handleDisconnect);
      s.off("user_online", handleOnline);
      s.off("user_offline", handleOffline);
      s.disconnect();
      setSocket(null);
      setIsConnected(false);
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socket, isConnected, onlineUserIds }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useChatSocket() {
  return useContext(SocketContext);
}
