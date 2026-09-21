import { apiFetch } from "@/lib/api-client";
import type { ConversationListItem, ConversationRecord, MessagesResult } from "@/types/api";

export function getConversations() {
  return apiFetch<{ conversations: ConversationListItem[] }>("/conversations");
}

export function getMessages(conversationId: string, page = 1, limit = 30) {
  return apiFetch<MessagesResult>(
    `/conversations/${conversationId}/messages?page=${page}&limit=${limit}`,
  );
}

export function startConversation(matchId: string) {
  return apiFetch<{ conversation: ConversationRecord }>(`/conversations/start/${matchId}`, {
    method: "POST",
  });
}
