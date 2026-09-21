import type { MessageType } from "../models/Message.model";

export interface SerializedMessage {
  id: string;
  conversationId: string;
  senderId: string;
  receiverId: string;
  content: string;
  type: MessageType;
  isRead: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SendMessagePayload {
  conversationId: string;
  content: string;
  type?: MessageType;
}

export interface SendMessageAck {
  success: boolean;
  message?: SerializedMessage;
  error?: string;
}

export interface ConversationRoomPayload {
  conversationId: string;
}

/** Client -> Server. Matches the Phase 4 spec's event list exactly. */
export interface ClientToServerEvents {
  join_conversation: (payload: ConversationRoomPayload) => void;
  leave_conversation: (payload: ConversationRoomPayload) => void;
  send_message: (payload: SendMessagePayload, ack?: (response: SendMessageAck) => void) => void;
  typing_start: (payload: ConversationRoomPayload) => void;
  typing_stop: (payload: ConversationRoomPayload) => void;
}

/**
 * Server -> Client. Includes the spec's five events plus `user_online` /
 * `user_offline` (needed for the explicitly-required "Online Status"
 * feature, which has no event of its own in the given list) and a generic
 * `error` for silently-rejected client actions (e.g. joining a conversation
 * you're not part of).
 */
/** A notification as sent over the wire and returned by the REST API. */
export interface SerializedNotification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ServerToClientEvents {
  // Phase 6 — real-time notifications.
  notification: (payload: { notification: SerializedNotification; unreadCount: number }) => void;
  /** Sent after a read/delete so every open tab converges on the same badge. */
  notification_count: (payload: { unreadCount: number }) => void;
  message_received: (payload: { message: SerializedMessage }) => void;
  message_sent: (payload: { message: SerializedMessage }) => void;
  user_typing: (payload: { conversationId: string; userId: string }) => void;
  user_stopped_typing: (payload: { conversationId: string; userId: string }) => void;
  message_read: (payload: { messageId: string; conversationId: string; readAt: string }) => void;
  user_online: (payload: { userId: string }) => void;
  user_offline: (payload: { userId: string }) => void;
  error: (payload: { message: string }) => void;
}

// Not used — single-instance server for this phase.
export type InterServerEvents = Record<string, never>;

export interface SocketData {
  userId: string;
  /** Notification-only connections (the app-wide bell) don't count as being
   * "online in chat" — presence still means "has the messages screen open". */
  purpose?: "notifications";
}
