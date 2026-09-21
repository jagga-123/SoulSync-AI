import type { ChatMessage, MessageType } from "./api";

export interface SendMessagePayload {
  conversationId: string;
  content: string;
  type?: MessageType;
}

export interface SendMessageAck {
  success: boolean;
  message?: ChatMessage;
  error?: string;
}

export interface ConversationRoomPayload {
  conversationId: string;
}

/** Client -> Server */
export interface ClientToServerEvents {
  join_conversation: (payload: ConversationRoomPayload) => void;
  leave_conversation: (payload: ConversationRoomPayload) => void;
  send_message: (payload: SendMessagePayload, ack?: (response: SendMessageAck) => void) => void;
  typing_start: (payload: ConversationRoomPayload) => void;
  typing_stop: (payload: ConversationRoomPayload) => void;
}

/** Server -> Client */
export interface ServerToClientEvents {
  message_received: (payload: { message: ChatMessage }) => void;
  message_sent: (payload: { message: ChatMessage }) => void;
  user_typing: (payload: { conversationId: string; userId: string }) => void;
  user_stopped_typing: (payload: { conversationId: string; userId: string }) => void;
  message_read: (payload: { messageId: string; conversationId: string; readAt: string }) => void;
  user_online: (payload: { userId: string }) => void;
  user_offline: (payload: { userId: string }) => void;
  error: (payload: { message: string }) => void;
}
