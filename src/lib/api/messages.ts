import { apiFetch } from "@/lib/api-client";
import type { ChatMessage, MessageType } from "@/types/api";

export function sendMessageRest(conversationId: string, content: string, type: MessageType = "text") {
  return apiFetch<{ message: ChatMessage }>("/messages/send", {
    method: "POST",
    body: { conversationId, content, type },
  });
}

export function markMessageRead(messageId: string) {
  return apiFetch<{ message: ChatMessage }>(`/messages/read/${messageId}`, { method: "POST" });
}
