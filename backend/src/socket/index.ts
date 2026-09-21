import type { Server as HttpServer } from "node:http";
import { Server as SocketIOServer, type Socket } from "socket.io";
import { allowedOrigins } from "../config/env";
import { verifyToken } from "../utils/jwt";
import { Conversation } from "../models/Conversation.model";
import { User } from "../models/User.model";
import { socketConnections } from "../platform/metrics";
import { ApiError } from "../utils/ApiError";
import * as messageService from "../services/message.service";
import { assertParticipant } from "../services/conversation.service";
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from "./types";

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

let io: AppServer | null = null;

// userId -> set of connected socket ids (a user can have several tabs/devices).
const onlineUsers = new Map<string, Set<string>>();

export function getIO(): AppServer | null {
  return io;
}

export function isUserOnline(userId: string): boolean {
  return (onlineUsers.get(userId)?.size ?? 0) > 0;
}

export function personalRoom(userId: string): string {
  return `user:${userId}`;
}

function conversationRoom(conversationId: string): string {
  return `conversation:${conversationId}`;
}

/** True if any of the user's sockets currently has this conversation open —
 * used to avoid notifying someone about a message they're looking at. */
export async function isUserViewingConversation(userId: string, conversationId: string): Promise<boolean> {
  if (!io) return false;
  const sockets = await io.in(conversationRoom(conversationId)).fetchSockets();
  return sockets.some((socket) => socket.data.userId === userId);
}

/** Drops every connection a user has (suspension, deletion). */
export function disconnectUser(userId: string): void {
  io?.in(personalRoom(userId)).disconnectSockets(true);
}

export function initSocket(server: HttpServer): AppServer {
  io = new SocketIOServer(server, {
    cors: {
      origin: allowedOrigins,
    },
  });

  io.use(async (socket, next) => {
    const token =
      (socket.handshake.auth?.token as string | undefined) ??
      (socket.handshake.query?.token as string | undefined);

    if (!token) {
      next(new Error("Authentication required"));
      return;
    }

    try {
      const payload = verifyToken(token);

      // A valid JWT isn't enough: the account must still exist and be in good
      // standing, or a suspended/deleted user could keep a live socket.
      const user = await User.findById(payload.id).select("status");
      if (!user || user.status === "suspended") {
        next(new Error("Invalid or expired session"));
        return;
      }

      socket.data.userId = payload.id;
      if (socket.handshake.auth?.purpose === "notifications") socket.data.purpose = "notifications";
      next();
    } catch {
      next(new Error("Invalid or expired session"));
    }
  });

  io.on("connection", (socket) => handleConnection(socket));

  return io;
}

function handleConnection(socket: AppSocket): void {
  const userId = socket.data.userId;
  const notificationsOnly = socket.data.purpose === "notifications";
  socketConnections.inc();

  socket.join(personalRoom(userId));

  if (!notificationsOnly) {
    const wasOffline = !isUserOnline(userId);
    addSocket(userId, socket.id);
    if (wasOffline) {
      void broadcastPresence(userId, "user_online");
    }
  }

  socket.on("join_conversation", async ({ conversationId }) => {
    try {
      const conversation = await assertParticipant(conversationId, userId);
      socket.join(conversationRoom(conversationId));

      // `user_online`/`user_offline` are transition events (fired on
      // connect/disconnect), so a partner who was already online before
      // this socket connected would otherwise never be reported. Sync
      // their current state once, right when the chat is opened.
      const otherId = conversation.participants
        .find((p) => p.toString() !== userId)
        ?.toString();
      if (otherId) {
        socket.emit(isUserOnline(otherId) ? "user_online" : "user_offline", { userId: otherId });
      }
    } catch (err) {
      socket.emit("error", {
        message: err instanceof ApiError ? err.message : "Couldn't join conversation",
      });
    }
  });

  socket.on("leave_conversation", ({ conversationId }) => {
    socket.leave(conversationRoom(conversationId));
  });

  socket.on("typing_start", ({ conversationId }) => {
    socket.to(conversationRoom(conversationId)).emit("user_typing", { conversationId, userId });
  });

  socket.on("typing_stop", ({ conversationId }) => {
    socket
      .to(conversationRoom(conversationId))
      .emit("user_stopped_typing", { conversationId, userId });
  });

  socket.on("send_message", async (payload, ack) => {
    try {
      const message = await messageService.sendMessage(userId, {
        conversationId: payload.conversationId,
        content: payload.content,
        type: payload.type ?? "text",
      });

      io?.to(personalRoom(message.receiverId)).emit("message_received", { message });
      io?.to(personalRoom(message.senderId)).emit("message_sent", { message });

      ack?.({ success: true, message });
    } catch (err) {
      ack?.({
        success: false,
        error: err instanceof ApiError ? err.message : "Couldn't send message",
      });
    }
  });

  socket.on("disconnect", () => {
    socketConnections.dec();
    if (notificationsOnly) return;

    removeSocket(userId, socket.id);
    if (!isUserOnline(userId)) {
      void broadcastPresence(userId, "user_offline");
    }
  });
}

function addSocket(userId: string, socketId: string): void {
  const set = onlineUsers.get(userId) ?? new Set<string>();
  set.add(socketId);
  onlineUsers.set(userId, set);
}

function removeSocket(userId: string, socketId: string): void {
  const set = onlineUsers.get(userId);
  if (!set) return;
  set.delete(socketId);
  if (set.size === 0) onlineUsers.delete(userId);
}

/** Notifies only the people `userId` actually has a conversation with —
 * not a global broadcast — since presence only matters to chat partners. */
async function broadcastPresence(
  userId: string,
  event: "user_online" | "user_offline",
): Promise<void> {
  if (!io) return;

  const conversations = await Conversation.find({ participants: userId }).select("participants");
  const notified = new Set<string>();

  for (const conversation of conversations) {
    for (const participant of conversation.participants) {
      const otherId = participant.toString();
      if (otherId === userId || notified.has(otherId)) continue;
      notified.add(otherId);
      io.to(personalRoom(otherId)).emit(event, { userId });
    }
  }
}
