"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence } from "framer-motion";
import { ArrowLeft, Loader2, MessageCircle } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { ProfileMedia } from "@/components/shared/profile-media";
import { MessageBubble } from "@/components/chat/message-bubble";
import { TypingIndicator } from "@/components/chat/typing-indicator";
import { MessageInput } from "@/components/chat/message-input";
import { EmptyState } from "@/components/shared/empty-state";
import { SafetyMenu } from "@/components/platform/safety-menu";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useChatSocket } from "@/components/chat/socket-provider";
import { getConversations, getMessages } from "@/lib/api/conversations";
import { markMessageRead } from "@/lib/api/messages";
import { getInitials } from "@/lib/format";
import { ApiClientError } from "@/lib/api-client";
import type { ChatMessage, PublicProfile } from "@/types/api";

export function ChatView() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useRequireAuth();
  const { socket, onlineUserIds } = useChatSocket();

  const [otherUser, setOtherUser] = useState<PublicProfile | null>(null);
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [page, setPage] = useState(1);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isTypingOther, setIsTypingOther] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingScrollRef = useRef<"bottom" | null>(null);
  const readMessageIdsRef = useRef<Set<string>>(new Set());
  const otherUserIdRef = useRef<string | null>(null);
  otherUserIdRef.current = otherUser?.id ?? null;

  // --- initial load: who the other participant is + the latest page of messages ---
  useEffect(() => {
    if (!user || !conversationId) return;
    let active = true;

    async function load() {
      try {
        const [conversationsRes, messagesRes] = await Promise.all([
          getConversations(),
          getMessages(conversationId, 1, 30),
        ]);
        if (!active) return;

        const match = conversationsRes.conversations.find(
          (c) => c.conversationId === conversationId,
        );
        if (!match) {
          setNotFound(true);
          return;
        }

        setOtherUser(match.user);
        setMessages(messagesRes.messages);
        setHasMoreHistory(messagesRes.pagination.hasMore);
        setPage(1);
        pendingScrollRef.current = "bottom";
      } catch (err) {
        if (!active) return;
        if (err instanceof ApiClientError && (err.status === 403 || err.status === 404)) {
          setNotFound(true);
        } else {
          setError(
            err instanceof ApiClientError ? err.message : "Couldn't load this conversation.",
          );
        }
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [user, conversationId]);

  // --- scroll to bottom exactly when a message was appended (not prepended) ---
  useEffect(() => {
    if (pendingScrollRef.current === "bottom" && scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      pendingScrollRef.current = null;
    }
  }, [messages]);

  const appendMessage = useCallback((message: ChatMessage) => {
    setMessages((prev) => {
      if (!prev || prev.some((m) => m.id === message.id)) return prev;
      pendingScrollRef.current = "bottom";
      return [...prev, message];
    });
  }, []);

  // --- join/leave the conversation's socket room ---
  useEffect(() => {
    if (!socket || !conversationId) return;
    socket.emit("join_conversation", { conversationId });
    return () => {
      socket.emit("leave_conversation", { conversationId });
    };
  }, [socket, conversationId]);

  // --- mark incoming unread messages as read while this chat is open ---
  const markUnreadFromOther = useCallback(
    (list: ChatMessage[]) => {
      if (!user) return;
      for (const message of list) {
        if (
          message.receiverId === user.id &&
          !message.isRead &&
          !readMessageIdsRef.current.has(message.id)
        ) {
          readMessageIdsRef.current.add(message.id);
          markMessageRead(message.id).catch(() => {
            readMessageIdsRef.current.delete(message.id);
          });
        }
      }
    },
    [user],
  );

  useEffect(() => {
    if (messages) markUnreadFromOther(messages);
  }, [messages, markUnreadFromOther]);

  // --- live socket events for this conversation ---
  useEffect(() => {
    if (!socket || !user || !conversationId) return;

    function handleReceived({ message }: { message: ChatMessage }) {
      if (message.conversationId !== conversationId) return;
      appendMessage(message);
      setIsTypingOther(false);
      markUnreadFromOther([message]);
    }

    function handleSent({ message }: { message: ChatMessage }) {
      if (message.conversationId !== conversationId) return;
      appendMessage(message);
    }

    function handleTyping(payload: { conversationId: string; userId: string }) {
      if (payload.conversationId === conversationId && payload.userId === otherUserIdRef.current) {
        setIsTypingOther(true);
      }
    }

    function handleStoppedTyping(payload: { conversationId: string; userId: string }) {
      if (payload.conversationId === conversationId && payload.userId === otherUserIdRef.current) {
        setIsTypingOther(false);
      }
    }

    function handleMessageRead(payload: { messageId: string; conversationId: string }) {
      if (payload.conversationId !== conversationId) return;
      setMessages((prev) =>
        prev ? prev.map((m) => (m.id === payload.messageId ? { ...m, isRead: true } : m)) : prev,
      );
    }

    socket.on("message_received", handleReceived);
    socket.on("message_sent", handleSent);
    socket.on("user_typing", handleTyping);
    socket.on("user_stopped_typing", handleStoppedTyping);
    socket.on("message_read", handleMessageRead);

    return () => {
      socket.off("message_received", handleReceived);
      socket.off("message_sent", handleSent);
      socket.off("user_typing", handleTyping);
      socket.off("user_stopped_typing", handleStoppedTyping);
      socket.off("message_read", handleMessageRead);
    };
  }, [socket, user, conversationId, appendMessage, markUnreadFromOther]);

  async function handleLoadMore() {
    const el = scrollRef.current;
    if (!el || isLoadingMore || !hasMoreHistory) return;

    setIsLoadingMore(true);
    const prevScrollHeight = el.scrollHeight;
    const prevScrollTop = el.scrollTop;

    try {
      const nextPage = page + 1;
      const res = await getMessages(conversationId, nextPage, 30);
      setMessages((prev) => (prev ? [...res.messages, ...prev] : res.messages));
      setPage(nextPage);
      setHasMoreHistory(res.pagination.hasMore);

      requestAnimationFrame(() => {
        if (!scrollRef.current) return;
        const newScrollHeight = scrollRef.current.scrollHeight;
        scrollRef.current.scrollTop = newScrollHeight - prevScrollHeight + prevScrollTop;
      });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Couldn't load earlier messages.");
    } finally {
      setIsLoadingMore(false);
    }
  }

  function handleSend(content: string) {
    if (!socket) {
      setError("Not connected. Please refresh and try again.");
      return;
    }

    socket.emit("send_message", { conversationId, content }, (ack) => {
      if (ack.success && ack.message) {
        appendMessage(ack.message);
      } else {
        setError(ack.error ?? "Couldn't send message.");
      }
    });
  }

  function handleTypingStart() {
    socket?.emit("typing_start", { conversationId });
  }

  function handleTypingStop() {
    socket?.emit("typing_stop", { conversationId });
  }

  if (isAuthLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="size-6 animate-spin text-white/50" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-28 sm:px-6">
        <EmptyState
          icon={MessageCircle}
          title="Conversation not found"
          description="This conversation doesn't exist, or you don't have access to it."
          actionLabel="Back to messages"
          actionHref="/messages"
        />
      </div>
    );
  }

  const isOnline = otherUser ? onlineUserIds.has(otherUser.id) : false;

  return (
    <div className="mx-auto flex h-svh max-w-2xl flex-col pt-20 sm:pt-24">
      <div className="glass sticky top-20 z-10 flex shrink-0 items-center gap-3 px-4 py-3 sm:top-24 sm:px-6">
        <Link
          href="/messages"
          aria-label="Back to messages"
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/5 hover:text-white"
        >
          <ArrowLeft className="size-4" />
        </Link>

        {otherUser ? (
          <>
            <ProfileMedia
              src={otherUser.profileImage}
              initials={getInitials(otherUser.fullName)}
              thumb
              className="size-10 shrink-0 rounded-full text-sm"
            />
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-semibold text-white">
                {otherUser.fullName}
              </p>
              <p className={`flex items-center gap-1.5 text-xs ${isOnline ? "text-accent" : "text-white/60"}`}>
                <span className={`size-1.5 rounded-full ${isOnline ? "bg-accent" : "bg-white/30"}`} />
                {isOnline ? "Online" : "Offline"}
              </p>
            </div>
            <SafetyMenu
              userId={otherUser.id}
              userName={otherUser.fullName}
              conversationId={conversationId}
              onBlocked={() => router.push("/messages")}
              className="ml-auto"
            />
          </>
        ) : (
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-full" />
            <Skeleton className="h-4 w-28" />
          </div>
        )}
      </div>

      {error && (
        <div className="shrink-0 px-4 pt-3 sm:px-6">
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      )}

      <div
        ref={scrollRef}
        tabIndex={0}
        aria-label="Conversation"
        className="flex-1 space-y-3 overflow-y-auto px-4 py-4 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring sm:px-6"
      >
        {messages === null ? (
          <MessageAreaSkeleton />
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={MessageCircle}
              title="No messages yet"
              description={`Say hello to ${otherUser?.fullName ?? "your match"} and start the conversation.`}
            />
          </div>
        ) : (
          <>
            {hasMoreHistory && (
              <div className="flex justify-center pb-2">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={isLoadingMore}
                  className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium text-white/60 transition-colors hover:bg-white/10 disabled:opacity-50"
                >
                  {isLoadingMore && <Loader2 className="size-3 animate-spin" />}
                  {isLoadingMore ? "Loading..." : "Load earlier messages"}
                </button>
              </div>
            )}
            <AnimatePresence initial={false}>
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} isOwn={message.senderId === user?.id} />
              ))}
            </AnimatePresence>
            <AnimatePresence>{isTypingOther && <TypingIndicator />}</AnimatePresence>
          </>
        )}
      </div>

      <div className="shrink-0">
        <MessageInput
          onSend={handleSend}
          onTypingStart={handleTypingStart}
          onTypingStop={handleTypingStop}
          disabled={!socket}
        />
      </div>
    </div>
  );
}

function MessageAreaSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="ml-auto h-10 w-2/5 rounded-2xl" />
      <Skeleton className="h-14 w-1/2 rounded-2xl" />
      <Skeleton className="ml-auto h-10 w-1/3 rounded-2xl" />
      <Skeleton className="h-10 w-3/5 rounded-2xl" />
    </div>
  );
}
