"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MessageInputProps {
  onSend: (content: string) => void;
  onTypingStart: () => void;
  onTypingStop: () => void;
  disabled?: boolean;
}

const TYPING_STOP_DELAY_MS = 2000;

export function MessageInput({ onSend, onTypingStart, onTypingStop, disabled }: MessageInputProps) {
  const [value, setValue] = useState("");
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  function stopTypingNow() {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    if (isTypingRef.current) {
      isTypingRef.current = false;
      onTypingStop();
    }
  }

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setValue(event.target.value);

    if (!isTypingRef.current) {
      isTypingRef.current = true;
      onTypingStart();
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(stopTypingNow, TYPING_STOP_DELAY_MS);
  }

  function trySend() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue("");
    stopTypingNow();
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    trySend();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      trySend();
    }
  }

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2 border-t border-white/10 p-3 sm:p-4">
      <textarea
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={stopTypingNow}
        placeholder="Type a message..."
        rows={1}
        disabled={disabled}
        className="max-h-32 flex-1 resize-none rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-white placeholder:text-white/50 outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
      />
      <Button
        type="submit"
        size="icon"
        disabled={disabled || !value.trim()}
        aria-label="Send message"
        className="size-10 shrink-0 rounded-full bg-gradient-brand text-white shadow-lg shadow-primary/25 hover:opacity-90 disabled:opacity-40"
      >
        <Send className="size-4" />
      </Button>
    </form>
  );
}
