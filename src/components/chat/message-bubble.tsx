"use client";

import { motion } from "framer-motion";
import { Check, CheckCheck } from "lucide-react";
import { formatClockTime } from "@/lib/format";
import type { ChatMessage } from "@/types/api";

interface MessageBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
}

export function MessageBubble({ message, isOwn }: MessageBubbleProps) {
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[78%] rounded-2xl px-4 py-2.5 sm:max-w-[65%] ${
          isOwn
            ? "rounded-br-md bg-gradient-brand text-white"
            : "glass rounded-bl-md text-white/90"
        }`}
      >
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
          {message.content}
        </p>
        <div
          className={`mt-1 flex items-center gap-1 ${isOwn ? "justify-end" : "justify-start"}`}
        >
          <span className={`text-xs ${isOwn ? "text-white/70" : "text-white/60"}`}>
            {formatClockTime(message.createdAt)}
          </span>
          {isOwn &&
            (message.isRead ? (
              <CheckCheck className="size-3.5 text-accent" aria-label="Read" />
            ) : (
              <Check className="size-3.5 text-white/60" aria-label="Sent" />
            ))}
        </div>
      </div>
    </motion.div>
  );
}
