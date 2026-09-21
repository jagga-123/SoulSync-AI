"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Loader2, MessageCircle } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { ConversationListItem } from "@/components/chat/conversation-list-item";
import { EmptyState } from "@/components/shared/empty-state";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useChatSocket } from "@/components/chat/socket-provider";
import { getConversations } from "@/lib/api/conversations";
import { ApiClientError } from "@/lib/api-client";
import type { ChatMessage, ConversationListItem as ConversationListItemType } from "@/types/api";

function ConversationListSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="glass flex items-center gap-4 rounded-2xl p-4">
          <Skeleton className="size-14 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ConversationsView() {
  const { user, isLoading: isAuthLoading } = useRequireAuth();
  const { socket } = useChatSocket();

  const [conversations, setConversations] = useState<ConversationListItemType[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadConversations = useCallback(async () => {
    try {
      const res = await getConversations();
      setConversations(res.conversations);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Couldn't load your conversations.");
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    loadConversations();
  }, [user, loadConversations]);

  useEffect(() => {
    if (!socket || !user) return;

    function bumpConversation(conversationId: string, content: string, incrementUnread: boolean) {
      setConversations((prev) => {
        if (!prev) return prev;
        const idx = prev.findIndex((c) => c.conversationId === conversationId);
        if (idx === -1) {
          // A conversation we don't have locally yet — simplest correct
          // fix is a refetch rather than trying to synthesize the entry.
          void loadConversations();
          return prev;
        }
        const current = prev[idx];
        if (!current) return prev;
        const updated: ConversationListItemType = {
          ...current,
          lastMessage: content,
          lastMessageAt: new Date().toISOString(),
          unreadCount: incrementUnread ? current.unreadCount + 1 : current.unreadCount,
        };
        const next = prev.filter((_, i) => i !== idx);
        next.unshift(updated);
        return next;
      });
    }

    function handleReceived({ message }: { message: ChatMessage }) {
      bumpConversation(message.conversationId, message.content, true);
    }
    function handleSent({ message }: { message: ChatMessage }) {
      bumpConversation(message.conversationId, message.content, false);
    }

    socket.on("message_received", handleReceived);
    socket.on("message_sent", handleSent);

    return () => {
      socket.off("message_received", handleReceived);
      socket.off("message_sent", handleSent);
    };
  }, [socket, user, loadConversations]);

  if (isAuthLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="size-6 animate-spin text-white/50" />
      </div>
    );
  }

  return (
    <div className="relative mx-auto max-w-2xl px-4 py-28 sm:px-6">
      <div className="text-center">
        <h1 className="font-display text-3xl font-semibold text-white sm:text-4xl">Messages</h1>
        <p className="mx-auto mt-3 max-w-md text-pretty text-white/55">
          Conversations with people you&apos;ve matched with.
        </p>
      </div>

      {error && (
        <Alert variant="destructive" className="mx-auto mt-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="mt-8 space-y-3">
        {conversations === null ? (
          <ConversationListSkeleton />
        ) : conversations.length === 0 ? (
          <EmptyState
            icon={MessageCircle}
            title="No conversations yet"
            description="Match with someone and start a conversation from their match card."
            actionLabel="View matches"
            actionHref="/matches"
          />
        ) : (
          <AnimatePresence initial={false}>
            {conversations.map((item) => (
              <ConversationListItem key={item.conversationId} item={item} />
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
